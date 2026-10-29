import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, createAuthFixture, customerId, otherId, provision } from "./auth-fixture.ts";
import { backendModuleDependencies, resolveBackendModules } from "../../src/modules/registry.ts";
import { permissionDefinitions, rolePermissions } from "../../src/modules/access/permissions.ts";

// TEST ONLY: actual PostgreSQL SQL/roles with synthetic users, factors and trusted
// claims. This is not native JWT verification, an OTP challenge or hosted acceptance.
let db: PGlite;
let previousPermissions: unknown;
let previousGrants: unknown;
let previousModules: unknown;
let previousAuthority: unknown;
const adminId = "00000000-0000-4000-8000-000000000003";
const staffId = "00000000-0000-4000-8000-000000000004";
const unprofiledId = "00000000-0000-4000-8000-000000000005";
async function authority() {
  return (
    await db.query(`select oid, proname, proacl::text, proconfig, prosecdef,
    provolatile, pg_get_functiondef(oid) as definition from pg_proc
    where oid in ('shopthie_private.has_permission(text)'::regprocedure,
      'public.shopthie_actor_context()'::regprocedure,
      'shopthie_private.actor_context()'::regprocedure) order by oid`)
  ).rows;
}
before(async () => {
  db = await createAuthFixture();
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  // Area7 historical acceptance fixture. Latest full-schema parity and lifecycle
  // guards are exercised in database-customer-status.test.ts.
  for (const name of (await readdir(directory))
    .filter((name) => /^\d+_.+\.sql$/.test(name) && name <= "20261029121812_customer_lookup.sql")
    .sort()) {
    if (name.endsWith("_customer_lookup.sql")) {
      previousPermissions = (
        await db.query("select * from shopthie_private.app_permissions order by id")
      ).rows;
      previousGrants = (
        await db.query(
          "select * from shopthie_private.app_role_permissions order by role_id, permission_id",
        )
      ).rows;
      previousModules = (await db.query("select * from shopthie_private.app_modules order by id"))
        .rows;
      previousAuthority = await authority();
    }
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  }
});
after(async () => {
  await db?.close();
});
async function isolated(work: () => Promise<void>) {
  await db.exec("begin");
  try {
    for (const id of [customerId, otherId, adminId, staffId, unprofiledId]) await provision(db, id);
    await db.exec(`update shopthie_private.app_user_roles set role_id='owner' where user_id='${customerId}';
      update shopthie_private.app_user_roles set role_id='admin' where user_id in ('${adminId}','${staffId}');
      insert into auth.mfa_factors (user_id,status,factor_type) values ('${customerId}','verified','totp'),('${adminId}','verified','totp');
      insert into shopthie_private.profiles (user_id,username,phone) values
        ('${otherId}','MiXeD_Name','+12025550123'), ('${staffId}','Staff_Name','+12025550124');`);
    await work();
  } finally {
    await db.exec("rollback");
  }
}
async function actor(id = customerId, aal: unknown = "aal2") {
  await asActor(db, "authenticated", {
    sub: id,
    aal,
    user_metadata: { role: "owner", status: "active" },
    app_metadata: { role: "owner", permissions: ["customer.lookup"] },
  });
}
async function ready() {
  return (
    await db.query<{ ready: boolean }>("select public.shopthie_customer_lookup_ready() as ready")
  ).rows[0].ready;
}
async function lookup(
  username: string | null = "mixed_name",
  reason: string | null = "account_access",
  direct = false,
) {
  return (
    await db.query<{ customer: unknown }>(
      `select ${direct ? "shopthie_private.customer_lookup" : "public.shopthie_customer_lookup"}($1::text,$2::text) as customer`,
      [username, reason],
    )
  ).rows[0].customer;
}
async function rejected(work: () => Promise<unknown>, code = "42501") {
  await db.exec("savepoint rejection");
  try {
    await assert.rejects(work, (error: unknown) => (error as { code?: string }).code === code);
  } finally {
    await db.exec("rollback to savepoint rejection; release savepoint rejection");
  }
}

