import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, createAuthFixture, customerId, otherId, provision } from "./auth-fixture.ts";
import { backendModuleDependencies, resolveBackendModules } from "../../src/modules/registry.ts";
import { permissionDefinitions, rolePermissions } from "../../src/modules/access/permissions.ts";

const migration = new URL(
  "../../supabase/migrations/20261028145618_authority_foundation.sql",
  import.meta.url,
);
let db: PGlite;
before(async () => {
  assert.ok(existsSync(migration), "Area 1 authority migration must exist");
  db = await createAuthFixture();
  await db.exec(await readFile(migration, "utf8"));
  // Latest authority extension, without activating optional data modules in this foundation fixture.
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => /^\d+_staff_entry\.sql$/.test(name))
    .sort())
    await db.exec(await readFile(new URL(name, directory), "utf8"));
});
after(async () => {
  await db?.close();
});

async function isolated(work: () => Promise<void>) {
  await db.exec("begin");
  try {
    await work();
  } finally {
    await db.exec("rollback");
  }
}

test("new auth identities always provision active Customers, ignoring privileged metadata", async () =>
  isolated(async () => {
    await asActor(db, "supabase_auth_admin");
    for (const id of [customerId, otherId]) {
      await db.query(
        `insert into auth.users (id, raw_user_meta_data, raw_app_meta_data)
      values ($1, '{"role":"owner","status":"active","permissions":["staff.manage"]}', '{"role":"admin"}')`,
        [id],
      );
    }
    await db.exec("reset role");
    const rows =
      await db.query(`select a.user_id, a.status, r.role_id from shopthie_private.app_accounts a
    join shopthie_private.app_user_roles r using (user_id) order by user_id`);
    assert.deepEqual(
      rows.rows,
      [customerId, otherId].map((user_id) => ({ user_id, status: "active", role_id: "customer" })),
    );
  }));

async function permission(permissionId: string) {
  const result = await db.query<{ allowed: boolean }>(
    "select shopthie_private.has_permission($1) as allowed",
    [permissionId],
  );
  return result.rows[0].allowed;
}

test("permission helper enforces the full role grant matrix, current membership, MFA and module gates", async () =>
  isolated(async () => {
    await provision(db);
    const permissionIds = roleGrants.owner;
    for (const [roleId, grants] of Object.entries(roleGrants)) {
      await db.exec("reset role; delete from auth.mfa_factors");
      if (roleId !== "customer")
        await db.query(
          "insert into auth.mfa_factors(user_id,status,factor_type) values ($1,'verified','totp')",
          [customerId],
        );
      await db.query("update shopthie_private.app_user_roles set role_id = $1 where user_id = $2", [
        roleId,
        customerId,
      ]);
      for (const aal of [undefined, "aal1", "aal2", "unexpected"]) {
        await asActor(db, "authenticated", {
          sub: customerId,
          aal,
          user_metadata: { role: "owner" },
          app_metadata: { role: "owner" },
        });
        for (const id of permissionIds) {
          assert.equal(
            await permission(id),
            ["audit.read", "staff.enter"].includes(id) && grants.includes(id) && aal === "aal2",
            `${roleId}/${aal}/${id}: optional modules start disabled`,
          );
        }
      }
      await db.exec("reset role; update shopthie_private.app_modules set enabled = true");
      for (const aal of [undefined, "aal1", "aal2", "unexpected"]) {
        await asActor(db, "authenticated", {
          sub: customerId,
          aal,
          user_metadata: { role: "owner" },
          app_metadata: { role: "owner" },
        });
        for (const id of permissionIds) {
          assert.equal(
            await permission(id),
            grants.includes(id) &&
              (roleId === "customer" ? aal === "aal1" || aal === "aal2" : aal === "aal2"),
            `${roleId}/${aal}/${id}`,
          );
        }
        assert.equal(await permission("unknown.permission"), false);
      }
      await db.exec(
        "reset role; update shopthie_private.app_modules set enabled = false where id not in ('identity', 'access', 'audit')",
      );
    }
  }));

