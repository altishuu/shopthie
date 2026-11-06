import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, createAuthFixture, customerId, otherId, provision } from "./auth-fixture.ts";

import { backendModuleDependencies, resolveBackendModules } from "../../src/modules/registry.ts";
import { permissionDefinitions, rolePermissions } from "../../src/modules/access/permissions.ts";

// TEST ONLY: actual PostgreSQL functions/client roles, trusted synthetic claims.
// Not native JWT/GoTrue/MFA proof, provider work, or independent-session concurrency.
let db: PGlite;
const ownerId = customerId;
const targetId = otherId;
const adminId = "00000000-0000-4000-8000-000000000003";
const missingId = "00000000-0000-4000-8000-000000000099";
const migration = "20261104120706_profile_support.sql";
const rawSecuritySql = `select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,
  (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.policyname) from pg_catalog.pg_policies p where p.schemaname='shopthie_private' and p.tablename=c.relname) as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shopthie_private' and c.relkind='r' order by c.relname`;
let previousRawSecurity: unknown[];
let previousFunctions: { name: string; definition: string; acl: string | null }[];
let previousHistory: string;
before(async () => {
  db = await createAuthFixture();
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const name of names.filter((name) => name < migration))
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  previousRawSecurity = (await db.query(rawSecuritySql)).rows;
  previousFunctions = (
    await db.query<{ name: string; definition: string; acl: string | null }>(`
    select n.nspname||'.'||p.proname as name,pg_get_functiondef(p.oid) as definition,p.proacl::text as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','shopthie_private') order by name`)
  ).rows;
  previousHistory = previousFunctions.find(
    (row) => row.name === "shopthie_private.audit_events",
  )!.definition;
  // Area 10 historical contract: Owner-freeze tests exercise the later chain.
  for (const name of names.filter((name) => name === migration))
    await db.exec(await readFile(new URL(name, directory), "utf8"));
});
after(async () => {
  await db?.close();
});
async function isolated(work: () => Promise<void>) {
  await db.exec("begin");
  try {
    for (const id of [ownerId, targetId, adminId]) await provision(db, id);
    await db.exec(`update shopthie_private.app_user_roles set role_id='owner' where user_id='${ownerId}';
      update shopthie_private.app_user_roles set role_id='admin' where user_id='${adminId}';
      insert into auth.mfa_factors(user_id,status,factor_type) values
      ('${ownerId}','verified','totp'),('${adminId}','verified','totp');
      insert into shopthie_private.profiles(user_id,username) values ('${targetId}','Target_Name');`);
    await work();
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function actor(id: string | null = adminId, aal: unknown = "aal2") {
  await asActor(db, "authenticated", {
    sub: id,
    aal,
    user_metadata: { role: "owner", actor_id: ownerId, target_role: "customer" },
    app_metadata: { role: "owner", permissions: ["support.profile.read"] },
  });
}
async function ready(prefix = "public.shopthie_") {
  return (await db.query<{ value: boolean }>(`select ${prefix}profile_support_ready() as value`))
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

type Profile = { subject: string; username: string; phone: string | null };
async function read(
  target: string | null = targetId,
  username: string | null = "target_name",
  reason: string | null = "profile_help",
  prefix = "public.shopthie_",
) {
  return (
    await db.query<{ value: Profile }>(`select ${prefix}profile_support_read($1,$2,$3) as value`, [
      target,
      username,
      reason,
    ])
  ).rows[0].value;
}

test("bound Customer projection has exactly subject/username/nullable phone and one minimal mandatory audit per disclosure", async () =>
  isolated(async () => {
    for (const [id, phone, status] of [
      [adminId, null, "active"],
      [ownerId, "+12025550123", "suspended"],
    ] as const) {
      await db.exec("reset role");
      await db.query("update shopthie_private.profiles set phone=$1 where user_id=$2", [
        phone,
        targetId,
      ]);
      await db.query("update shopthie_private.app_accounts set status=$1 where user_id=$2", [
        status,
        targetId,
      ]);
      const profileBefore = (await db.query("select * from shopthie_private.profiles")).rows;
      await actor(id);
      assert.deepEqual(await read(), { subject: targetId, username: "Target_Name", phone });
      assert.deepEqual(await read(targetId, "TARGET_NAME", "profile_help", "shopthie_private."), {
        subject: targetId,
        username: "Target_Name",
        phone,
      });
      await db.exec("reset role");
      assert.deepEqual(
        (await db.query("select * from shopthie_private.profiles")).rows,
        profileBefore,
      );
    }
    const events = (
      await db.query(
        "select actor_id,target_id,event_type,reason_category,outcome from shopthie_private.audit_events order by actor_id",
      )
    ).rows;
    assert.deepEqual(
      events,
      [ownerId, ownerId, adminId, adminId].map((actor_id) => ({
        actor_id,
        target_id: targetId,
        event_type: "support.profile.read",
        reason_category: "profile_help",
        outcome: "read",
      })),
    );
    assert.doesNotMatch(
      JSON.stringify((await db.query("select * from shopthie_private.audit_events")).rows),
      /Target_Name|12025550123/,
    );
  }));

// Deterministic single-connection audit-hook fault injection, NOT a race test.
for (const [name, mutation] of [
  [
    "phone change",
    `update shopthie_private.profiles set phone='+12025550124' where user_id='${targetId}'`,
  ],
  [
    "username change",
    `update shopthie_private.profiles set username='Changed_Name' where user_id='${targetId}'`,
  ],
  [
    "case-only username change",
    `update shopthie_private.profiles set username='TARGET_NAME' where user_id='${targetId}'`,
  ],
  [
    "target promotion",
    `update shopthie_private.app_user_roles set role_id='admin' where user_id='${targetId}'`,
  ],
  ["target profile removal", `delete from shopthie_private.profiles where user_id='${targetId}'`],
  [
    "actor role revocation even with forged Customer grant",
    `update shopthie_private.app_user_roles set role_id='customer' where user_id='${adminId}'; insert into shopthie_private.app_role_permissions values('customer','support.profile.read')`,
  ],
  [
    "actor suspension",
    `update shopthie_private.app_accounts set status='suspended' where user_id='${adminId}'`,
  ],
  [
    "grant revocation",
    "delete from shopthie_private.app_role_permissions where role_id='admin' and permission_id='support.profile.read'",
  ],
  [
    "module revocation",
    "update shopthie_private.app_modules set enabled=false where id='profile_support'",
  ],
  ["TOTP revocation", `update auth.mfa_factors set status='unverified' where user_id='${adminId}'`],
  [
    "caller switch",
    `perform pg_catalog.set_config('request.jwt.claims','{"sub":"${ownerId}","aal":"aal2"}',true)`,
  ],
  [
    "AAL downgrade",
    `perform pg_catalog.set_config('request.jwt.claims','{"sub":"${adminId}","aal":"aal1"}',true)`,
  ],
] as const)
  test(`post-audit ${name} rejects with no DTO and statement rollback restores all fixture state`, async () =>
    isolated(async () => {
      const stateSql = `select pg_catalog.jsonb_build_object(
    'profiles',(select jsonb_agg(to_jsonb(p) order by user_id) from shopthie_private.profiles p),
    'accounts',(select jsonb_agg(to_jsonb(a) order by user_id) from shopthie_private.app_accounts a),
    'roles',(select jsonb_agg(to_jsonb(r) order by user_id) from shopthie_private.app_user_roles r),
    'grants',(select jsonb_agg(to_jsonb(g) order by role_id,permission_id) from shopthie_private.app_role_permissions g),
    'factors',(select jsonb_agg(to_jsonb(f) order by id) from auth.mfa_factors f),
    'modules',(select jsonb_agg(to_jsonb(m) order by id) from shopthie_private.app_modules m),
    'audits',(select jsonb_agg(to_jsonb(e) order by id) from shopthie_private.audit_events e)) as value`;
      const before = (await db.query(stateSql)).rows;
      await db.exec(`create function shopthie_private.test_profile_audit_hook() returns trigger
    language plpgsql security definer set search_path='' as $$ begin
      if new.event_type='support.profile.read' then ${mutation}; end if; return new; end; $$;
    create trigger test_profile_audit_hook after insert on shopthie_private.audit_events
      for each row execute function shopthie_private.test_profile_audit_hook();`);
      await installCatch();
      await actor();
      assert.equal(await caughtRead(), "42501");
      await db.exec("reset role");
      assert.deepEqual((await db.query(stateSql)).rows, before);
      assert.equal(await ready(), true);
    }));
async function installCatch() {
  // Inner PL/pgSQL exception block provides actual statement subtransaction
  // rollback. Compare state BEFORE rolling the outer fixture transaction back.
  await db.exec(`create function public.test_catch_profile_support_read() returns text
    language plpgsql security invoker set search_path='' as $$ begin
      perform public.shopthie_profile_support_read('${targetId}','target_name','profile_help');
      return 'DISCLOSED'; exception when others then return sqlstate; end; $$;
    revoke all on function public.test_catch_profile_support_read() from public,anon;
    grant execute on function public.test_catch_profile_support_read() to authenticated;`);
}
async function caughtRead() {
  return (
    await db.query<{ value: string }>("select public.test_catch_profile_support_read() as value")
  ).rows[0].value;
}

type HistoryEvent = {
  id: string;
  actorSubject: string;
  targetSubject: string | null;
  eventType: string;
  reason: string;
  outcome: string;
  createdAt: string;
};
type History = {
  scope: "own" | "all";
  events: HistoryEvent[];
  nextCursor: { id: string; createdAt: string } | null;
};
async function history(time: string | null = null, id: string | null = null) {
  return (
    await db.query<{ value: History }>("select public.shopthie_audit_events($1,$2) as value", [
      time,
      id,
    ])
  ).rows[0].value;
}
const historyExtension = `        or (e.event_type='support.profile.read' and e.target_id is not null
          and e.reason_category='profile_help' and e.outcome='read')\n`;
test("history replacement changes exactly the reviewed envelope predicate and nothing else", async () => {
  const current = (
    await db.query<{ definition: string }>(
      "select pg_get_functiondef('shopthie_private.audit_events(text,uuid)'::regprocedure) as definition",
    )
  ).rows[0].definition;
  const anchor = "      )\n    order by e.created_at desc,e.id desc limit 21";
  assert.equal(previousHistory.split(anchor).length, 2);
  assert.equal(current, previousHistory.replace(anchor, historyExtension + anchor));
});
test("history safely includes only support.profile.read/profile_help/read/nonnull-target with unchanged own/all scope and cursor precision", async () =>
  isolated(async () => {
    const expected: HistoryEvent[] = [];
    for (let n = 1; n <= 21; n++) {
      const id = `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const createdAt = `2026-10-30T02:00:00.${n === 21 ? "123457" : "123456"}Z`;
      await db.query(
        "insert into shopthie_private.audit_events(id,actor_id,target_id,event_type,reason_category,outcome,created_at) values($1,$2,$3,'support.profile.read','profile_help','read',$4)",
        [id, adminId, targetId, createdAt],
      );
      expected.unshift({
        id,
        actorSubject: adminId,
        targetSubject: targetId,
        eventType: "support.profile.read",
        reason: "profile_help",
        outcome: "read",
        createdAt,
      });
    }
    for (const [event, reason, outcome, target] of [
      ["support.private.read", "profile_help", "read", targetId],
      ["support.profile.read", "address_help", "read", targetId],
      ["support.profile.read", "profile_help", "found", targetId],
      ["support.profile.read", "profile_help", "read", null],
      ["unknown.future", "private text", "read", targetId],
    ])
      await db.query(
        "insert into shopthie_private.audit_events(actor_id,target_id,event_type,reason_category,outcome,created_at) values($1,$2,$3,$4,$5,'2026-10-30T03:00:00Z')",
        [adminId, target, event, reason, outcome],
      );
    await db.query(
      "insert into shopthie_private.audit_events(actor_id,target_id,event_type,reason_category,outcome,created_at) values($1,$2,'support.profile.read','profile_help','read','2026-10-30T01:00:00Z')",
      [ownerId, targetId],
    );
    await db.exec(`alter table shopthie_private.audit_events add column metadata jsonb default '{"phone":"+12025550123","username":"Target_Name"}';
    create function shopthie_private.test_no_history_writes() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'TEST_READ_MUST_NOT_WRITE'; end; $$;
    create trigger test_no_history_writes before insert or update or delete or truncate on shopthie_private.audit_events
      for each statement execute function shopthie_private.test_no_history_writes();`);
    const rows = (await db.query("select * from shopthie_private.audit_events order by id")).rows;
    await actor();
    const first = await history();
    assert.deepEqual(first, {
      scope: "own",
      events: expected.slice(0, 20),
      nextCursor: { id: expected[19].id, createdAt: expected[19].createdAt },
    });
    assert.deepEqual(await history(first.nextCursor!.createdAt, first.nextCursor!.id), {
      scope: "own",
      events: expected.slice(20),
      nextCursor: null,
    });
    await actor(ownerId);
    const all = await history(first.nextCursor!.createdAt, first.nextCursor!.id);
    assert.equal(all.scope, "all");
    assert.equal(all.events.length, 2);
    assert.deepEqual(all.events[0], expected[20]);
    assert.equal(all.events[1].actorSubject, ownerId);
    assert.deepEqual(Object.keys(all.events[1]).sort(), Object.keys(expected[0]).sort());
    assert.doesNotMatch(JSON.stringify(all), /Target_Name|12025550123|metadata/);
    assert.equal(await ready(), true);
    await db.exec("reset role");
    assert.deepEqual(
      (await db.query("select * from shopthie_private.audit_events order by id")).rows,
      rows,
    );
  }));

for (const [mode, body, code] of [
  [
    "rejecting audit",
    "raise exception using errcode='23514',message='TEST_AUDIT_FAILURE';",
    "23514",
  ],
  ["silently suppressed audit", "return null;", "42501"],
] as const)
  test(`${mode} cannot disclose a DTO or leave audit changes`, async () =>
    isolated(async () => {
      await db.exec(`create function shopthie_private.test_fail_audit() returns trigger language plpgsql set search_path='' as $$ begin ${body} end; $$;
    create trigger test_fail_audit before insert on shopthie_private.audit_events for each row execute function shopthie_private.test_fail_audit();`);
      await installCatch();
      await actor();
      assert.equal(await caughtRead(), code);
      await db.exec("reset role");
      assert.deepEqual((await db.query("select * from shopthie_private.audit_events")).rows, []);
      assert.deepEqual(
        (await db.query("select username,phone from shopthie_private.profiles")).rows,
        [{ username: "Target_Name", phone: null }],
      );
    }));

test("invalid reason, strict raw ASCII username, target and UUID+username bindings fail without an audit", async () =>
  isolated(async () => {
    for (const prefix of ["public.shopthie_", "shopthie_private."]) {
      await actor();
      for (const reason of [
        null,
        "",
        "account_access",
        "address_help",
        "PROFILE_HELP",
        "profile_help ",
        "profile_help\n",
        "private free text",
      ])
        await rejected(() => read(targetId, "target_name", reason, prefix), "22023");
      for (const username of [
        null,
        "",
        "ab",
        "a".repeat(33),
        " target_name",
        "target_name ",
        "target_name\n",
        "tárget_name",
        "Ｔarget_Name",
        "_target",
        "tar.get",
        "target/name",
      ])
        await rejected(() => read(targetId, username, "profile_help", prefix), "22023");
      for (const target of [null, adminId, ownerId, missingId])
        await rejected(() => read(target, "target_name", "profile_help", prefix));
      await rejected(() => read(targetId, "Different_Name", "profile_help", prefix));
      await rejected(() => read("not-a-uuid", "target_name", "profile_help", prefix), "22P02");
      await db.exec("reset role;savepoint target");
      for (const statement of [
        `update shopthie_private.app_user_roles set role_id='owner' where user_id='${targetId}'`,
        `update shopthie_private.app_user_roles set role_id='admin' where user_id='${targetId}'`,
        `delete from shopthie_private.app_user_roles where user_id='${targetId}'`,
        `delete from shopthie_private.profiles where user_id='${targetId}'`,
      ]) {
        await db.exec(statement);
        await actor();
        await rejected(() => read(targetId, "target_name", "profile_help", prefix));
        await db.exec("reset role;rollback to savepoint target");
      }
      await db.exec("release savepoint target");
      await actor();
      for (const sql of [
        "select public.shopthie_profile_support_ready(p_target=>null)",
        "select public.shopthie_profile_support_read(p_target=>null,p_username=>'target_name',p_reason=>'profile_help',p_actor=>null)",
        "select public.shopthie_profile_support_read(p_target=>null,p_username=>'target_name',p_reason=>'profile_help',p_phone=>null)",
      ])
        await rejected(() => db.exec(sql), "42883");
    }
    await db.exec("reset role");
    assert.deepEqual((await db.query("select * from shopthie_private.audit_events")).rows, []);
  }));

test("current actor/MFA/module/dependency/grant revocations deny readiness and both readers before input validation", async () =>
  isolated(async () => {
    for (const prefix of ["public.shopthie_", "shopthie_private."]) {
      await asActor(db, "anon");
      await rejected(() => read(targetId, "target_name", "profile_help", prefix));
      for (const [id, aal] of [
        [targetId, "aal2"],
        [null, "aal2"],
        [missingId, "aal2"],
        [adminId, "aal1"],
        [adminId, null],
        [adminId, "aal3"],
      ] as const) {
        await actor(id, aal);
        await rejected(() => read(targetId, "bad input", null, prefix));
      }
      for (const mutation of [
        "delete from auth.mfa_factors",
        "update auth.mfa_factors set status='unverified'",
        "update auth.mfa_factors set factor_type='phone'",
        `update shopthie_private.app_accounts set status='suspended' where user_id='${adminId}'`,
        `delete from shopthie_private.app_user_roles where user_id='${adminId}'`,
        `update shopthie_private.app_user_roles set role_id='customer' where user_id='${adminId}';insert into shopthie_private.app_role_permissions values('customer','support.profile.read')`,
        "delete from shopthie_private.app_role_permissions where role_id='admin' and permission_id='support.profile.read'",
        ...["profile_support", "customer_lookup", "profiles"].map(
          (id) => `update shopthie_private.app_modules set enabled=false where id='${id}'`,
        ),
      ]) {
        await db.exec("reset role;savepoint authority");
        await db.exec(mutation);
        await actor();
        assert.equal(await ready(), false, mutation);
        await rejected(() => read(targetId, "bad input", null, prefix));
        await db.exec("reset role;rollback to savepoint authority;release savepoint authority");
      }
    }
    assert.deepEqual((await db.query("select * from shopthie_private.audit_events")).rows, []);
  }));

test("parent-lock boundary rechecks actor authority and target binding (TEST-only readiness interception)", async () =>
  isolated(async () => {
    for (const mutation of [
      "update shopthie_private.app_modules set enabled=false where id='profile_support'",
      `update shopthie_private.app_user_roles set role_id='owner' where user_id='${targetId}'`,
      `update shopthie_private.profiles set username='Changed_Name' where user_id='${targetId}'`,
    ]) {
      await db.exec(`reset role;savepoint boundary;
      alter function shopthie_private.profile_support_ready() rename to test_real_profile_support_ready;
      create sequence shopthie_private.test_gate_calls;
      create function shopthie_private.profile_support_ready() returns boolean
        language plpgsql volatile security definer set search_path='' as $$ begin
        if pg_catalog.nextval('shopthie_private.test_gate_calls')=2 then ${mutation}; end if;
        return shopthie_private.test_real_profile_support_ready(); end; $$;
      revoke all on function shopthie_private.profile_support_ready() from public,anon;
      grant execute on function shopthie_private.profile_support_ready() to authenticated;`);
      await actor();
      await rejected(() => read());
      await db.exec("reset role;rollback to savepoint boundary;release savepoint boundary");
    }
  }));

test("disabled profile support leaves lookup/status/profile writers, mandatory audits and history viewer functioning", async () =>
  isolated(async () => {
    await actor();
    await read();
    await db.exec(
      "reset role;update shopthie_private.app_modules set enabled=false where id='profile_support'",
    );
    await actor();
    assert.equal(await ready(), false);
    await rejected(() => read());
    await actor(targetId, "aal1");
    await db.query("select public.shopthie_profile_save('Target_Name','+12025550123',1)");
    await actor();
    await db.query("select public.shopthie_customer_lookup('target_name','profile_help')");
    await db.query("select public.shopthie_customer_status_read($1,'customer_request')", [
      targetId,
    ]);
    await db.query(
      "select public.shopthie_customer_status_change($1,'suspended',0,'account_security')",
      [targetId],
    );
    const page = await history();
    assert.equal(page.scope, "own");
    assert.deepEqual(page.events.map((event) => event.eventType).sort(), [
      "customer.lookup",
      "customer.status.change",
      "customer.status.read",
      "support.profile.read",
    ]);
    assert.doesNotMatch(JSON.stringify(page), /12025550123|Target_Name/);
    assert.equal(
      (await db.query<{ value: boolean }>("select public.shopthie_audit_view_ready() as value"))
        .rows[0].value,
      true,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from shopthie_private.audit_events",
        )
      ).rows[0].n,
      4,
    );
    for (const id of ["identity", "access", "audit"])
      await rejected(
        () => db.query("update shopthie_private.app_modules set enabled=false where id=$1", [id]),
        "23514",
      );
  }));

// This fixture ends at Area10. Full unfiltered current parity lives in database-owner-bootstrap.test.ts.
test("historical Area10 registry/dependencies/permissions/ALL role grants stay exact before owner_setup", async () => {
  const enabled = resolveBackendModules([
    "profiles",
    "geography",
    "addresses",
    "customer_lookup",
    "customer_status",
    "audit_view",
    "profile_support",
  ]);
  assert.deepEqual(
    (await db.query("select id,enabled from shopthie_private.app_modules order by id")).rows,
    Object.keys(backendModuleDependencies)
      .filter((id) => id !== "owner_setup")
      .sort()
      .map((id) => ({ id, enabled: enabled.includes(id as (typeof enabled)[number]) })),
  );
  assert.deepEqual(
    (
      await db.query(
        "select module_id,depends_on from shopthie_private.app_module_dependencies order by module_id,depends_on",
      )
    ).rows,
    Object.entries(backendModuleDependencies)
      .filter(([id]) => id !== "owner_setup")
      .flatMap(([module_id, deps]) => deps.map((depends_on) => ({ module_id, depends_on })))
      .sort(
        (a, b) =>
          a.module_id.localeCompare(b.module_id) || a.depends_on.localeCompare(b.depends_on),
      ),
  );
  assert.deepEqual(
    (await db.query("select id,module_id from shopthie_private.app_permissions order by id")).rows,
    Object.entries(permissionDefinitions)
      .filter(([id]) => id !== "owner.bootstrap.request_own")
      .map(([id, spec]) => ({ id, module_id: spec.module }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert.deepEqual(
    (
      await db.query(
        "select role_id,permission_id from shopthie_private.app_role_permissions order by role_id,permission_id",
      )
    ).rows,
    Object.entries(rolePermissions)
      .flatMap(([role_id, permissions]) =>
        permissions
          .filter((id) => id !== "owner.bootstrap.request_own")
          .map((permission_id) => ({ role_id, permission_id })),
      )
      .sort(
        (a, b) =>
          a.role_id.localeCompare(b.role_id) || a.permission_id.localeCompare(b.permission_id),
      ),
  );
  assert.deepEqual(
    (
      await db.query(
        "select depends_on from shopthie_private.app_module_dependencies where module_id='profile_support' order by depends_on",
      )
    ).rows,
    ["access", "audit", "customer_lookup", "profiles"].map((depends_on) => ({ depends_on })),
  );
  assert.deepEqual(
    (
      await db.query(
        "select id,module_id from shopthie_private.app_permissions where id='support.private.read'",
      )
    ).rows,
    [{ id: "support.private.read", module_id: "support" }],
  );
});

test("new invoker/definer signatures have empty paths/auth-only ACLs, ordered parent SHARE locks and no child/account writes", async () =>
  isolated(async () => {
    const functions = (
      await db.query<{
        name: string;
        definer: boolean;
        settings: string[];
        volatility: string;
        args: string;
        result: string;
        auth: boolean;
        anon: boolean;
        pub: boolean;
        definition: string;
      }>(`select n.nspname||'.'||p.proname as name,p.prosecdef as definer,p.proconfig as settings,p.provolatile as volatility,
      pg_get_function_identity_arguments(p.oid) as args,pg_get_function_result(p.oid) as result,
      has_function_privilege('authenticated',p.oid,'execute') as auth,has_function_privilege('anon',p.oid,'execute') as anon,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where grantee=0 and privilege_type='EXECUTE') as pub,
      pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
      (n.nspname='public' and p.proname in ('shopthie_profile_support_ready','shopthie_profile_support_read')) or
      (n.nspname='shopthie_private' and p.proname in ('profile_support_ready','profile_support_read'))`)
    ).rows;
    assert.equal(functions.length, 4);
    for (const fn of functions) {
      const reader = fn.name.endsWith("_read");
      assert.equal(fn.definer, fn.name.startsWith("shopthie_private."));
      assert.deepEqual(fn.settings, ['search_path=""']);
      assert.equal(fn.auth, true);
      assert.equal(fn.anon, false);
      assert.equal(fn.pub, false);
      assert.equal(fn.volatility, reader ? "v" : "s");
      assert.equal(fn.args, reader ? "p_target uuid, p_username text, p_reason text" : "");
      assert.equal(fn.result, reader ? "jsonb" : "boolean");
      if (reader && fn.definer) {
        const code = fn.definition.replace(/--[^\n]*/g, "");
        assert.match(
          code,
          /where account.user_id in \(actor_id,p_target\) order by account.user_id for share/,
        );
        assert.equal((code.match(/for share/gi) ?? []).length, 1);
        assert.doesNotMatch(
          code,
          /for update|for no key update|for key share|\b(?:update|delete|truncate)\b/i,
        );
        assert.equal((code.match(/\binsert into\b/gi) ?? []).length, 1);
        assert.match(
          code,
          /insert into shopthie_private.audit_events\(actor_id,target_id,event_type,reason_category,outcome\)/,
        );
        assert.doesNotMatch(code, /auth.users|addresses|email/);
      }
    }
  }));

test("raw ACL/RLS/policies and every prior function/signature/ACL remain exact except the one reviewed private history predicate", async () =>
  isolated(async () => {
    assert.deepEqual((await db.query(rawSecuritySql)).rows, previousRawSecurity);
    const current = (
      await db.query<{ name: string; definition: string; acl: string | null }>(`
    select n.nspname||'.'||p.proname as name,pg_get_functiondef(p.oid) as definition,p.proacl::text as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','shopthie_private') order by name`)
    ).rows;
    assert.deepEqual(
      current.filter((row) => !row.name.includes("profile_support")),
      previousFunctions.map((row) =>
        row.name === "shopthie_private.audit_events"
          ? {
              ...row,
              definition: row.definition.replace(
                "      )\n    order by e.created_at desc,e.id desc limit 21",
                historyExtension + "      )\n    order by e.created_at desc,e.id desc limit 21",
              ),
            }
          : row,
      ),
    );
    for (const role of ["anon", "authenticated"] as const) {
      await asActor(db, role, { sub: adminId, aal: "aal2" });
      for (const table of ["profiles", "app_accounts", "app_user_roles", "audit_events"])
        for (const statement of [
          `select * from shopthie_private.${table}`,
          `delete from shopthie_private.${table}`,
          `truncate shopthie_private.${table}`,
        ])
          await rejected(() => db.exec(statement));
      for (const statement of [
        "update shopthie_private.profiles set phone='+12025550123'",
        "insert into shopthie_private.audit_events(event_type,outcome) values('support.profile.read','read')",
        "update shopthie_private.audit_events set outcome='read'",
      ])
        await rejected(() => db.exec(statement));
      await db.exec("reset role");
      for (const table of ["profiles", "app_accounts", "app_user_roles", "audit_events"])
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"])
          assert.equal(
            (
              await db.query<{ allowed: boolean }>(
                "select has_table_privilege($1,$2,$3) as allowed",
                [role, `shopthie_private.${table}`, privilege],
              )
            ).rows[0].allowed,
            false,
          );
    }
  }));

test("dedicated readiness permits only current Owner/Admin verified TOTP+AAL2 and adds one specific optional capability", async () =>
  isolated(async () => {
    for (const id of [ownerId, adminId]) {
      await actor(id);
      assert.equal(await ready(), true);
      assert.equal(await ready("shopthie_private."), true);
      assert.equal(
        (
          await db.query<{ value: boolean }>(
            "select shopthie_private.has_permission('support.private.read') as value",
          )
        ).rows[0].value,
        false,
      );
    }
    for (const [id, aal] of [
      [targetId, "aal2"],
      [null, "aal2"],
      [missingId, "aal2"],
      [adminId, "aal1"],
      [adminId, null],
      [adminId, "aal3"],
    ] as const) {
      await actor(id, aal);
      assert.equal(await ready(), false);
    }
    await asActor(db, "anon");
    await rejected(() => ready());
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select id,enabled from shopthie_private.app_modules where id in ('profile_support','staff','support') order by id",
        )
      ).rows,
      [
        { id: "profile_support", enabled: true },
        { id: "staff", enabled: false },
        { id: "support", enabled: false },
      ],
    );
    assert.deepEqual(
      (
        await db.query(
          "select role_id from shopthie_private.app_role_permissions where permission_id='support.profile.read' order by role_id",
        )
      ).rows,
      [{ role_id: "admin" }, { role_id: "owner" }],
    );
  }));