test("dedicated module remaps only customer.lookup, preserves grants/authority and provides live readiness", async () =>
  isolated(async () => {
    await actor();
    assert.equal(await ready(), true);
    await db.exec("reset role");
    assert.deepEqual(
      (await db.query("select * from shopthie_private.app_permissions order by id")).rows,
      (previousPermissions as { id: string; module_id: string }[]).map((row) =>
        row.id === "customer.lookup" ? { ...row, module_id: "customer_lookup" } : row,
      ),
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from shopthie_private.app_role_permissions order by role_id, permission_id",
        )
      ).rows,
      previousGrants,
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from shopthie_private.app_modules where id <> 'customer_lookup' order by id",
        )
      ).rows,
      previousModules,
    );
    assert.deepEqual(
      (await db.query("select * from shopthie_private.app_modules where id='customer_lookup'"))
        .rows,
      [{ id: "customer_lookup", enabled: true }],
    );
    assert.deepEqual(
      (
        await db.query(
          "select depends_on from shopthie_private.app_module_dependencies where module_id='customer_lookup' order by depends_on",
        )
      ).rows,
      [{ depends_on: "access" }, { depends_on: "audit" }, { depends_on: "profiles" }],
    );
    assert.deepEqual(await authority(), previousAuthority);
    for (const id of [customerId, adminId]) {
      await actor(id);
      assert.equal(await ready(), true);
    }
    await actor(otherId);
    assert.equal(await ready(), false);
  }));

async function audits() {
  await db.exec("reset role");
  return (
    await db.query<{
      actor_id: string;
      target_id: string | null;
      event_type: string;
      reason_category: string;
      outcome: string;
    }>(
      "select actor_id,target_id,event_type,reason_category,outcome from shopthie_private.audit_events order by created_at,id",
    )
  ).rows;
}
test("exact Customer lookup returns only the three-field DTO and atomically audits every public/private call", async () =>
  isolated(async () => {
    for (const [id, direct] of [
      [customerId, false],
      [adminId, true],
    ] as const) {
      await actor(id);
      assert.deepEqual(await lookup("MiXeD_Name", "account_access", direct), {
        subject: otherId,
        username: "MiXeD_Name",
        status: "active",
      });
    }
    const rows = await audits();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.actor_id).sort(), [customerId, adminId].sort());
    for (const row of rows)
      assert.deepEqual(
        { ...row, actor_id: customerId },
        {
          actor_id: customerId,
          target_id: otherId,
          event_type: "customer.lookup",
          reason_category: "account_access",
          outcome: "found",
        },
      );
  }));

test("C-locale case-insensitive exact matching accepts all reasons and returns current suspended status", async () =>
  isolated(async () => {
    for (const reason of ["account_access", "profile_help", "address_help"]) {
      await actor();
      assert.deepEqual(await lookup("mIxEd_nAmE", reason), {
        subject: otherId,
        username: "MiXeD_Name",
        status: "active",
      });
    }
    await db.exec("reset role");
    await db.query("update shopthie_private.app_accounts set status='suspended' where user_id=$1", [
      otherId,
    ]);
    await actor();
    assert.deepEqual(await lookup("MIXED_NAME"), {
      subject: otherId,
      username: "MiXeD_Name",
      status: "suspended",
    });
    assert.equal((await audits()).length, 4);
  }));

test("staff, nonexistent, unprofiled, missing-membership and substring targets are indistinguishable audited no-match", async () =>
  isolated(async () => {
    await actor();
    for (const name of ["Staff_Name", "Absent_Name", "Unprofiled_Name", "MiXeD", "Name"])
      assert.equal(await lookup(name), null, name);
    await db.exec("reset role");
    await db.query("delete from shopthie_private.app_user_roles where user_id=$1", [otherId]);
    await actor();
    assert.equal(await lookup(), null);
    await db.exec("reset role");
    await db.query(
      "insert into shopthie_private.app_user_roles (user_id,role_id) values ($1,'admin')",
      [otherId],
    );
    await actor();
    assert.equal(await lookup(), null);
    const rows = await audits();
    assert.equal(rows.length, 7);
    for (const row of rows)
      assert.deepEqual(row, {
        actor_id: customerId,
        target_id: null,
        event_type: "customer.lookup",
        reason_category: "account_access",
        outcome: "not_found",
      });
  }));

