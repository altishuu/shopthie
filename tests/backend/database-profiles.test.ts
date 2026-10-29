import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, createAuthFixture, customerId, otherId, provision } from "./auth-fixture.ts";

// Real embedded PostgreSQL and database roles. Trusted TEST claims only: no JWT verification.
let db: PGlite;
before(async () => {
  db = await createAuthFixture();
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  await db.exec(
    await readFile(new URL("20261028145618_authority_foundation.sql", directory), "utf8"),
  );
  const profiles = (await readdir(directory)).filter((name) => /^\d+_profiles\.sql$/.test(name));
  assert.equal(profiles.length, 1, "exactly one profiles migration must exist");
  await db.exec(await readFile(new URL(profiles[0], directory), "utf8"));
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
    await provision(db, customerId);
    await provision(db, otherId);
    await work();
  } finally {
    await db.exec("rollback");
  }
}

async function actor(id = customerId, extra: Record<string, unknown> = {}) {
  await asActor(db, "authenticated", { sub: id, aal: "aal1", ...extra });
}

async function read() {
  return (await db.query<{ profile: unknown }>("select public.shopthie_profile_read() as profile"))
    .rows[0].profile;
}

async function save(username: string | null, phone: string | null, revision: number | null) {
  return (
    await db.query<{ profile: unknown }>(
      "select public.shopthie_profile_save($1::text, $2::text, $3::integer) as profile",
      [username, phone, revision],
    )
  ).rows[0].profile;
}

async function snapshot() {
  await db.exec("reset role");
  return (await db.query("select * from shopthie_private.profiles order by user_id")).rows;
}

async function rejected(work: () => Promise<unknown>, code: string, message?: string) {
  await db.exec("savepoint rejection");
  try {
    await assert.rejects(work, (error: unknown) => {
      const failure = error as { code?: string; message?: string };
      assert.equal(failure.code, code);
      if (message) assert.equal(failure.message, message);
      return true;
    });
  } finally {
    await db.exec("rollback to savepoint rejection; release savepoint rejection");
  }
}

test("read returns JSON null before setup and only the caller's minimal profile DTO", async () =>
  isolated(async () => {
    await actor();
    assert.equal(await read(), null);
    assert.deepEqual(
      (await db.query("select jsonb_typeof(public.shopthie_profile_read()) as kind")).rows,
      [{ kind: "null" }],
    );
    await db.exec("reset role");
    await db.query(
      "insert into shopthie_private.profiles (user_id, username, phone) values ($1, 'CustomerA', '+12025550101'), ($2, 'CustomerB', null)",
      [customerId, otherId],
    );
    await actor();
    assert.deepEqual(await read(), { username: "CustomerA", phone: "+12025550101", revision: 1 });
    await actor(otherId);
    assert.deepEqual(await read(), { username: "CustomerB", phone: null, revision: 1 });
  }));

test("profile account FK owns lifecycle and successful edits preserve created_at while advancing updated_at", async () =>
  isolated(async () => {
    await actor();
    await save("LifecycleA", null, 0);
    await actor(otherId);
    await save("LifecycleB", "+442079460001", 0);
    const before = await snapshot();
    await actor();
    await save("LifecycleA", "+12025550101", 1);
    const updated = await db.query<{ valid: boolean }>(
      "select public.shopthie_profile_read()->>'username' = 'LifecycleA' as valid",
    );
    assert.equal(updated.rows[0].valid, true);
    const afterEdit = await snapshot();
    assert.deepEqual(afterEdit[1], before[1]);
    assert.deepEqual(
      (
        await db.query(
          "select created_at <= updated_at as valid, revision from shopthie_private.profiles where user_id = $1",
          [customerId],
        )
      ).rows,
      [{ valid: true, revision: 2 }],
    );
    assert.deepEqual(
      (afterEdit[0] as { created_at: unknown }).created_at,
      (before[0] as { created_at: unknown }).created_at,
    );
    assert.notDeepEqual(
      (afterEdit[0] as { updated_at: unknown }).updated_at,
      (before[0] as { updated_at: unknown }).updated_at,
    );
    await rejected(
      () =>
        db.query(
          "insert into shopthie_private.profiles (user_id, username) values ($1, 'MissingAccount')",
          ["00000000-0000-4000-8000-000000000099"],
        ),
      "23503",
    );
    await db.query("delete from shopthie_private.app_accounts where user_id = $1", [customerId]);
    assert.deepEqual(await snapshot(), [before[1]]);
  }));