test("suspension revokes capabilities immediately without replacing the JWT", async () =>
  isolated(async () => {
    await provision(db);
    await db.exec("update shopthie_private.app_modules set enabled = true where id = 'profiles'");
    const claims = {
      sub: customerId,
      aal: "aal2",
      user_metadata: { status: "active", role: "owner" },
    };
    await asActor(db, "authenticated", claims);
    assert.equal(await permission("profile.read_own"), true);
    await db.exec("reset role; update shopthie_private.app_accounts set status = 'suspended'");
    await asActor(db, "authenticated", claims);
    assert.equal(await permission("profile.read_own"), false);
    await db.exec("reset role; update shopthie_private.app_accounts set status = 'active'");
    await asActor(db, "authenticated", claims);
    assert.equal(await permission("profile.read_own"), true);
  }));

test("a Customer with a verified MFA factor must use aal2 for every capability", async () =>
  isolated(async () => {
    await provision(db);
    await provision(db, otherId);
    await db.exec("update shopthie_private.app_modules set enabled = true");
    await db.query(
      "insert into auth.mfa_factors (user_id, status) values ($1, 'unverified'), ($2, 'verified')",
      [customerId, otherId],
    );
    await asActor(db, "authenticated", {
      sub: customerId,
      aal: "aal1",
      user_metadata: { mfa_required: false },
    });
    assert.equal(
      await permission("profile.read_own"),
      true,
      "unverified and another user's verified factors do not require MFA",
    );
    await db.exec("reset role");
    await db.query("update auth.mfa_factors set status = 'verified' where user_id = $1", [
      customerId,
    ]);
    for (const aal of ["aal1", "aal2"]) {
      await asActor(db, "authenticated", {
        sub: customerId,
        aal,
        user_metadata: { mfa_required: false },
      });
      for (const id of roleGrants.customer) assert.equal(await permission(id), aal === "aal2", id);
    }
  }));

test("audit storage exists privately without a client event writer or reader", async () =>
  isolated(async () => {
    await provision(db);
    await db.query(
      `insert into shopthie_private.audit_events (actor_id, target_id, event_type, reason_category, outcome)
    values ($1, $1, 'foundation.test', 'local_fixture', 'success')`,
      [customerId],
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from shopthie_private.audit_events",
        )
      ).rows[0].count,
      1,
    );
    for (const role of ["anon", "authenticated"] as const) {
      await asActor(db, role, { sub: customerId, aal: "aal2", user_metadata: { role: "owner" } });
      await denied("select * from shopthie_private.audit_events");
      await denied(
        "insert into shopthie_private.audit_events (event_type, outcome) values ('forged', 'success')",
      );
    }
  }));

async function denied(sql: string, code = "42501") {
  await db.exec("savepoint denial");
  try {
    await assert.rejects(
      db.exec(sql),
      (error: unknown) => (error as { code?: string }).code === code,
    );
  } finally {
    await db.exec("rollback to savepoint denial; release savepoint denial");
  }
}

test("actor context returns only the caller's minimal current authority, never another account", async () =>
  isolated(async () => {
    await provision(db);
    await provision(db, otherId);
    await asActor(db, "authenticated", {
      sub: customerId,
      aal: "aal1",
      user_metadata: { role: "owner" },
    });
    const own = await db.query("select * from public.shopthie_actor_context()");
    assert.deepEqual(own.rows, [
      { user_id: customerId, status: "active", role: "customer", aal: "aal1", mfa_required: false },
    ]);
    await denied(`select * from public.shopthie_actor_context('${otherId}'::uuid)`, "42883");
    await db.exec("reset role");
    await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [
      customerId,
    ]);
    await db.query(
      "update shopthie_private.app_accounts set status = 'suspended' where user_id = $1",
      [customerId],
    );
    await asActor(db, "authenticated", { sub: customerId, aal: "aal1" });
    assert.deepEqual((await db.query("select * from public.shopthie_actor_context()")).rows, [
      {
        user_id: customerId,
        status: "suspended",
        role: "customer",
        aal: "aal1",
        mfa_required: true,
      },
    ]);
    for (const roleId of ["owner", "admin"]) {
      await db.exec("reset role");
      await db.query("update shopthie_private.app_user_roles set role_id = $1 where user_id = $2", [
        roleId,
        otherId,
      ]);
      await asActor(db, "authenticated", { sub: otherId, aal: "aal2" });
      assert.deepEqual((await db.query("select * from public.shopthie_actor_context()")).rows, [
        { user_id: otherId, status: "active", role: roleId, aal: "aal2", mfa_required: true },
      ]);
    }
    for (const claims of [{}, { sub: "00000000-0000-4000-8000-000000000099", aal: "aal2" }]) {
      await asActor(db, "authenticated", claims);
      assert.deepEqual((await db.query("select * from public.shopthie_actor_context()")).rows, []);
    }
    await asActor(db, "anon");
    await denied("select * from public.shopthie_actor_context()");
  }));

