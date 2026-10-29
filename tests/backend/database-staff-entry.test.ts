import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, createAuthFixture, customerId, otherId, provision } from "./auth-fixture.ts";

// TEST ONLY: real PostgreSQL roles/SQL; synthetic users, factors and trusted claims.
// This does not verify native JWTs, authenticator challenges or provider enum types.
let db: PGlite;
let previousPermission: unknown;
let previousActor: unknown;
async function functionContract(signature: string) {
  return (
    await db.query(
      `select oid, proacl::text, proconfig, prosecdef, provolatile,
    pg_get_function_identity_arguments(oid) as arguments, pg_get_function_result(oid) as result
    from pg_proc where oid = $1::regprocedure`,
      [signature],
    )
  ).rows;
}
before(async () => {
  db = await createAuthFixture();
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  // Area 6's historical pre-tool defaults; Area 7's suite executes ALL migrations.
  for (const name of (await readdir(directory))
    .filter((name) => /^\d+_.+\.sql$/.test(name) && name <= "20261029113028_staff_entry.sql")
    .sort()) {
    if (name.endsWith("_staff_entry.sql")) {
      previousPermission = await functionContract("shopthie_private.has_permission(text)");
      previousActor = await functionContract("public.shopthie_actor_context()");
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
    await provision(db);
    await provision(db, otherId);
    await work();
  } finally {
    await db.exec("rollback");
  }
}
async function actor(aal: unknown = "aal2", id = customerId) {
  await asActor(db, "authenticated", {
    sub: id,
    aal,
    user_metadata: { role: "owner", status: "active", mfa_required: false },
    app_metadata: { role: "owner", permissions: ["staff.enter", "audit.read"] },
  });
}
async function permission(id: string) {
  return (
    await db.query<{ allowed: boolean }>("select shopthie_private.has_permission($1) as allowed", [
      id,
    ])
  ).rows[0].allowed;
}
async function entry() {
  return (await db.query("select * from public.shopthie_staff_entry()")).rows;
}
async function rejected(sql: string, code = "42501") {
  await db.exec("savepoint rejection");
  try {
    await assert.rejects(
      db.exec(sql),
      (error: unknown) => (error as { code?: string }).code === code,
    );
  } finally {
    await db.exec("rollback to savepoint rejection; release savepoint rejection");
  }
}
async function setStaff(role = "owner", id = customerId) {
  await db.exec("reset role");
  await db.query("update shopthie_private.app_user_roles set role_id = $1 where user_id = $2", [
    role,
    id,
  ]);
}
async function factor(id = customerId, status = "verified", type = "totp") {
  await db.exec("reset role");
  await db.query(
    "insert into auth.mfa_factors (user_id, status, factor_type) values ($1, $2, $3)",
    [id, status, type],
  );
}

test("all staff capabilities require AAL2 and the caller's current verified TOTP, including after final deletion", async () =>
  isolated(async () => {
    await setStaff();
    await actor();
    assert.equal(
      await permission("audit.read"),
      false,
      "staff AAL2 without a factor must fail closed",
    );
    await factor(otherId);
    await factor(customerId, "unverified");
    await factor(customerId, "verified", "phone");
    await actor();
    assert.equal(
      await permission("audit.read"),
      false,
      "foreign, pending and non-TOTP factors do not authorize staff",
    );
    await factor();
    for (const role of ["owner", "admin"]) {
      await setStaff(role);
      for (const aal of [undefined, null, "aal1", "unexpected", "aal2"]) {
        await actor(aal === undefined ? {} : aal);
        assert.equal(await permission("audit.read"), aal === "aal2", `${role}/${String(aal)}`);
      }
    }
    await db.exec(
      "reset role; delete from auth.mfa_factors where factor_type = 'totp' and status = 'verified'",
    );
    await actor();
    assert.equal(
      await permission("audit.read"),
      false,
      "unchanged stale AAL2 claims cannot survive last TOTP deletion",
    );
  }));

test("Owner/Admin verified TOTP AAL2 entry returns exactly the current self ID and role with staff/support off", async () =>
  isolated(async () => {
    await factor();
    await factor(otherId);
    for (const [id, role] of [
      [customerId, "owner"],
      [otherId, "admin"],
    ]) {
      await setStaff(role, id);
      await actor("aal2", id);
      assert.deepEqual(await entry(), [{ user_id: id, role }]);
      assert.deepEqual((await db.query("select * from shopthie_private.staff_entry()")).rows, [
        { user_id: id, role },
      ]);
      assert.equal(await permission("staff.enter"), true);
      for (const permissionId of ["staff.manage", "customer.lookup", "support.private.read"])
        assert.equal(await permission(permissionId), false);
    }
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select id, enabled from shopthie_private.app_modules where id in ('staff', 'support') order by id",
        )
      ).rows,
      [
        { id: "staff", enabled: false },
        { id: "support", enabled: false },
      ],
    );
    assert.deepEqual(
      (
        await db.query(
          "select id, module_id from shopthie_private.app_permissions where id = 'staff.enter'",
        )
      ).rows,
      [{ id: "staff.enter", module_id: "identity" }],
    );
    assert.deepEqual(
      (
        await db.query(
          "select role_id from shopthie_private.app_role_permissions where permission_id = 'staff.enter' order by role_id",
        )
      ).rows,
      [{ role_id: "admin" }, { role_id: "owner" }],
    );
  }));

