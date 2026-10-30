import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, createAuthFixture, customerId, otherId, provision } from "./auth-fixture.ts";
import { backendModuleDependencies, resolveBackendModules } from "../../src/modules/registry.ts";
import { permissionDefinitions, rolePermissions } from "../../src/modules/access/permissions.ts";

// TEST ONLY: actual PostgreSQL functions/roles/ACLs with synthetic trusted claims.
// No native Auth/MFA validation, provider operations or multi-session concurrency.
let db: PGlite;
const adminId = "00000000-0000-4000-8000-000000000003";
const secondAdminId = "00000000-0000-4000-8000-000000000004";
const migration = "20261030012105_audit_view.sql";
let previousGrants: unknown[];
let previousPermissions: { id: string; module_id: string }[];
let previousFunctions: unknown[];
let previousRawSecurity: unknown[];
const rawSecuritySql = `select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,
  (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.policyname) from pg_catalog.pg_policies p where p.schemaname='shopthie_private' and p.tablename=c.relname) as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shopthie_private' and c.relkind='r' order by c.relname`;
const writersSql = `select n.nspname,p.proname,pg_get_functiondef(p.oid) as definition,p.proacl::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','shopthie_private') and p.proname in
  ('customer_lookup','shopthie_customer_lookup','customer_status_read','shopthie_customer_status_read',
   'customer_status_change','shopthie_customer_status_change','has_permission','customer_subject_writer_guard')
  order by n.nspname,p.proname`;