test("Before User Created hook rejects every registration payload including forged approvals", async () =>
  isolated(async () => {
    await asActor(db, "supabase_auth_admin");
    for (const event of [
      null,
      {},
      {
        user: {
          email: "fixture@example.invalid",
          user_metadata: {
            role: "owner",
            age_ok: true,
            registration_approved: true,
            email_verified: true,
          },
          app_metadata: { registration_approved: true },
        },
        registration_enabled: true,
        approved: true,
      },
    ]) {
      const result = await db.query<{ response: unknown }>(
        "select shopthie_private.before_user_created($1::jsonb) as response",
        [event === null ? null : JSON.stringify(event)],
      );
      assert.deepEqual(result.rows[0].response, {
        error: {
          http_code: 403,
          message:
            "Public registration is unavailable until email and eligibility policies are approved.",
        },
      });
    }
    await db.exec("reset role");
    assert.equal(
      (await db.query<{ count: number }>("select count(*)::int as count from auth.users")).rows[0]
        .count,
      0,
    );
    for (const role of ["anon", "authenticated"] as const) {
      await asActor(db, role, { sub: customerId, aal: "aal2" });
      await denied("select shopthie_private.before_user_created('{}'::jsonb)");
    }
  }));

const authorityTables = [
  "app_modules",
  "app_module_dependencies",
  "app_roles",
  "app_permissions",
  "app_role_permissions",
  "app_accounts",
  "app_user_roles",
  "audit_events",
];

test("anon and every application role are blocked from raw authority reads and mutations", async () =>
  isolated(async () => {
    await provision(db);
    const mutations: Record<string, string> = {
      app_modules: "(id, enabled) values ('forged', true)",
      app_module_dependencies: "(module_id, depends_on) values ('geography', 'profiles')",
      app_roles: "(id) values ('manager')",
      app_permissions: "(id, module_id) values ('forged', 'access')",
      app_role_permissions: "(role_id, permission_id) values ('customer', 'staff.manage')",
      app_accounts: `(user_id) values ('${otherId}')`,
      app_user_roles: `(user_id, role_id) values ('${otherId}', 'owner')`,
      audit_events: "(event_type, outcome) values ('forged', 'success')",
    };
    const updates: Record<string, string> = {
      app_accounts: "status = 'suspended'",
      app_user_roles: "role_id = 'owner'",
      app_role_permissions: "role_id = 'owner'",
      app_module_dependencies: "depends_on = depends_on",
      audit_events: "outcome = 'forged'",
    };
    for (const appRole of ["customer", "admin", "owner"]) {
      await db.exec("reset role");
      await db.query("update shopthie_private.app_user_roles set role_id = $1", [appRole]);
      for (const databaseRole of ["anon", "authenticated"] as const) {
        await asActor(db, databaseRole, {
          sub: customerId,
          aal: "aal2",
          user_metadata: { role: appRole },
        });
        for (const table of authorityTables) {
          await denied(`select * from shopthie_private.${table}`);
          await denied(`insert into shopthie_private.${table} ${mutations[table]}`);
          await denied(`update shopthie_private.${table} set ${updates[table] ?? "id = id"}`);
          await denied(`delete from shopthie_private.${table}`);
          await denied(`truncate shopthie_private.${table} cascade`);
        }
        await denied("select shopthie_private.provision_customer()");
      }
    }
  }));

