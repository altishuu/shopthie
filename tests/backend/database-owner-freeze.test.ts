import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createAuthFixture, provision, customerId, otherId } from "./auth-fixture.ts";
const directory = new URL("../../supabase/migrations/", import.meta.url);
const migration = "20261104143127_owner_freeze.sql";
test("historical Area11 owner freeze installs with zero Owners and blocks promotion while Customer status remains writable", async () => {
  const db = await createAuthFixture();
  try {
    for (const name of (await readdir(directory))
      .filter((n) => /^\d+_.+\.sql$/.test(n) && n < migration)
      .sort())
      await db.exec(await readFile(new URL(name, directory), "utf8"));
    await provision(db, customerId);
    await provision(db, otherId);
    const sql = await readFile(new URL(migration, directory), "utf8");
    await db.exec(sql);
    await assert.rejects(
      db.query("update shopthie_private.app_user_roles set role_id='owner' where user_id=$1", [
        customerId,
      ]),
    );
    await db.query("update shopthie_private.app_accounts set status='suspended' where user_id=$1", [
      otherId,
    ]);
    const r = await db.query<{ status: string }>(
      "select status from shopthie_private.app_accounts where user_id=$1",
      [otherId],
    );
    assert.equal(r.rows[0].status, "suspended");
    const { backendModuleDependencies, resolveBackendModules } =
      await import("../../src/modules/registry.ts");
    const { permissionDefinitions, rolePermissions } =
      await import("../../src/modules/access/permissions.ts");
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
    const dependencies = Object.entries(backendModuleDependencies)
      .filter(([id]) => id !== "owner_setup")
      .flatMap(([module_id, values]) => values.map((depends_on) => ({ module_id, depends_on })))
      .sort(
        (a, b) =>
          a.module_id.localeCompare(b.module_id) || a.depends_on.localeCompare(b.depends_on),
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
      (await db.query("select id,module_id from shopthie_private.app_permissions order by id"))
        .rows,
      Object.entries(permissionDefinitions)
        .filter(([id]) => id !== "owner.bootstrap.request_own")
        .map(([id, spec]) => ({ id, module_id: spec.module }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    const grants = (
      await db.query<{ role_id: string; permissions: string[] }>(
        "select role_id,array_agg(permission_id order by permission_id) permissions from shopthie_private.app_role_permissions group by role_id order by role_id",
      )
    ).rows;
    assert.deepEqual(
      Object.fromEntries(grants.map((row) => [row.role_id, row.permissions])),
      Object.fromEntries(
        Object.entries(rolePermissions).map(([role, permissions]) => [
          role,
          permissions.filter((id) => id !== "owner.bootstrap.request_own").sort(),
        ]),
      ),
    );
  } finally {
    await db.close();
  }
});

for (const table of ["app_accounts", "app_user_roles"]) {
  test(`installation rejects an untrusted owner of ${table} that could disable triggers`, async () => {
    const db = await migratedFixture();
    try {
      await db.exec(
        `create role untrusted_table_owner nologin nosuperuser nobypassrls; grant usage,create on schema shopthie_private to untrusted_table_owner; alter table shopthie_private.${table} owner to untrusted_table_owner;`,
      );
      await assert.rejects(
        db.exec(await readFile(new URL(migration, directory), "utf8")),
        /owner_freeze_unsafe_protected_owner/,
      );
    } finally {
      await db.close();
    }
  });
}
test("installation rejects untrusted parameter privileges that permit trigger bypass", async () => {
  const db = await migratedFixture();
  try {
    await db.exec(
      "create role replication_setter nologin; grant set on parameter session_replication_role to replication_setter;",
    );
    await assert.rejects(
      db.exec(await readFile(new URL(migration, directory), "utf8")),
      /owner_freeze_unsafe_replication_privilege/,
    );
  } finally {
    await db.close();
  }
});

test("freeze guards remain active in a session already using replica trigger mode", async () => {
  const db = await migratedFixture();
  try {
    await provision(db, customerId);
    await db.query("update shopthie_private.app_user_roles set role_id='owner' where user_id=$1", [
      customerId,
    ]);
    await db.exec(await readFile(new URL(migration, directory), "utf8"));
    // Synthetic privileged setup models a pre-existing session setting; no real session is changed.
    await db.exec("set session_replication_role=replica");
    await assert.rejects(
      db.query("update shopthie_private.app_accounts set status='suspended' where user_id=$1", [
        customerId,
      ]),
      /owner_frozen/,
    );
  } finally {
    await db.close();
  }
});

async function migratedFixture() {
  const db = await createAuthFixture();
  for (const name of (await readdir(directory))
    .filter((n) => /^\d+_.+\.sql$/.test(n) && n < migration)
    .sort())
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  return db;
}

test("installation rejects inherited effective marker write privileges from default ACLs", async () => {
  const db = await migratedFixture();
  try {
    await db.exec(`create role marker_writer nologin; create role marker_member nologin;
      grant marker_writer to marker_member;
      alter default privileges in schema shopthie_private grant insert on tables to marker_writer;`);
    await assert.rejects(
      db.exec(await readFile(new URL(migration, directory), "utf8")),
      /owner_freeze_unsafe_marker_acl/,
    );
  } finally {
    await db.close();
  }
});

test("installation rejects unexpected effective guard execution from default ACLs", async () => {
  const db = await migratedFixture();
  try {
    await db.exec(`create role extra_executor nologin;
      alter default privileges in schema shopthie_private grant execute on functions to extra_executor;`);
    await assert.rejects(
      db.exec(await readFile(new URL(migration, directory), "utf8")),
      /owner_freeze_unsafe_function_acl/,
    );
  } finally {
    await db.close();
  }
});

test("installation rejects a forced-RLS membership table when the definer cannot bypass RLS", async () => {
  const db = await migratedFixture();
  try {
    await db.exec(`create role limited_owner nologin nosuperuser nobypassrls;
      grant usage, create on schema shopthie_private to limited_owner;
      alter table shopthie_private.app_accounts owner to limited_owner;
      alter table shopthie_private.app_user_roles owner to limited_owner;
      alter table shopthie_private.app_user_roles enable row level security;
      alter table shopthie_private.app_user_roles force row level security;
      set role limited_owner;`);
    await assert.rejects(
      db.exec(await readFile(new URL(migration, directory), "utf8")),
      /owner_freeze_unsafe_role_visibility/,
    );
  } finally {
    await db.close();
  }
});

test("installation rejects NOINHERIT membership that can assume pg_write_all_data", async () => {
  const db = await migratedFixture();
  try {
    await db.exec(`create role marker_assumer nologin noinherit;
      grant pg_write_all_data to marker_assumer;`);
    await assert.rejects(
      db.exec(await readFile(new URL(migration, directory), "utf8")),
      /owner_freeze_unsafe_trusted_membership/,
    );
  } finally {
    await db.close();
  }
});

test("installation permits FORCE RLS when the definer actually bypasses RLS", async () => {
  const db = await migratedFixture();
  try {
    await db.exec(`alter table shopthie_private.app_user_roles enable row level security;
      alter table shopthie_private.app_user_roles force row level security;`);
    const role = await db.query<{ bypass: boolean }>(
      "select rolsuper or rolbypassrls as bypass from pg_roles where rolname=current_user",
    );
    assert.equal(role.rows[0].bypass, true);
    await db.exec(await readFile(new URL(migration, directory), "utf8"));
    const flags = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity, relforcerowsecurity from pg_class where oid='shopthie_private.app_user_roles'::regclass",
    );
    assert.deepEqual(flags.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
  } finally {
    await db.close();
  }
});