test("only fixed reason categories are accepted and invalid reasons produce no audit/result", async () =>
  isolated(async () => {
    await actor();
    for (const reason of [
      null,
      "",
      "other",
      "Account_Access",
      "account_access ",
      "free text containing private details",
    ])
      await rejected(() => lookup("mixed_name", reason), "22023");
    assert.deepEqual(await audits(), []);
  }));

test("username validation rejects non-ASCII, wildcard, whitespace and non-exact input before audit", async () =>
  isolated(async () => {
    await actor();
    for (const name of [
      null,
      "",
      "ab",
      "a".repeat(33),
      " mixed_name",
      "mixed_name ",
      "mixed_name\n",
      "%",
      "mixed%",
      "_mixed",
      "-mixed",
      "mixed.name",
      "mıxed_name",
      "Ｍixed_name",
      "name@example.com",
    ])
      await rejected(() => lookup(name), "22023");
    assert.deepEqual(await audits(), []);
  }));

async function denied() {
  assert.equal(await ready(), false);
  assert.equal(
    (await db.query<{ ready: boolean }>("select shopthie_private.customer_lookup_ready() as ready"))
      .rows[0].ready,
    false,
  );
  for (const direct of [false, true])
    await rejected(() => lookup("mixed_name", "account_access", direct));
}

test("guest ACLs and forged Customer metadata cannot choose staff authority or target selectors", async () =>
  isolated(async () => {
    await asActor(db, "anon");
    await rejected(() => ready());
    await rejected(() => lookup());
    await rejected(() => db.query("select shopthie_private.customer_lookup_ready()"));
    await rejected(() => lookup("mixed_name", "account_access", true));
    await asActor(db, "authenticated");
    await denied();
    await actor(otherId);
    await denied();
    await actor();
    await rejected(
      () =>
        db.query("select public.shopthie_customer_lookup($1::text,$2::text,$3::uuid)", [
          "mixed_name",
          "account_access",
          otherId,
        ]),
      "42883",
    );
    assert.deepEqual(await audits(), []);
  }));

test("missing/non-AAL2 claims and current-factor requirements reject stale AAL2 without data or audits", async () =>
  isolated(async () => {
    for (const aal of [null, {}, "aal1", "unexpected"]) {
      await actor(customerId, aal);
      await denied();
    }
    await actor();
    assert.equal(await ready(), true);
    // Keep these claims unchanged while current native-style fixture rows change.
    await db.exec(`reset role; delete from auth.mfa_factors where user_id='${customerId}';
    insert into auth.mfa_factors (user_id,status,factor_type) values
      ('${customerId}','unverified','totp'), ('${customerId}','verified','phone');
    set local role authenticated;`);
    await denied(); // Another staff member's verified TOTP also does not help.
    await db.exec(
      `reset role; insert into auth.mfa_factors (user_id,status,factor_type) values ('${customerId}','verified','totp'); set local role authenticated;`,
    );
    assert.equal(await ready(), true);
    await db.exec(
      `reset role; delete from auth.mfa_factors where user_id='${customerId}' and factor_type='totp' and status='verified'; set local role authenticated;`,
    );
    await denied();
    assert.deepEqual(await audits(), []);
  }));

test("current membership, account, grant, dedicated-module and dependency revocation gate the same unchanged claims", async () =>
  isolated(async () => {
    await actor();
    for (const mutation of [
      `delete from shopthie_private.app_user_roles where user_id='${customerId}'`,
      `update shopthie_private.app_user_roles set role_id='customer' where user_id='${customerId}'`,
      `update shopthie_private.app_accounts set status='suspended' where user_id='${customerId}'`,
      "delete from shopthie_private.app_role_permissions where role_id='owner' and permission_id='customer.lookup'",
      "update shopthie_private.app_modules set enabled=false where id='customer_lookup'",
      "update shopthie_private.app_modules set enabled=false where id='profiles'",
    ]) {
      await db.exec("savepoint gate; reset role");
      await db.exec(mutation);
      await db.exec("set local role authenticated");
      await denied();
      await db.exec("rollback to savepoint gate; release savepoint gate");
      assert.equal(await ready(), true);
    }
    assert.deepEqual(await audits(), []);
  }));