test("installed schema exposes only the reviewed DTO/storage and fixed-search-path invoker/definer RPC pair", async () => {
  assert.deepEqual(
    (
      await db.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema = 'shopthie_private' and table_name = 'profiles' order by ordinal_position",
      )
    ).rows.map((row) => row.column_name),
    ["user_id", "username", "phone", "revision", "created_at", "updated_at"],
  );
  assert.deepEqual(
    (await db.query("select id, enabled from shopthie_private.app_modules order by id")).rows,
    [
      { id: "access", enabled: true },
      { id: "addresses", enabled: false },
      { id: "audit", enabled: true },
      { id: "geography", enabled: false },
      { id: "identity", enabled: true },
      { id: "profiles", enabled: true },
      { id: "staff", enabled: false },
      { id: "support", enabled: false },
    ],
  );
  assert.deepEqual(
    (
      await db.query(
        "select relrowsecurity from pg_class where oid = 'shopthie_private.profiles'::regclass",
      )
    ).rows,
    [{ relrowsecurity: true }],
  );
  assert.deepEqual(
    (
      await db.query(
        "select policyname from pg_policies where schemaname = 'shopthie_private' and tablename = 'profiles'",
      )
    ).rows,
    [],
  );
  const functions = await db.query(`
    select n.nspname || '.' || p.proname as name, p.prosecdef as definer, p.proconfig as settings,
      pg_get_function_identity_arguments(p.oid) as arguments, pg_get_function_result(p.oid) as result,
      has_function_privilege('anon', p.oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
      exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in ('shopthie_profile_read', 'shopthie_profile_save'))
       or (n.nspname = 'shopthie_private' and p.proname in ('profile_read', 'profile_save'))
    order by name
  `);
  assert.deepEqual(
    functions.rows,
    [
      ["public.shopthie_profile_read", false, ""],
      ["public.shopthie_profile_save", false, "p_username text, p_phone text, p_revision integer"],
      ["shopthie_private.profile_read", true, ""],
      ["shopthie_private.profile_save", true, "p_username text, p_phone text, p_revision integer"],
    ].map(([name, definer, arguments_]) => ({
      name,
      definer,
      settings: ['search_path=""'],
      arguments: arguments_,
      result: "jsonb",
      anon_execute: false,
      authenticated_execute: true,
      public_execute: false,
    })),
  );
});

test("save locks the existing own account before the second live guard, validation and profile lookup", async () => {
  // Structural supplement: embedded PGlite is single-connection, not a multi-session lock-wait proof.
  const result = await db.query<{ definition: string }>(
    "select pg_get_functiondef('shopthie_private.profile_save(text,text,integer)'::regprocedure) as definition",
  );
  const body = result.rows[0].definition.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
  assert.match(body, /actor_id uuid := auth\.uid\(\)/);
  assert.match(
    body,
    /has_permission\('profile\.update_own'\)[\s\S]*perform 1 from shopthie_private\.app_accounts where user_id = actor_id for update; if not found or not shopthie_private\.has_permission\('profile\.update_own'\)[\s\S]*if p_revision[\s\S]*select \* into saved from shopthie_private\.profiles where user_id = actor_id/,
  );
});

test("raw profile ACLs deny every client role and extra target-ID RPC parameters do not exist", async () =>
  isolated(async () => {
    await actor();
    await save("RawProtected", "+12025550101", 0);
    const before = await snapshot();
    for (const appRole of ["customer", "admin", "owner"]) {
      await db.exec("reset role");
      await db.query("update shopthie_private.app_user_roles set role_id = $1 where user_id = $2", [
        appRole,
        customerId,
      ]);
      for (const databaseRole of ["anon", "authenticated"] as const) {
        await asActor(db, databaseRole, {
          sub: customerId,
          aal: "aal2",
          user_metadata: { role: "owner" },
        });
        for (const sql of [
          "select * from shopthie_private.profiles",
          `insert into shopthie_private.profiles (user_id, username) values ('${otherId}', 'Intruder')`,
          "update shopthie_private.profiles set username = 'Intruder'",
          "delete from shopthie_private.profiles",
          "truncate shopthie_private.profiles",
        ])
          await rejected(() => db.exec(sql), "42501");
      }
    }
    await actor();
    for (const schema of ["public.shopthie_profile", "shopthie_private.profile"]) {
      await rejected(() => db.query(`select ${schema}_read($1::uuid)`, [otherId]), "42883");
      await rejected(
        () => db.query(`select ${schema}_save('Intruder', null, 1, $1::uuid)`, [otherId]),
        "42883",
      );
      await rejected(
        () =>
          db.query(
            `select ${schema}_save(p_username => 'Intruder', p_phone => null, p_revision => 1, p_user_id => $1::uuid)`,
            [otherId],
          ),
        "42883",
      );
    }
    assert.deepEqual(await snapshot(), before);
    const privileges = await db.query<{ role: string; privilege: string; allowed: boolean }>(`
    select role, privilege, has_table_privilege(role, 'shopthie_private.profiles', privilege) as allowed
    from (values ('anon'), ('authenticated')) roles(role)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privileges(privilege)
  `);
    for (const row of privileges.rows)
      assert.equal(row.allowed, false, `${row.role}/${row.privilege}`);
  }));