test("TEST-only final counts confirm cleaned synthetic accounts/factors/audits and only the specific support installation", async () => {
  const counts = (
    await db.query(`select
    (select count(*)::int from auth.users) as users,
    (select count(*)::int from shopthie_private.app_user_roles where role_id in ('owner','admin')) as staff_memberships,
    (select count(*)::int from auth.mfa_factors where status='verified') as verified_factors,
    (select count(*)::int from auth.mfa_factors where status='unverified') as pending_factors,
    (select count(*)::int from shopthie_private.audit_events) as audit_events,
    (select count(*)::int from shopthie_private.profiles) as profiles,
    (select count(*)::int from shopthie_private.app_modules where id='profile_support' and enabled) as enabled_profile_support,
    (select count(*)::int from shopthie_private.app_modules where id in ('staff','support') and enabled) as enabled_staff_support,
    (select count(*)::int from shopthie_private.app_role_permissions where permission_id='support.profile.read' and role_id in ('owner','admin')) as support_staff_grants,
    (select count(*)::int from shopthie_private.app_role_permissions where permission_id='support.profile.read' and role_id='customer') as support_customer_grants`)
  ).rows[0];
  assert.deepEqual(counts, {
    users: 0,
    staff_memberships: 0,
    verified_factors: 0,
    pending_factors: 0,
    audit_events: 0,
    profiles: 0,
    enabled_profile_support: 1,
    enabled_staff_support: 0,
    support_staff_grants: 2,
    support_customer_grants: 0,
  });
  console.info("Area10 TEST fixture final counts (not native):", JSON.stringify(counts));
});