test("authorization happens before target reads or validation", async () =>
  isolated(async () => {
    await db.exec("alter table shopthie_private.profiles rename to test_inaccessible_profiles");
    await actor(otherId);
    await denied();
    await rejected(() => lookup(null, null));
    assert.deepEqual(await audits(), []);
  }));

test("audit insertion failure aborts found/no-match public/private calls, returns nothing and rolls back trigger work", async () =>
  isolated(async () => {
    await db.exec(`create function shopthie_private.test_fail_lookup_audit() returns trigger
    language plpgsql set search_path='' as $$ begin
      update shopthie_private.profiles set revision=revision+1 where user_id='${otherId}';
      raise exception using errcode='23514', message='TEST forced audit storage failure';
    end $$;
    create trigger test_fail_lookup_audit after insert on shopthie_private.audit_events
    for each row execute function shopthie_private.test_fail_lookup_audit();`);
    for (const direct of [false, true])
      for (const username of ["mixed_name", "absent_name"]) {
        await actor();
        let returned: unknown = "TEST no result returned";
        await rejected(async () => {
          returned = await lookup(username, "profile_help", direct);
        }, "23514");
        assert.equal(returned, "TEST no result returned");
        assert.deepEqual(await audits(), []);
        assert.equal(
          (
            await db.query<{ revision: number }>(
              "select revision from shopthie_private.profiles where user_id=$1",
              [otherId],
            )
          ).rows[0].revision,
          1,
        );
      }
  }));

test("authenticated staff have no raw private table access and cannot insert their own audit", async () =>
  isolated(async () => {
    const tables = (
      await db.query<{
        name: string;
      }>(`select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='shopthie_private' and c.relkind='r' order by c.relname`)
    ).rows;
    await actor();
    assert.equal(await ready(), true);
    for (const { name } of tables) {
      assert.equal(
        (
          await db.query<{ allowed: boolean }>(
            "select has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as allowed",
            [`shopthie_private.${name}`],
          )
        ).rows[0].allowed,
        false,
        name,
      );
      await rejected(() => db.query(`select * from shopthie_private.${name}`));
    }
    await rejected(() =>
      db.exec(
        "insert into shopthie_private.audit_events (event_type,outcome) values ('customer.lookup','found')",
      ),
    );
    await rejected(() =>
      db.exec("update shopthie_private.app_modules set enabled=true where id='staff'"),
    );
    await rejected(() => db.exec("delete from shopthie_private.audit_events"));
  }));

test("exactly four narrow RPCs use fixed empty paths, invoker public wrappers and authenticated-only execute", async () => {
  const rows = (
    await db.query(`select n.nspname as schema,p.proname as name,p.prosecdef as definer,p.proconfig as settings,p.provolatile as volatility,
    pg_get_function_identity_arguments(p.oid) as arguments,pg_get_function_result(p.oid) as result,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('shopthie_customer_lookup','shopthie_customer_lookup_ready'))
      or (n.nspname='shopthie_private' and p.proname in ('customer_lookup','customer_lookup_ready')) order by n.nspname,p.proname`)
  ).rows;
  assert.deepEqual(rows, [
    {
      schema: "public",
      name: "shopthie_customer_lookup",
      definer: false,
      settings: ['search_path=""'],
      volatility: "v",
      arguments: "p_username text, p_reason text",
      result: "jsonb",
      anon_execute: false,
      authenticated_execute: true,
      public_execute: false,
    },
    {
      schema: "public",
      name: "shopthie_customer_lookup_ready",
      definer: false,
      settings: ['search_path=""'],
      volatility: "s",
      arguments: "",
      result: "boolean",
      anon_execute: false,
      authenticated_execute: true,
      public_execute: false,
    },
    {
      schema: "shopthie_private",
      name: "customer_lookup",
      definer: true,
      settings: ['search_path=""'],
      volatility: "v",
      arguments: "p_username text, p_reason text",
      result: "jsonb",
      anon_execute: false,
      authenticated_execute: true,
      public_execute: false,
    },
    {
      schema: "shopthie_private",
      name: "customer_lookup_ready",
      definer: true,
      settings: ['search_path=""'],
      volatility: "s",
      arguments: "",
      result: "boolean",
      anon_execute: false,
      authenticated_execute: true,
      public_execute: false,
    },
  ]);
});