test("default-deny profile RLS survives accidental client SELECT/DML grants", async () =>
  isolated(async () => {
    await actor();
    await save("RlsProtected", "+12025550101", 0);
    const before = await snapshot();
    await db.exec(
      "grant usage on schema shopthie_private to anon; grant select, insert, update, delete on shopthie_private.profiles to anon, authenticated",
    );
    for (const role of ["anon", "authenticated"] as const) {
      await asActor(db, role, { sub: customerId, aal: "aal2", user_metadata: { role: "owner" } });
      assert.deepEqual((await db.query("select * from shopthie_private.profiles")).rows, []);
      assert.equal(
        (await db.query("update shopthie_private.profiles set username = 'Intruder'")).affectedRows,
        0,
      );
      assert.equal((await db.query("delete from shopthie_private.profiles")).affectedRows, 0);
      await rejected(
        () =>
          db.query(
            "insert into shopthie_private.profiles (user_id, username) values ($1, 'Intruder')",
            [otherId],
          ),
        "42501",
      );
    }
    assert.deepEqual(await snapshot(), before);
  }));

test("anonymous, missing identities and invalid assurance cannot call public or private profile RPCs", async () =>
  isolated(async () => {
    await actor();
    await save("Protected", "+12025550101", 0);
    const before = await snapshot();
    const calls = [
      "select public.shopthie_profile_read()",
      "select public.shopthie_profile_save('Intruder', null, 1)",
      "select shopthie_private.profile_read()",
      "select shopthie_private.profile_save('Intruder', null, 1)",
    ];
    for (const role of ["anon", "authenticated"] as const) {
      const identities =
        role === "anon"
          ? [{ sub: customerId, aal: "aal2" }, {}]
          : [
              {},
              { aal: "aal2" },
              { sub: "00000000-0000-4000-8000-000000000099", aal: "aal2" },
              { sub: customerId },
              { sub: customerId, aal: "invented" },
            ];
      for (const claims of identities) {
        await asActor(db, role, {
          ...claims,
          user_metadata: { role: "owner", status: "active", mfa_required: false },
        });
        for (const sql of calls) await rejected(() => db.exec(sql), "42501");
      }
    }
    assert.deepEqual(await snapshot(), before);
  }));

test("live status, membership, role grants, module and dependency changes deny both RPCs despite forged metadata", async () =>
  isolated(async () => {
    await actor();
    await save("Protected", "+12025550101", 0);
    const before = await snapshot();
    const changes = [
      "update shopthie_private.app_accounts set status = 'suspended'",
      "delete from shopthie_private.app_user_roles",
      "delete from shopthie_private.app_role_permissions where role_id = 'customer'",
      "update shopthie_private.app_modules set enabled = false where id = 'profiles'",
      "insert into shopthie_private.app_module_dependencies values ('profiles', 'geography')",
      "update shopthie_private.app_modules set enabled = true where id = 'geography'; insert into shopthie_private.app_module_dependencies values ('profiles', 'geography'), ('geography', 'addresses')",
      "update shopthie_private.app_user_roles set role_id = 'admin'",
      "update shopthie_private.app_user_roles set role_id = 'owner'",
      `insert into auth.mfa_factors (user_id, status) values ('${customerId}', 'verified')`,
    ];
    for (const change of changes) {
      await db.exec("reset role; savepoint guard_case");
      try {
        await db.exec(change);
        await actor(customerId, {
          user_metadata: { role: "owner", status: "active", mfa_required: false },
          app_metadata: { role: "owner", permissions: ["profile.read_own", "profile.update_own"] },
        });
        await rejected(read, "42501");
        await rejected(() => save("Intruder", null, 1), "42501");
        await rejected(() => db.exec("select shopthie_private.profile_read()"), "42501");
        await rejected(
          () => db.exec("select shopthie_private.profile_save('Intruder', null, 1)"),
          "42501",
        );
      } finally {
        await db.exec("rollback to savepoint guard_case; release savepoint guard_case");
      }
      assert.deepEqual(await snapshot(), before, change);
    }
  }));