test("staff entry rejects anonymous, Customer metadata forgery, missing membership and suspension", async () =>
  isolated(async () => {
    await asActor(db, "anon");
    await rejected("select * from public.shopthie_staff_entry()");
    await actor();
    assert.deepEqual(await entry(), []);
    await rejected(`select * from public.shopthie_staff_entry('${otherId}'::uuid)`, "42883");
    await setStaff();
    await factor();
    await actor();
    assert.deepEqual(await entry(), [{ user_id: customerId, role: "owner" }]);
    await db.exec("reset role; update shopthie_private.app_accounts set status='suspended'");
    await actor();
    assert.deepEqual(await entry(), []);
    await db.exec(
      "reset role; update shopthie_private.app_accounts set status='active'; delete from shopthie_private.app_user_roles",
    );
    await actor();
    assert.deepEqual(await entry(), []);
  }));

test("staff entry respects grant revocation and role changes without replacing test claims", async () =>
  isolated(async () => {
    await setStaff();
    await factor();
    await actor();
    assert.equal(await permission("staff.enter"), true);
    await db.exec(
      "reset role; delete from shopthie_private.app_role_permissions where role_id='owner' and permission_id='staff.enter'",
    );
    await actor();
    assert.deepEqual(await entry(), []);
    await db.exec(
      "reset role; insert into shopthie_private.app_role_permissions values ('owner','staff.enter')",
    );
    await setStaff("customer");
    await actor();
    assert.deepEqual(await entry(), []);
  }));

test("new RPC ACLs and fixed-path boundaries preserve old permission and actor contracts", async () => {
  assert.deepEqual(
    await functionContract("shopthie_private.has_permission(text)"),
    previousPermission,
  );
  assert.deepEqual(await functionContract("public.shopthie_actor_context()"), previousActor);
  const functions =
    await db.query(`select n.nspname as schema, p.prosecdef as definer, p.proconfig as settings,
    pg_get_function_identity_arguments(p.oid) as arguments,
    has_function_privilege('anon',p.oid,'execute') as anon_execute,
    has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname='shopthie_staff_entry') or (n.nspname='shopthie_private' and p.proname='staff_entry') order by n.nspname`);
  assert.deepEqual(functions.rows, [
    {
      schema: "public",
      definer: false,
      settings: ['search_path=""'],
      arguments: "",
      anon_execute: false,
      authenticated_execute: true,
      public_execute: false,
    },
    {
      schema: "shopthie_private",
      definer: true,
      settings: ['search_path=""'],
      arguments: "",
      anon_execute: false,
      authenticated_execute: true,
      public_execute: false,
    },
  ]);
  for (const name of [
    "app_accounts",
    "app_user_roles",
    "app_role_permissions",
    "profiles",
    "addresses",
  ]) {
    const privileges = await db.query<{ allowed: boolean }>(
      "select has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') as allowed",
      [`shopthie_private.${name}`],
    );
    assert.equal(privileges.rows[0].allowed, false);
  }
});