test("default-deny RLS still hides authority rows if SELECT and DML grants are accidentally added", async () =>
  isolated(async () => {
    await provision(db);
    await db.exec(
      "grant usage on schema shopthie_private to anon; grant select, insert, update, delete on all tables in schema shopthie_private to anon, authenticated",
    );
    for (const databaseRole of ["anon", "authenticated"] as const) {
      await asActor(db, databaseRole, {
        sub: customerId,
        aal: "aal2",
        user_metadata: { role: "owner" },
      });
      for (const table of authorityTables) {
        assert.deepEqual(
          (await db.query(`select * from shopthie_private.${table}`)).rows,
          [],
          table,
        );
        assert.equal(
          (await db.query(`delete from shopthie_private.${table}`)).affectedRows,
          0,
          table,
        );
      }
      assert.equal(
        (await db.query("update shopthie_private.app_user_roles set role_id = 'owner'"))
          .affectedRows,
        0,
      );
      assert.equal(
        (await db.query("update shopthie_private.app_modules set enabled = true")).affectedRows,
        0,
      );
      await denied("insert into shopthie_private.app_roles (id) values ('manager')");
      await denied(
        "insert into shopthie_private.audit_events (event_type, outcome) values ('forged', 'success')",
      );
    }
  }));

test("current membership removal and stale Owner JWT metadata never authorize an actor", async () =>
  isolated(async () => {
    await provision(db);
    const claims = {
      sub: customerId,
      aal: "aal2",
      user_metadata: { role: "owner" },
      app_metadata: { role: "owner" },
    };
    await db.exec("update shopthie_private.app_user_roles set role_id = 'owner'");
    await db.query("insert into auth.mfa_factors(user_id,status) values ($1,'verified')", [
      customerId,
    ]);
    await asActor(db, "authenticated", claims);
    assert.equal(await permission("audit.read"), true);
    await db.exec("reset role; update shopthie_private.app_user_roles set role_id = 'customer'");
    await asActor(db, "authenticated", claims);
    assert.equal(await permission("audit.read"), false);
    await db.exec("reset role; delete from shopthie_private.app_user_roles");
    await asActor(db, "authenticated", claims);
    assert.equal(await permission("audit.read"), false);
    assert.deepEqual((await db.query("select * from public.shopthie_actor_context()")).rows, []);
    await asActor(db, "authenticated", { aal: "aal2" });
    assert.equal(await permission("audit.read"), false);
  }));

test("permission helper composes with an actual owner-scoped RLS policy (TEST probe, not a customer feature)", async () =>
  isolated(async () => {
    await provision(db);
    await provision(db, otherId);
    await db.exec(`
    create table public.authority_policy_probe (user_id uuid primary key);
    insert into public.authority_policy_probe values ('${customerId}'), ('${otherId}');
    alter table public.authority_policy_probe enable row level security;
    grant select on public.authority_policy_probe to authenticated;
    create policy own_test_probe on public.authority_policy_probe for select to authenticated
      using (user_id = (select auth.uid()) and (select shopthie_private.has_permission('profile.read_own')));
  `);
    await asActor(db, "authenticated", { sub: customerId, aal: "aal1" });
    assert.deepEqual(
      (await db.query("select * from public.authority_policy_probe")).rows,
      [],
      "disabled module denies policy",
    );
    await db.exec(
      "reset role; update shopthie_private.app_modules set enabled = true where id = 'profiles'",
    );
    for (const id of [customerId, otherId]) {
      await asActor(db, "authenticated", {
        sub: id,
        aal: "aal1",
        user_metadata: { role: "owner" },
      });
      assert.deepEqual((await db.query("select * from public.authority_policy_probe")).rows, [
        { user_id: id },
      ]);
    }
    await db.exec("reset role");
    await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [
      otherId,
    ]);
    await asActor(db, "authenticated", { sub: otherId, aal: "aal1" });
    assert.deepEqual((await db.query("select * from public.authority_policy_probe")).rows, []);
    await asActor(db, "authenticated", { sub: otherId, aal: "aal2" });
    assert.deepEqual((await db.query("select * from public.authority_policy_probe")).rows, [
      { user_id: otherId },
    ]);
    await db.exec("reset role; update shopthie_private.app_accounts set status = 'suspended'");
    await asActor(db, "authenticated", { sub: otherId, aal: "aal2" });
    assert.deepEqual((await db.query("select * from public.authority_policy_probe")).rows, []);
  }));