before(async () => {
  db = await createAuthFixture();
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const name of names.filter((name) => name < migration))
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  previousGrants = (
    await db.query(
      "select * from shopthie_private.app_role_permissions order by role_id,permission_id",
    )
  ).rows;
  previousPermissions = (
    await db.query<{ id: string; module_id: string }>(
      "select id,module_id from shopthie_private.app_permissions order by id",
    )
  ).rows;
  previousFunctions = (await db.query(writersSql)).rows;
  previousRawSecurity = (await db.query(rawSecuritySql)).rows;
  for (const name of names.filter((name) => name >= migration))
    await db.exec(await readFile(new URL(name, directory), "utf8"));
});
after(async () => {
  await db?.close();
});
async function isolated(work: () => Promise<void>) {
  await db.exec("begin");
  try {
    for (const id of [customerId, otherId, adminId, secondAdminId]) await provision(db, id);
    await db.exec(`update shopthie_private.app_user_roles set role_id='owner' where user_id='${customerId}';
      update shopthie_private.app_user_roles set role_id='admin' where user_id in ('${adminId}','${secondAdminId}');
      insert into auth.mfa_factors(user_id,status,factor_type) values
      ('${customerId}','verified','totp'),('${adminId}','verified','totp'),('${secondAdminId}','verified','totp');
      insert into shopthie_private.profiles(user_id,username) values ('${otherId}','Target_Name');`);
    await work();
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function actor(id: string | null = customerId, aal: unknown = "aal2") {
  await asActor(db, "authenticated", {
    sub: id,
    aal,
    user_metadata: { role: "owner", actor_id: customerId, scope: "all" },
    app_metadata: { role: "owner", permissions: ["audit.read"] },
  });
}
async function ready() {
  return (await db.query<{ value: boolean }>("select public.shopthie_audit_view_ready() as value"))
    .rows[0].value;
}
async function rejected(work: () => Promise<unknown>, code = "42501") {
  await db.exec("savepoint rejection");
  try {
    await assert.rejects(work, (error: unknown) => (error as { code?: string }).code === code);
  } finally {
    await db.exec("rollback to savepoint rejection;release savepoint rejection");
  }
}

type Event = {
  id: string;
  actorSubject: string;
  targetSubject: string | null;
  eventType: string;
  reason: string;
  outcome: string;
  createdAt: string;
};
type Page = {
  scope: "own" | "all";
  events: Event[];
  nextCursor: { createdAt: string; id: string } | null;
};
async function page(
  time: string | null = null,
  id: string | null = null,
  schema = "public.shopthie_",
): Promise<Page> {
  return (
    await db.query<{ value: Page }>(`select ${schema}audit_events($1,$2) as value`, [time, id])
  ).rows[0].value;
}
function eventId(n: number) {
  return `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
async function seed(
  n: number,
  actorSubject: string | null = adminId,
  eventType = "customer.lookup",
  reason = "account_access",
  outcome = "found",
  target: string | null = otherId,
  time = "2026-10-29T18:00:00.123456Z",
) {
  await db.query(
    `insert into shopthie_private.audit_events(id,actor_id,target_id,event_type,reason_category,outcome,created_at) values($1,$2,$3,$4,$5,$6,$7)`,
    [eventId(n), actorSubject, target, eventType, reason, outcome, time],
  );
}

test("readiness is self-only, current staff/AAL2/verified TOTP/capability gated", async () =>
  isolated(async () => {
    for (const id of [customerId, adminId]) {
      await actor(id);
      assert.equal(await ready(), true);
    }
    for (const [id, aal] of [
      [otherId, "aal2"],
      [null, "aal2"],
      [adminId, "aal1"],
      [adminId, null],
      [adminId, "aal3"],
    ] as const) {
      await actor(id, aal);
      assert.equal(await ready(), false);
    }
    await asActor(db, "anon");
    await rejected(ready);
    for (const statement of [
      "delete from auth.mfa_factors",
      "update auth.mfa_factors set status='unverified'",
      "update auth.mfa_factors set factor_type='phone'",
      `update shopthie_private.app_accounts set status='suspended' where user_id='${adminId}'`,
      `delete from shopthie_private.app_user_roles where user_id='${adminId}'`,
      `update shopthie_private.app_user_roles set role_id='customer' where user_id='${adminId}'`,
      "update shopthie_private.app_modules set enabled=false where id='audit_view'",
      "delete from shopthie_private.app_role_permissions where role_id='admin' and permission_id='audit.read'",
    ]) {
      await db.exec("reset role;savepoint authority");
      await db.exec(statement);
      await actor(adminId);
      assert.equal(await ready(), false, statement);
      await db.exec("reset role;rollback to savepoint authority;release savepoint authority");
    }
  }));

test("reader derives Admin own/Owner all scope from live membership, never claimed actors", async () =>
  isolated(async () => {
    await seed(1);
    await seed(2, customerId);
    await seed(3, secondAdminId);
    await actor(adminId);
    const own = await page();
    assert.deepEqual(own, {
      scope: "own",
      events: [
        {
          id: eventId(1),
          actorSubject: adminId,
          targetSubject: otherId,
          eventType: "customer.lookup",
          reason: "account_access",
          outcome: "found",
          createdAt: "2026-10-29T18:00:00.123456Z",
        },
      ],
      nextCursor: null,
    });
    assert.deepEqual(await page(null, null, "shopthie_private."), own);
    await rejected(
      () => db.query("select public.shopthie_audit_events(null,null,$1)", [customerId]),
      "42883",
    );
    await rejected(
      () =>
        db.query(
          "select public.shopthie_audit_events(p_before_time=>null,p_before_id=>null,p_actor=>null)",
        ),
      "42883",
    );
    await actor();
    assert.deepEqual(
      (await page()).events.map((row) => row.id),
      [3, 2, 1].map(eventId),
    );
    assert.equal((await page()).scope, "all");
    await db.exec(
      `reset role;update shopthie_private.app_user_roles set role_id='admin' where user_id='${customerId}'`,
    );
    await actor();
    assert.deepEqual(
      (await page()).events.map((row) => row.id),
      [eventId(2)],
    );
    assert.equal((await page()).scope, "own");
    await db.exec("reset role");
    assert.equal((await db.query("select * from shopthie_private.audit_events")).rows.length, 3);
  }));

test("reader filters unsupported/unsafe combinations and projects only exact safe fields", async () =>
  isolated(async () => {
    const expected: Event[] = [];
    let n = 0;
    for (const reason of ["account_access", "profile_help", "address_help"])
      for (const outcome of ["found", "not_found"]) {
        const target = outcome === "found" ? otherId : null;
        await seed(++n, adminId, "customer.lookup", reason, outcome, target);
        expected.unshift({
          id: eventId(n),
          actorSubject: adminId,
          targetSubject: target,
          eventType: "customer.lookup",
          reason,
          outcome,
          createdAt: "2026-10-29T18:00:00.123456Z",
        });
      }
    for (const reason of ["account_security", "customer_request", "account_review"])
      for (const [eventType, outcome] of [
        ["customer.status.read", "read"],
        ["customer.status.change", "active"],
        ["customer.status.change", "suspended"],
      ]) {
        await seed(++n, adminId, eventType, reason, outcome);
        expected.unshift({
          id: eventId(n),
          actorSubject: adminId,
          targetSubject: otherId,
          eventType,
          reason,
          outcome,
          createdAt: "2026-10-29T18:00:00.123456Z",
        });
      }
    for (const [eventType, reason, outcome, target, subject] of [
      ["unknown.future", "account_access", "found", otherId, adminId],
      ["customer.lookup", "pii@example.test", "found", otherId, adminId],
      ["customer.lookup", "account_review", "found", otherId, adminId],
      ["customer.lookup", "account_access", "found", null, adminId],
      ["customer.lookup", "account_access", "not_found", otherId, adminId],
      ["customer.lookup", "account_access", "found", otherId, null],
      ["customer.status.read", "account_security", "read", null, adminId],
      ["customer.status.read", "profile_help", "read", otherId, adminId],
      ["customer.status.read", "account_security", "suspended", otherId, adminId],
      ["customer.status.change", "account_review", "free text", otherId, adminId],
      ["customer.status.change", "account_review", "active", null, adminId],
      ["customer.status.change", "account_access", "active", otherId, adminId],
    ])
      await seed(++n, subject, eventType!, reason!, outcome!, target);
    for (const time of ["infinity", "-infinity", "10000-01-01T00:00:00Z", "0001-01-01 00:00:00 BC"])
      await seed(++n, adminId, "customer.lookup", "account_access", "found", otherId, time);
    await db.exec(`alter table shopthie_private.audit_events add column metadata jsonb default '{"email":"pii@example.test","phone":"secret","address":"private"}';
    alter table shopthie_private.audit_events add column reason_text text default 'private free text';`);
    await actor(adminId);
    assert.deepEqual(await page(), { scope: "own", events: expected, nextCursor: null });
    await actor();
    assert.deepEqual(await page(), { scope: "all", events: expected, nextCursor: null });
  }));

test("fixed 20+1 exclusive keyset preserves full microseconds/ties, scope and safe filtering across pages", async () =>
  isolated(async () => {
    const expected: { id: string; createdAt: string }[] = [];
    for (let n = 1; n <= 45; n++) {
      const createdAt = `2026-10-29T18:00:00.${n <= 23 ? "123456" : "123457"}Z`;
      await seed(n, adminId, "customer.lookup", "account_access", "found", otherId, createdAt);
      expected.unshift({ id: eventId(n), createdAt });
    }
    for (let n = 46; n <= 80; n++)
      await seed(
        n,
        secondAdminId,
        "customer.lookup",
        "account_access",
        "found",
        otherId,
        "2026-10-29T19:00:00.000001Z",
      );
    for (let n = 81; n <= 110; n++)
      await seed(
        n,
        adminId,
        "unknown.future",
        "private@example.test",
        "private",
        otherId,
        "2026-10-29T20:00:00.999999Z",
      );
    await db.exec("set local timezone='Pacific/Honolulu'");
    await actor(adminId);
    let cursor: Page["nextCursor"] = null;
    const seen: typeof expected = [];
    for (const [index, size] of [20, 20, 5].entries()) {
      const result = await page(cursor?.createdAt ?? null, cursor?.id ?? null);
      assert.equal(result.scope, "own");
      assert.equal(result.events.length, size);
      const tuples = result.events.map(({ id, createdAt }) => ({ id, createdAt }));
      assert.deepEqual(tuples, expected.slice(index * 20, index * 20 + size));
      assert.equal(
        result.events.every((row) => row.actorSubject === adminId),
        true,
      );
      assert.deepEqual(result.nextCursor, index < 2 ? tuples.at(-1) : null);
      seen.push(...tuples);
      cursor = result.nextCursor;
    }
    assert.deepEqual(seen, expected);
    assert.equal(new Set(seen.map((row) => row.id)).size, 45);
    assert.deepEqual(await page(expected.at(-1)!.createdAt, expected.at(-1)!.id), {
      scope: "own",
      events: [],
      nextCursor: null,
    });
    // Arbitrary well-formed bounds do not require a real visible row and never widen scope.
    const forged = await page("2026-10-29T18:00:00.123456Z", eventId(999));
    assert.equal(forged.scope, "own");
    assert.deepEqual(
      forged.events.map(({ id, createdAt }) => ({ id, createdAt })),
      expected.slice(22, 42),
    );
    assert.deepEqual(forged.nextCursor, {
      createdAt: "2026-10-29T18:00:00.123456Z",
      id: eventId(4),
    });
    await actor();
    const allExpected = [
      ...Array.from({ length: 35 }, (_, i) => ({
        id: eventId(80 - i),
        createdAt: "2026-10-29T19:00:00.000001Z",
      })),
      ...expected,
    ];
    const allSeen: typeof expected = [];
    cursor = null;
    for (let index = 0; index < 4; index++) {
      const result = await page(cursor?.createdAt ?? null, cursor?.id ?? null);
      const tuples = result.events.map(({ id, createdAt }) => ({ id, createdAt }));
      assert.equal(result.scope, "all");
      assert.equal(tuples.length, 20);
      assert.deepEqual(tuples, allExpected.slice(index * 20, index * 20 + 20));
      assert.deepEqual(result.nextCursor, index < 3 ? tuples.at(-1) : null);
      cursor = result.nextCursor;
      allSeen.push(...tuples);
    }
    assert.deepEqual(allSeen, allExpected);
    assert.equal(new Set(allSeen.map((row) => row.id)).size, 80);
  }));

test("cursor accepts only a canonical real UTC six-microsecond timestamp/UUID pair", async () =>
  isolated(async () => {
    await actor(adminId);
    for (const time of [
      "0001-01-01T00:00:00.000000Z",
      "2000-02-29T23:59:59.999999Z",
      "2024-02-29T00:00:00.000001Z",
      "9999-12-31T23:59:59.999999Z",
    ])
      assert.deepEqual(await page(time, eventId(1)), {
        scope: "own",
        events: [],
        nextCursor: null,
      });
    for (const [time, id] of [
      [null, eventId(1)],
      ["2026-10-29T18:00:00.123456Z", null],
      ["", eventId(1)],
      ...[
        "2026-10-29T18:00:00.123Z",
        "2026-10-29T18:00:00.1234567Z",
        "2026-10-29T18:00:00Z",
        "2026-10-29t18:00:00.123456z",
        "2026-10-29 18:00:00.123456Z",
        "2026-10-29T18:00:00.123456+00:00",
        " 2026-10-29T18:00:00.123456Z",
        "2026-10-29T18:00:00.123456Z\n",
        "2026-02-29T00:00:00.000000Z",
        "1900-02-29T00:00:00.000000Z",
        "2024-04-31T00:00:00.000000Z",
        "2026-13-01T00:00:00.000000Z",
        "2026-00-01T00:00:00.000000Z",
        "2026-01-00T00:00:00.000000Z",
        "2026-01-32T00:00:00.000000Z",
        "2026-10-29T24:00:00.000000Z",
        "2026-10-29T23:60:00.000000Z",
        "2026-10-29T23:59:60.000000Z",
        "0000-01-01T00:00:00.000000Z",
        "10000-01-01T00:00:00.000000Z",
        "infinity",
        "now",
        "yesterday",
        "2026-10-29T18:00:00.123456Z';drop table audit_events;--",
      ].map((time) => [time, eventId(1)]),
    ])
      await rejected(() => page(time, id), "22023");
    await rejected(() => page("2026-10-29T18:00:00.123456Z", "not-a-uuid"), "22P02");
  }));

test("exact 20 has no cursor without an eligible lookahead; empty scope stays empty", async () =>
  isolated(async () => {
    for (let n = 1; n <= 20; n++) await seed(n);
    await seed(21, adminId, "unknown.future");
    await seed(22, secondAdminId);
    await actor(adminId);
    assert.equal((await page()).events.length, 20);
    assert.equal((await page()).nextCursor, null);
    await actor();
    assert.equal((await page()).events.length, 20);
    assert.notEqual((await page()).nextCursor, null);
    await actor(secondAdminId);
    assert.equal((await page()).events.length, 1);
    await db.exec(
      `reset role;delete from shopthie_private.audit_events where actor_id='${secondAdminId}'`,
    );
    await actor(secondAdminId);
    assert.deepEqual(await page(), { scope: "own", events: [], nextCursor: null });
  }));

test("reader denies unauthorized and live-revoked identities before validating cursor data", async () =>
  isolated(async () => {
    await seed(1);
    for (const prefix of ["public.shopthie_", "shopthie_private."]) {
      await asActor(db, "anon");
      await rejected(() => page(null, null, prefix));
      for (const [id, aal] of [
        [otherId, "aal2"],
        [null, "aal2"],
        [adminId, "aal1"],
        [adminId, null],
        [adminId, "owner"],
      ] as const) {
        await actor(id, aal);
        await rejected(() => page("malformed", eventId(1), prefix));
      }
      for (const mutation of [
        "delete from auth.mfa_factors",
        "update auth.mfa_factors set status='unverified'",
        "update auth.mfa_factors set factor_type='phone'",
        `update shopthie_private.app_accounts set status='suspended' where user_id='${adminId}'`,
        `delete from shopthie_private.app_user_roles where user_id='${adminId}'`,
        `update shopthie_private.app_user_roles set role_id='customer' where user_id='${adminId}';insert into shopthie_private.app_role_permissions values('customer','audit.read')`,
        "update shopthie_private.app_modules set enabled=false where id='audit_view'",
        "delete from shopthie_private.app_role_permissions where role_id='admin' and permission_id='audit.read'",
        "update shopthie_private.app_modules set enabled=false where id='profiles';insert into shopthie_private.app_module_dependencies values('audit_view','profiles')",
      ]) {
        await db.exec("reset role;savepoint revocation");
        await db.exec(mutation);
        await actor(adminId);
        assert.equal(await ready(), false, mutation);
        await rejected(() => page("malformed", eventId(1), prefix));
        await db.exec("reset role;rollback to savepoint revocation;release savepoint revocation");
      }
    }
  }));

test("actor lock and return boundaries each recheck capability/current role (TEST-only gate interception)", async () =>
  isolated(async () => {
    await seed(1);
    for (const phase of [2, 3])
      for (const mutation of [
        "update shopthie_private.app_modules set enabled=false where id='audit_view'",
        `delete from shopthie_private.app_user_roles where user_id='${adminId}'`,
        `update shopthie_private.app_user_roles set role_id='owner' where user_id='${adminId}'`,
      ]) {
        await db.exec(`reset role;savepoint interception;
      alter function shopthie_private.audit_view_ready() rename to test_real_audit_view_ready;
      create sequence shopthie_private.test_gate_calls;
      create function shopthie_private.audit_view_ready() returns boolean
      language plpgsql volatile security definer set search_path='' as $$
      declare pass bigint;
      begin
        pass:=pg_catalog.nextval('shopthie_private.test_gate_calls');
        if pass=${phase} then ${mutation}; end if;
        -- For role-promotion interception, explicit role comparison must catch a
        -- scope change at return; post-lock role derivation uses the fresh role.
        return shopthie_private.test_real_audit_view_ready();
      end; $$;
      revoke all on function shopthie_private.audit_view_ready() from public,anon;
      grant execute on function shopthie_private.audit_view_ready() to authenticated;`);
        await actor(adminId);
        if (phase === 2 && mutation.includes("role_id='owner'"))
          assert.equal((await page()).scope, "all");
        else await rejected(() => page());
        await db.exec(
          "reset role;rollback to savepoint interception;release savepoint interception",
        );
      }
  }));

test("viewer/readiness perform zero audit writes, even with every audit mutation forbidden", async () =>
  isolated(async () => {
    await seed(1);
    const rows = (await db.query("select * from shopthie_private.audit_events order by id")).rows;
    await db.exec(`create function shopthie_private.test_no_audit_writes() returns trigger language plpgsql set search_path='' as $$
    begin raise exception using errcode='23514',message='TEST_NO_AUDIT_WRITES'; end; $$;
    create trigger test_no_audit_writes before insert or update or delete or truncate on shopthie_private.audit_events
    for each statement execute function shopthie_private.test_no_audit_writes();`);
    for (const id of [customerId, adminId]) {
      await actor(id);
      assert.equal(await ready(), true);
      await page();
      await page(null, null, "shopthie_private.");
    }
    await db.exec("reset role");
    assert.deepEqual(
      (await db.query("select * from shopthie_private.audit_events order by id")).rows,
      rows,
    );
  }));

test("disabling only viewer blocks both read paths but mandatory lookup/status audits still record", async () =>
  isolated(async () => {
    await db.exec("update shopthie_private.app_modules set enabled=false where id='audit_view'");
    await actor(adminId);
    assert.equal(await ready(), false);
    await rejected(() => page());
    await rejected(() => page(null, null, "shopthie_private."));
    await db.query("select public.shopthie_customer_lookup('target_name','profile_help')");
    await db.query("select public.shopthie_customer_status_read($1,'customer_request')", [otherId]);
    await db.query(
      "select public.shopthie_customer_status_change($1,'suspended',0,'account_security')",
      [otherId],
    );
    assert.equal(await ready(), false);
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select actor_id,event_type,reason_category,outcome from shopthie_private.audit_events order by event_type",
        )
      ).rows,
      [
        {
          actor_id: adminId,
          event_type: "customer.lookup",
          reason_category: "profile_help",
          outcome: "found",
        },
        {
          actor_id: adminId,
          event_type: "customer.status.change",
          reason_category: "account_security",
          outcome: "suspended",
        },
        {
          actor_id: adminId,
          event_type: "customer.status.read",
          reason_category: "customer_request",
          outcome: "read",
        },
      ],
    );
    for (const id of ["identity", "access", "audit"])
      await rejected(
        () => db.query("update shopthie_private.app_modules set enabled=false where id=$1", [id]),
        "23514",
      );
  }));

test("fixed-path auth-only invoker/definer signatures preserve all raw ACL/RLS and actor-only SHARE locking", async () =>
  isolated(async () => {
    assert.deepEqual((await db.query(rawSecuritySql)).rows, previousRawSecurity);
    const funcs = (
      await db.query<{
        name: string;
        definer: boolean;
        settings: string[];
        auth: boolean;
        anon: boolean;
        pub: boolean;
        volatility: string;
        args: string;
        result: string;
        definition: string;
      }>(`
    select n.nspname||'.'||p.proname as name,p.prosecdef as definer,p.proconfig as settings,p.provolatile as volatility,
      pg_get_function_identity_arguments(p.oid) as args,pg_get_function_result(p.oid) as result,
      has_function_privilege('authenticated',p.oid,'execute') as auth,has_function_privilege('anon',p.oid,'execute') as anon,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where grantee=0 and privilege_type='EXECUTE') as pub,
      pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
      (n.nspname='public' and p.proname in ('shopthie_audit_view_ready','shopthie_audit_events')) or
      (n.nspname='shopthie_private' and p.proname in ('audit_view_ready','audit_events'))`)
    ).rows;
    assert.equal(funcs.length, 4);
    for (const fn of funcs) {
      assert.deepEqual(fn.settings, ['search_path=""']);
      assert.equal(fn.auth, true);
      assert.equal(fn.anon, false);
      assert.equal(fn.pub, false);
      assert.equal(fn.definer, fn.name.startsWith("shopthie_private."));
      const reader = fn.name.endsWith("audit_events");
      assert.equal(fn.volatility, reader ? "v" : "s");
      assert.equal(fn.args, reader ? "p_before_time text, p_before_id uuid" : "");
      assert.equal(fn.result, reader ? "jsonb" : "boolean");
      if (reader && fn.definer) {
        assert.match(fn.definition, /where account.user_id=v_actor_id for share/i);
        assert.equal((fn.definition.match(/for share/gi) ?? []).length, 1);
        assert.doesNotMatch(
          fn.definition.replace(/--[^\n]*/g, ""),
          /for update|for no key update|for key share|\b(?:insert|update|delete|truncate)\b|\b(?:profiles|auth\.users)\b/i,
        );
        assert.match(fn.definition, /checked_role is distinct from actor_role/);
        assert.match(fn.definition, /order by e.created_at desc,e.id desc limit 21/);
        assert.doesNotMatch(fn.definition, /\boffset\b|\bcount\s*\(/i);
      }
    }
    for (const role of ["anon", "authenticated"] as const) {
      await asActor(db, role, { sub: adminId, aal: "aal2" });
      for (const sql of [
        "select * from shopthie_private.audit_events",
        "insert into shopthie_private.audit_events(event_type,outcome) values('forged','read')",
        "update shopthie_private.audit_events set outcome='forged'",
        "delete from shopthie_private.audit_events",
        "truncate shopthie_private.audit_events",
      ])
        await rejected(() => db.exec(sql));
      await db.exec("reset role");
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"])
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select has_table_privilege($1,'shopthie_private.audit_events',$2) as allowed",
              [role, privilege],
            )
          ).rows[0].allowed,
          false,
        );
    }
  }));

test("Owner history includes opaque historical UUIDs without profile/account joins and emits lowercase UUIDs", async () =>
  isolated(async () => {
    await db.exec(`insert into shopthie_private.audit_events(id,actor_id,target_id,event_type,reason_category,outcome,created_at)
    values('ABCDEF01-2345-4678-9ABC-0123456789AB','ABCDEF02-2345-4678-9ABC-0123456789AB','ABCDEF03-2345-4678-9ABC-0123456789AB',
      'customer.status.read','account_review','read','2026-10-29T18:00:00.000001Z')`);
    await actor();
    assert.deepEqual(await page(), {
      scope: "all",
      events: [
        {
          id: "abcdef01-2345-4678-9abc-0123456789ab",
          actorSubject: "abcdef02-2345-4678-9abc-0123456789ab",
          targetSubject: "abcdef03-2345-4678-9abc-0123456789ab",
          eventType: "customer.status.read",
          reason: "account_review",
          outcome: "read",
          createdAt: "2026-10-29T18:00:00.000001Z",
        },
      ],
      nextCursor: null,
    });
    await actor(adminId);
    assert.deepEqual(await page(), { scope: "own", events: [], nextCursor: null });
  }));

test("latest full registry/dependencies/permission mapping and all reviewed grants match current source", async () => {
  const enabled = resolveBackendModules([
    "profiles",
    "geography",
    "addresses",
    "customer_lookup",
    "customer_status",
    "audit_view",
  ]);
  assert.deepEqual(
    (await db.query("select id,enabled from shopthie_private.app_modules order by id")).rows,
    Object.keys(backendModuleDependencies)
      .sort()
      .map((id) => ({ id, enabled: enabled.includes(id as (typeof enabled)[number]) })),
  );
  const dependencies = Object.entries(backendModuleDependencies)
    .flatMap(([module_id, deps]) => deps.map((depends_on) => ({ module_id, depends_on })))
    .sort(
      (a, b) => a.module_id.localeCompare(b.module_id) || a.depends_on.localeCompare(b.depends_on),
    );
  assert.deepEqual(
    (
      await db.query(
        "select module_id,depends_on from shopthie_private.app_module_dependencies order by module_id,depends_on",
      )
    ).rows,
    dependencies,
  );
  assert.deepEqual(
    (await db.query("select id,module_id from shopthie_private.app_permissions order by id")).rows,
    Object.entries(permissionDefinitions)
      .map(([id, spec]) => ({ id, module_id: spec.module }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const grants = (
    await db.query<{ role_id: string; permissions: string[] }>(
      "select role_id,array_agg(permission_id order by permission_id) as permissions from shopthie_private.app_role_permissions group by role_id order by role_id",
    )
  ).rows;
  assert.deepEqual(
    Object.fromEntries(grants.map((row) => [row.role_id, row.permissions])),
    Object.fromEntries(
      Object.entries(rolePermissions).map(([role, permissions]) => [role, [...permissions].sort()]),
    ),
  );
});

test("dedicated optional viewer remaps only audit.read and preserves writers and reviewed grants", async () => {
  assert.deepEqual(
    (
      await db.query(
        "select * from shopthie_private.app_role_permissions order by role_id,permission_id",
      )
    ).rows,
    previousGrants,
  );
  assert.deepEqual(
    (await db.query("select id,module_id from shopthie_private.app_permissions order by id")).rows,
    previousPermissions.map((row) =>
      row.id === "audit.read" ? { ...row, module_id: "audit_view" } : row,
    ),
  );
  assert.deepEqual((await db.query(writersSql)).rows, previousFunctions);
  assert.deepEqual(
    (
      await db.query(
        "select id,enabled from shopthie_private.app_modules where id in ('audit_view','audit','access','identity','staff','support') order by id",
      )
    ).rows,
    [
      { id: "access", enabled: true },
      { id: "audit", enabled: true },
      { id: "audit_view", enabled: true },
      { id: "identity", enabled: true },
      { id: "staff", enabled: false },
      { id: "support", enabled: false },
    ],
  );
  assert.deepEqual(
    (
      await db.query(
        "select depends_on from shopthie_private.app_module_dependencies where module_id='audit_view' order by depends_on",
      )
    ).rows,
    [{ depends_on: "access" }, { depends_on: "audit" }],
  );
});

test("TEST-only final counts prove complete fixture cleanup and the isolated viewer installation", async () => {
  const counts = (
    await db.query(`select
    (select count(*)::int from auth.users) as users,
    (select count(*)::int from shopthie_private.app_user_roles where role_id in ('owner','admin')) as staff_memberships,
    (select count(*)::int from auth.mfa_factors where status='verified') as verified_factors,
    (select count(*)::int from auth.mfa_factors where status='unverified') as pending_factors,
    (select count(*)::int from shopthie_private.audit_events) as audit_events,
    (select count(*)::int from shopthie_private.app_modules where id='audit_view' and enabled) as enabled_audit_view,
    (select count(*)::int from shopthie_private.app_modules where id in ('staff','support') and enabled) as enabled_staff_support,
    (select count(*)::int from shopthie_private.app_role_permissions where permission_id='audit.read' and role_id in ('owner','admin')) as audit_staff_grants,
    (select count(*)::int from shopthie_private.app_role_permissions where permission_id='audit.read' and role_id='customer') as audit_customer_grants`)
  ).rows[0];
  assert.deepEqual(counts, {
    users: 0,
    staff_memberships: 0,
    verified_factors: 0,
    pending_factors: 0,
    audit_events: 0,
    enabled_audit_view: 1,
    enabled_staff_support: 0,
    audit_staff_grants: 2,
    audit_customer_grants: 0,
  });
  console.info("TEST fixture final counts (not native):", JSON.stringify(counts));
});