test("current per-operation grants are authoritative and verified MFA permits only aal2", async () =>
  isolated(async () => {
    await actor();
    await save("Assurance", null, 0);
    await db.exec(
      "reset role; delete from shopthie_private.app_role_permissions where role_id = 'customer' and permission_id = 'profile.update_own'",
    );
    await actor();
    assert.deepEqual(await read(), { username: "Assurance", phone: null, revision: 1 });
    await rejected(() => save("Changed", null, 1), "42501");
    await db.exec(
      "reset role; insert into shopthie_private.app_role_permissions values ('customer', 'profile.update_own'); delete from shopthie_private.app_role_permissions where role_id = 'customer' and permission_id = 'profile.read_own'",
    );
    await actor();
    await rejected(read, "42501");
    assert.deepEqual(await save("Changed", null, 1), {
      username: "Changed",
      phone: null,
      revision: 2,
    });
    await db.exec(
      "reset role; insert into shopthie_private.app_role_permissions values ('customer', 'profile.read_own')",
    );
    await db.query(
      "insert into auth.mfa_factors (user_id, status) values ($1, 'unverified'), ($2, 'verified')",
      [customerId, otherId],
    );
    await actor();
    assert.deepEqual(await read(), { username: "Changed", phone: null, revision: 2 });
    await db.exec("reset role");
    await db.query("update auth.mfa_factors set status = 'verified' where user_id = $1", [
      customerId,
    ]);
    await actor();
    await rejected(read, "42501");
    await rejected(() => save("Changed", null, 2), "42501");
    for (const role of ["customer", "admin", "owner"]) {
      await db.exec("reset role");
      await db.query("update shopthie_private.app_user_roles set role_id = $1 where user_id = $2", [
        role,
        customerId,
      ]);
      await actor(customerId, { aal: "aal2", user_metadata: { role: "customer" } });
      assert.deepEqual(await read(), { username: "Changed", phone: null, revision: 2 });
      // Each current role remains self-bound, even a privileged membership.
      await rejected(
        () => db.query("select public.shopthie_profile_read($1::uuid)", [otherId]),
        "42883",
      );
    }
    assert.deepEqual(await save("Changed", null, 2), {
      username: "Changed",
      phone: null,
      revision: 3,
    });
  }));

test("null/negative revisions are invalid and stale saves leave the entire row unchanged", async () =>
  isolated(async () => {
    await actor();
    for (const revision of [null, -1, -2147483648]) {
      await rejected(() => save("RevisionTest", null, revision), "22023");
      assert.equal(await read(), null);
    }
    await save("RevisionTest", "+12025550101", 0);
    const before = await snapshot();
    await actor();
    for (const revision of [null, -1])
      await rejected(() => save("Changed", null, revision), "22023");
    for (const revision of [0, 2, 2147483647])
      await rejected(() => save("Changed", null, revision), "P0001", "profile_conflict");
    assert.deepEqual(await snapshot(), before);
    await rejected(() => db.exec("update shopthie_private.profiles set revision = 0"), "23514");
  }));

test("phone stores only nullable international format, not verification, and rejects malformed values atomically", async () =>
  isolated(async () => {
    await actor();
    await save("PhoneTest", "+12025550101", 0);
    const before = await snapshot();
    await actor();
    for (const phone of [
      "",
      "+1",
      "+012",
      "12025550101",
      "++123",
      "+12 34",
      "+12-34",
      "+123x4",
      "+１２",
      "+" + "1".repeat(16),
      "+123\n",
    ]) {
      await rejected(() => save("PhoneTest", phone, 1), "22023");
    }
    assert.deepEqual(await snapshot(), before);
    await actor();
    assert.deepEqual(await save("PhoneTest", "+11", 1), {
      username: "PhoneTest",
      phone: "+11",
      revision: 2,
    });
    assert.deepEqual(await save("PhoneTest", "+" + "9".repeat(15), 2), {
      username: "PhoneTest",
      phone: "+" + "9".repeat(15),
      revision: 3,
    });
    assert.deepEqual(await save("PhoneTest", null, 3), {
      username: "PhoneTest",
      phone: null,
      revision: 4,
    });
    await db.exec("reset role");
    await rejected(
      () => db.exec("update shopthie_private.profiles set phone = 'not international'"),
      "23514",
    );
  }));