test("required modules cannot be disabled and unknown role assignments fail constraints", async () =>
  isolated(async () => {
    await provision(db);
    for (const moduleId of ["identity", "access", "audit"]) {
      await denied(
        `update shopthie_private.app_modules set enabled = false where id = '${moduleId}'`,
        "23514",
      );
    }
    for (const roleId of ["manager", "cashier", "Owner"]) {
      await denied(`update shopthie_private.app_user_roles set role_id = '${roleId}'`, "23503");
    }
    await asActor(db, "authenticated", { sub: customerId, aal: "aal2" });
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select shopthie_private.has_permission(null) as allowed",
        )
      ).rows[0].allowed,
      false,
    );
  }));

test("installed function security is locked down with no privileged public RPC", async () => {
  const installed = await db.query<{ name: string; definer: boolean; settings: string[] }>(`
    select n.nspname || '.' || p.proname as name, p.prosecdef as definer, p.proconfig as settings
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'shopthie_private' or (n.nspname = 'public' and p.proname like 'shopthie_%')
    order by name
  `);
  assert.deepEqual(installed.rows, [
    { name: "public.shopthie_actor_context", definer: false, settings: ['search_path=""'] },
    { name: "public.shopthie_staff_entry", definer: false, settings: ['search_path=""'] },
    { name: "shopthie_private.actor_context", definer: true, settings: ['search_path=""'] },
    { name: "shopthie_private.before_user_created", definer: false, settings: ['search_path=""'] },
    { name: "shopthie_private.has_permission", definer: true, settings: ['search_path=""'] },
    { name: "shopthie_private.provision_customer", definer: true, settings: ['search_path=""'] },
    { name: "shopthie_private.staff_entry", definer: true, settings: ['search_path=""'] },
  ]);
});