test("TEST fixture final counts confirm transaction cleanup and only dedicated lookup enabled", async () => {
  const counts = (
    await db.query(`select
    (select count(*)::int from auth.users) as users,
    (select count(*)::int from shopthie_private.app_user_roles where role_id in ('owner','admin')) as staff_memberships,
    (select count(*)::int from auth.mfa_factors where status='verified') as verified_factors,
    (select count(*)::int from auth.mfa_factors where status='unverified') as pending_factors,
    (select count(*)::int from shopthie_private.audit_events) as audit_events,
    (select count(*)::int from shopthie_private.app_modules where id='customer_lookup' and enabled) as enabled_customer_lookup,
    (select count(*)::int from shopthie_private.app_modules where id in ('staff','support') and enabled) as enabled_staff_support,
    (select count(*)::int from shopthie_private.app_role_permissions where permission_id='customer.lookup' and role_id in ('owner','admin')) as lookup_staff_grants,
    (select count(*)::int from shopthie_private.app_role_permissions where permission_id='customer.lookup' and role_id='customer') as lookup_customer_grants`)
  ).rows[0];
  assert.deepEqual(counts, {
    users: 0,
    staff_memberships: 0,
    verified_factors: 0,
    pending_factors: 0,
    audit_events: 0,
    enabled_customer_lookup: 1,
    enabled_staff_support: 0,
    lookup_staff_grants: 2,
    lookup_customer_grants: 0,
  });
  console.info("TEST fixture final counts (not native):", JSON.stringify(counts));
});

test("complete current SQL module states, dependencies, permission owners and grants match TypeScript", async () => {
  const enabled = resolveBackendModules(["profiles", "geography", "addresses", "customer_lookup"]);
  assert.deepEqual(
    (await db.query("select id, enabled from shopthie_private.app_modules order by id")).rows,
    Object.keys(backendModuleDependencies)
      .filter((id) => id !== "customer_status")
      .sort()
      .map((id) => ({ id, enabled: enabled.includes(id as (typeof enabled)[number]) })),
  );
  const dependencies = Object.entries(backendModuleDependencies)
    .filter(([id]) => id !== "customer_status")
    .flatMap(([module_id, values]) => values.map((depends_on) => ({ module_id, depends_on })))
    .sort(
      (a, b) => a.module_id.localeCompare(b.module_id) || a.depends_on.localeCompare(b.depends_on),
    );
  assert.deepEqual(
    (
      await db.query(
        "select module_id, depends_on from shopthie_private.app_module_dependencies order by module_id, depends_on",
      )
    ).rows,
    dependencies,
  );
  assert.deepEqual(
    (await db.query("select id, module_id from shopthie_private.app_permissions order by id")).rows,
    Object.entries(permissionDefinitions)
      .map(([id, spec]) => ({
        id,
        module_id: id === "customer.status.manage" ? "staff" : spec.module,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const grants = await db.query<{ role_id: string; permissions: string[] }>(
    "select role_id, array_agg(permission_id order by permission_id) permissions from shopthie_private.app_role_permissions group by role_id order by role_id",
  );
  assert.deepEqual(
    Object.fromEntries(grants.rows.map((row) => [row.role_id, row.permissions])),
    Object.fromEntries(
      Object.entries(rolePermissions).map(([role, permissions]) => [role, [...permissions].sort()]),
    ),
  );
});