test("username syntax is exact ASCII, required, 3–32 characters with no silent repair", async () =>
  isolated(async () => {
    await actor();
    await save("Original", null, 0);
    const before = await snapshot();
    await actor();
    for (const username of [
      null,
      "",
      "ab",
      "a".repeat(33),
      " name",
      "name ",
      "na me",
      "_name",
      "-name",
      "na.me",
      "café",
      "Ｎame",
      "name\n",
    ]) {
      await rejected(() => save(username, null, 1), "22023");
      assert.deepEqual(await read(), { username: "Original", phone: null, revision: 1 });
    }
    assert.deepEqual(await snapshot(), before);
    await actor();
    assert.deepEqual(await save("A_9", null, 1), { username: "A_9", phone: null, revision: 2 });
    assert.deepEqual(await save("Z".repeat(32), null, 2), {
      username: "Z".repeat(32),
      phone: null,
      revision: 3,
    });
    await db.exec("reset role");
    await rejected(
      () => db.query("update shopthie_private.profiles set username = 'bad space'"),
      "23514",
    );
  }));

test("case-insensitive username collisions never overwrite either customer, including timestamps/revision", async () =>
  isolated(async () => {
    await actor();
    await save("Mixed_Case", "+12025550101", 0);
    const beforeCreate = await snapshot();
    await actor(otherId);
    await rejected(() => save("mIXED_cASE", "+442079460001", 0), "23505");
    assert.equal(await read(), null);
    assert.deepEqual(await snapshot(), beforeCreate);
    await actor(otherId);
    await save("CustomerB", "+442079460001", 0);
    const beforeEdit = await snapshot();
    await actor(otherId);
    await rejected(() => save("MIXED_CASE", null, 1), "23505");
    assert.deepEqual(await snapshot(), beforeEdit);
    await actor();
    assert.deepEqual(await save("mixed_case", "+12025550101", 1), {
      username: "mixed_case",
      phone: "+12025550101",
      revision: 2,
    });
  }));

test("self save creates, edits and clears phone with atomic revision conflicts and CustomerA/B isolation", async () =>
  isolated(async () => {
    await actor(otherId);
    await rejected(() => save("CustomerB", "+442079460001", 1), "P0001", "profile_conflict");
    assert.equal(await read(), null);
    const other = { username: "CustomerB", phone: "+442079460001", revision: 1 };
    assert.deepEqual(await save(other.username, other.phone, 0), other);
    await actor(customerId, {
      user_metadata: { user_id: otherId, role: "owner", username: "Forged" },
      app_metadata: { role: "owner" },
    });
    assert.equal(await read(), null);
    assert.deepEqual(await save("CustomerA", "+12025550101", 0), {
      username: "CustomerA",
      phone: "+12025550101",
      revision: 1,
    });
    assert.deepEqual(await save("CustomerA_Edit", null, 1), {
      username: "CustomerA_Edit",
      phone: null,
      revision: 2,
    });
    for (const stale of [0, 1, 3]) {
      await rejected(() => save("Overwritten", "+12025550999", stale), "P0001", "profile_conflict");
      assert.deepEqual(await read(), { username: "CustomerA_Edit", phone: null, revision: 2 });
    }
    await actor(otherId);
    assert.deepEqual(await read(), other);
    await db.exec("reset role");
    assert.deepEqual(
      (await db.query("select user_id, status from shopthie_private.app_accounts order by user_id"))
        .rows,
      [customerId, otherId].map((user_id) => ({ user_id, status: "active" })),
    );
    assert.deepEqual(
      (
        await db.query(
          "select user_id, role_id from shopthie_private.app_user_roles order by user_id",
        )
      ).rows,
      [customerId, otherId].map((user_id) => ({ user_id, role_id: "customer" })),
    );
  }));