test("historical foundation defaults/dependencies/grants match the pre-lookup TypeScript contract", async () => {
  // This fixture intentionally loads only foundation + staff_entry. Current complete
  // registry/SQL parity is separately asserted in database-audit-view.test.ts.
  const historicalModules = Object.fromEntries(
    Object.entries(backendModuleDependencies).filter(
      ([id]) => !["customer_lookup", "customer_status", "audit_view"].includes(id),
    ),
  );
  const required = resolveBackendModules();
  assert.deepEqual(
    (await db.query("select id, enabled from shopthie_private.app_modules order by id")).rows,
    Object.keys(historicalModules)
      .sort()
      .map((id) => ({ id, enabled: required.includes(id as (typeof required)[number]) })),
  );
  const expectedDependencies = Object.entries(historicalModules)
    .flatMap(([module_id, dependencies]) =>
      dependencies.map((depends_on) => ({ module_id, depends_on })),
    )
    .sort(
      (a, b) => a.module_id.localeCompare(b.module_id) || a.depends_on.localeCompare(b.depends_on),
    );
  assert.deepEqual(
    (
      await db.query(
        "select module_id, depends_on from shopthie_private.app_module_dependencies order by module_id, depends_on",
      )
    ).rows,
    expectedDependencies,
  );
  assert.deepEqual(
    (await db.query("select id, module_id from shopthie_private.app_permissions order by id")).rows,
    Object.entries(permissionDefinitions)
      .map(([id, spec]) => ({
        id,
        module_id: ["customer.lookup", "customer.status.manage"].includes(id)
          ? "staff"
          : id === "audit.read"
            ? "audit"
            : spec.module,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const grants = await db.query<{ role_id: string; permissions: string[] }>(`
    select role_id, array_agg(permission_id order by permission_id) permissions
    from shopthie_private.app_role_permissions group by role_id order by role_id
  `);
  assert.deepEqual(
    Object.fromEntries(grants.rows.map((row) => [row.role_id, row.permissions])),
    Object.fromEntries(
      Object.entries(rolePermissions).map(([role, permissions]) => [role, [...permissions].sort()]),
    ),
  );
});

test("enabled capabilities still deny when a direct or transitive module dependency is disabled", async () =>
  isolated(async () => {
    await provision(db);
    await db.exec(
      "update shopthie_private.app_user_roles set role_id = 'owner'; update shopthie_private.app_modules set enabled = true",
    );
    await db.query("insert into auth.mfa_factors(user_id,status) values ($1,'verified')", [
      customerId,
    ]);
    const cases = [
      {
        disabled: "profiles",
        denied: [
          "profile.read_own",
          "profile.update_own",
          "address.manage_own",
          "customer.lookup",
          "customer.status.manage",
          "staff.manage",
          "support.private.read",
        ],
      },
      { disabled: "geography", denied: ["address.manage_own"] },
      {
        disabled: "staff",
        denied: [
          "customer.lookup",
          "customer.status.manage",
          "staff.manage",
          "support.private.read",
        ],
      },
    ];
    for (const scenario of cases) {
      await db.exec("reset role; update shopthie_private.app_modules set enabled = true");
      await db.query("update shopthie_private.app_modules set enabled = false where id = $1", [
        scenario.disabled,
      ]);
      await asActor(db, "authenticated", { sub: customerId, aal: "aal2" });
      for (const id of roleGrants.owner)
        assert.equal(
          await permission(id),
          !scenario.denied.includes(id),
          `${scenario.disabled}/${id}`,
        );
    }
  }));

const roleGrants = {
  customer: ["address.manage_own", "profile.read_own", "profile.update_own"],
  admin: [
    "address.manage_own",
    "audit.read",
    "customer.lookup",
    "customer.status.manage",
    "profile.read_own",
    "profile.update_own",
    "staff.enter",
    "support.private.read",
  ],
  owner: [
    "address.manage_own",
    "audit.read",
    "customer.lookup",
    "customer.status.manage",
    "profile.read_own",
    "profile.update_own",
    "staff.enter",
    "staff.manage",
    "support.private.read",
  ],
};

test("migration applies and seeds the complete reviewed role grants and module defaults", async () => {
  const modules = await db.query(
    "select id, enabled from shopthie_private.app_modules order by id",
  );
  assert.deepEqual(modules.rows, [
    { id: "access", enabled: true },
    { id: "addresses", enabled: false },
    { id: "audit", enabled: true },
    { id: "geography", enabled: false },
    { id: "identity", enabled: true },
    { id: "profiles", enabled: false },
    { id: "staff", enabled: false },
    { id: "support", enabled: false },
  ]);
  const roles = await db.query("select id from shopthie_private.app_roles order by id");
  assert.deepEqual(roles.rows, [{ id: "admin" }, { id: "customer" }, { id: "owner" }]);
  const grants = await db.query<{ role_id: string; permissions: string[] }>(`
    select role_id, array_agg(permission_id order by permission_id) permissions
    from shopthie_private.app_role_permissions group by role_id order by role_id
  `);
  assert.deepEqual(
    Object.fromEntries(grants.rows.map((row) => [row.role_id, row.permissions])),
    roleGrants,
  );
  const permissions = await db.query(
    "select id, module_id from shopthie_private.app_permissions order by id",
  );
  assert.deepEqual(permissions.rows, [
    { id: "address.manage_own", module_id: "addresses" },
    { id: "audit.read", module_id: "audit" },
    { id: "customer.lookup", module_id: "staff" },
    { id: "customer.status.manage", module_id: "staff" },
    { id: "profile.read_own", module_id: "profiles" },
    { id: "profile.update_own", module_id: "profiles" },
    { id: "staff.enter", module_id: "identity" },
    { id: "staff.manage", module_id: "staff" },
    { id: "support.private.read", module_id: "support" },
  ]);
});
