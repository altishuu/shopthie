import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, createAuthFixture, customerId, otherId, provision } from "./auth-fixture.ts";

// Real embedded PostgreSQL roles with trusted TEST claims, not JWT verification.
let db: PGlite;
let migration = "";
const reference = JSON.parse(
  await readFile(
    new URL("../../src/modules/geography/data/database-reference.json", import.meta.url),
    "utf8",
  ),
) as [string, number, number, number, string[]][];
before(async () => {
  db = await createAuthFixture();
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory)).sort()) {
    if (/^\d+_(authority_foundation|profiles|addresses|staff_entry)\.sql$/.test(name)) {
      const sql = await readFile(new URL(name, directory), "utf8");
      if (name.endsWith("_addresses.sql")) migration = sql;
      await db.exec(sql);
    }
  }
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
type Address = {
  id: string;
  label: string | null;
  recipient: string;
  line1: string;
  line2: string | null;
  country_code: string;
  subdivision_code: string | null;
  subdivision_text: string | null;
  locality: string | null;
  postal_code: string | null;
  is_default: boolean;
};
type Book = { revision: number; addresses: Address[] };
const valid = {
  label: null,
  recipient: "Synthetic Recipient",
  line1: "123 Synthetic Lane",
  line2: null,
  country_code: "US",
  subdivision_code: reference.find(([code]) => code === "US")![4][0],
  subdivision_text: null,
  locality: "Synthetic City",
  postal_code: "00000",
  is_default: false,
};
async function read(): Promise<Book> {
  return (await db.query<{ book: Book }>("select public.shopthie_addresses_read() as book")).rows[0]
    .book;
}
async function save(
  address: unknown = valid,
  revision: number | null = 0,
  id: string | null = null,
): Promise<Book> {
  return (
    await db.query<{ book: Book }>(
      "select public.shopthie_address_save($1::uuid, $2::jsonb, $3::integer) as book",
      [id, JSON.stringify(address), revision],
    )
  ).rows[0].book;
}
async function remove(id: string | null, revision: number | null): Promise<Book> {
  return (
    await db.query<{ book: Book }>(
      "select public.shopthie_address_delete($1::uuid, $2::integer) as book",
      [id, revision],
    )
  ).rows[0].book;
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

async function snapshot() {
  await db.exec("reset role");
  return (
    await db.query<{ state: unknown }>(`
    select jsonb_build_object(
      'books', coalesce((select jsonb_agg(to_jsonb(b) order by user_id) from shopthie_private.address_books b), '[]'),
      'addresses', coalesce((select jsonb_agg(to_jsonb(a) order by id) from shopthie_private.addresses a), '[]')
    ) as state
  `)
  ).rows[0].state;
}

async function deniedCalls(id: string) {
  for (const schema of ["public.shopthie_", "shopthie_private."]) {
    for (const [sql, parameters] of [
      [`select ${schema}addresses_read()`, []],
      [`select ${schema}address_save($1::uuid, $2::jsonb, 1)`, [id, JSON.stringify(valid)]],
      [`select ${schema}address_delete($1::uuid, 1)`, [id]],
    ] as [string, unknown[]][])
      await rejected(() => db.query(sql, parameters), "42501", "address_denied");
  }
}

test("installed RPCs use fixed paths, minimal signatures and authenticated-only execution; storage is private and default-deny", async () => {
  const functions = await db.query(`
    select n.nspname || '.' || p.proname as name, p.prosecdef as definer, p.proconfig as settings,
      pg_get_function_identity_arguments(p.oid) as arguments, pg_get_function_result(p.oid) as result,
      has_function_privilege('anon', p.oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
      exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in ('shopthie_addresses_read', 'shopthie_address_save', 'shopthie_address_delete'))
      or (n.nspname = 'shopthie_private' and p.proname in ('addresses_read', 'address_save', 'address_delete', 'address_text_valid'))
    order by name
  `);
  assert.deepEqual(
    functions.rows,
    [
      ["public.shopthie_address_delete", false, "p_id uuid, p_revision integer", "jsonb", true],
      [
        "public.shopthie_address_save",
        false,
        "p_id uuid, p_address jsonb, p_revision integer",
        "jsonb",
        true,
      ],
      ["public.shopthie_addresses_read", false, "", "jsonb", true],
      ["shopthie_private.address_delete", true, "p_id uuid, p_revision integer", "jsonb", true],
      [
        "shopthie_private.address_save",
        true,
        "p_id uuid, p_address jsonb, p_revision integer",
        "jsonb",
        true,
      ],
      [
        "shopthie_private.address_text_valid",
        false,
        "p_value text, p_limit integer",
        "boolean",
        false,
      ],
      ["shopthie_private.addresses_read", true, "", "jsonb", true],
    ].map(([name, definer, arguments_, result, authenticated_execute]) => ({
      name,
      definer,
      settings: ['search_path=""'],
      arguments: arguments_,
      result,
      anon_execute: false,
      authenticated_execute,
      public_execute: false,
    })),
  );
  for (const name of ["address_countries", "address_subdivisions", "address_books", "addresses"]) {
    assert.deepEqual(
      (
        await db.query("select relrowsecurity from pg_class where oid = $1::regclass", [
          `shopthie_private.${name}`,
        ])
      ).rows,
      [{ relrowsecurity: true }],
    );
    assert.deepEqual(
      (
        await db.query(
          "select policyname from pg_policies where schemaname = 'shopthie_private' and tablename = $1",
          [name],
        )
      ).rows,
      [],
    );
  }
  assert.deepEqual(
    (
      await db.query<{ column_name: string }>(`
    select column_name from information_schema.columns where table_schema = 'shopthie_private' and table_name = 'addresses' order by ordinal_position
  `)
    ).rows.map(({ column_name }) => column_name),
    ["id", "user_id", ...Object.keys(valid)],
  );
  assert.deepEqual(
    (await db.query("select id, enabled from shopthie_private.app_modules order by id")).rows,
    ["access", "addresses", "audit", "geography", "identity", "profiles", "staff", "support"].map(
      (id) => ({ id, enabled: !["staff", "support"].includes(id) }),
    ),
  );
});

test("both mutations lock the existing actor account before rechecking live authority and inspecting book revision", async () => {
  // Structural supplement only: PGlite is single-connection, not a concurrent lock-wait proof.
  for (const signature of ["address_save(uuid,jsonb,integer)", "address_delete(uuid,integer)"]) {
    const definition = (
      await db.query<{ definition: string }>(
        "select pg_get_functiondef($1::regprocedure) as definition",
        [`shopthie_private.${signature}`],
      )
    ).rows[0].definition;
    const body = definition.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
    assert.match(body, /actor_id uuid := auth\.uid\(\)/);
    assert.match(
      body,
      /has_permission\('address\.manage_own'\)[\s\S]*perform 1 from shopthie_private\.app_accounts where user_id = actor_id for update; if not found or not shopthie_private\.has_permission\('address\.manage_own'\)[\s\S]*if p_(?:id|revision)[\s\S]*select revision into current_revision from shopthie_private\.address_books where user_id = actor_id/,
    );
    assert.match(body, /where id = p_id and user_id = actor_id/);
  }
});

test("account deletion cascades private book and rows, never the shared geography reference", async () =>
  isolated(async () => {
    await actor();
    await save();
    await actor(otherId);
    const other = await save();
    await db.exec("reset role");
    await db.query("delete from shopthie_private.app_accounts where user_id = $1", [customerId]);
    assert.deepEqual((await db.query("select user_id from shopthie_private.address_books")).rows, [
      { user_id: otherId },
    ]);
    assert.deepEqual((await db.query("select user_id from shopthie_private.addresses")).rows, [
      { user_id: otherId },
    ]);
    assert.deepEqual(
      (await db.query("select count(*)::integer as count from shopthie_private.address_countries"))
        .rows,
      [{ count: 250 }],
    );
    await actor(otherId);
    assert.deepEqual(await read(), other);
  }));

test("unknown and foreign address IDs share one conflict response without touching either book", async () =>
  isolated(async () => {
    await actor(otherId);
    const other = await save({ ...valid, is_default: true });
    const foreignId = other.addresses[0].id;
    await actor();
    const own = await save({ ...valid, is_default: true });
    const before = await snapshot();
    for (const id of [foreignId, "00000000-0000-4000-8000-000000000099"]) {
      await actor();
      await rejected(
        () => save({ ...valid, is_default: true }, 1, id),
        "P0001",
        "address_conflict",
      );
      await rejected(() => remove(id, 1), "P0001", "address_conflict");
      assert.deepEqual(await read(), own);
      assert.deepEqual(await snapshot(), before);
    }
    await db.exec("reset role");
    await db.query(
      "insert into auth.mfa_factors(user_id,status,factor_type) values ($1,'verified','totp')",
      [customerId],
    );
    for (const role of ["customer", "admin", "owner"]) {
      await db.exec("reset role");
      await db.query("update shopthie_private.app_user_roles set role_id = $1 where user_id = $2", [
        role,
        customerId,
      ]);
      await actor(customerId, { aal: "aal2", user_metadata: { user_id: otherId, role: "owner" } });
      await rejected(() => save(valid, 1, foreignId), "P0001", "address_conflict");
      await rejected(() => remove(foreignId, 1), "P0001", "address_conflict");
      assert.deepEqual(await read(), own);
    }
    await actor(otherId);
    assert.deepEqual(await read(), other);
  }));

test("revision validation rejects stale edits and deletes globally and handles the integer ceiling without overflow", async () =>
  isolated(async () => {
    await actor();
    const original = await save();
    const id = original.addresses[0].id;
    for (const revision of [null, -1, -2147483648]) {
      await rejected(() => save(valid, revision, id), "22023", "address_invalid");
      await rejected(() => remove(id, revision), "22023", "address_invalid");
    }
    await rejected(() => remove(null, 1), "22023", "address_invalid");
    await rejected(
      () => db.query("select public.shopthie_address_save(null, null, 1)"),
      "22023",
      "address_invalid",
    );
    for (const revision of [0, 2, 2147483647]) {
      await rejected(
        () => save({ ...valid, is_default: true }, revision, id),
        "P0001",
        "address_conflict",
      );
      await rejected(() => remove(id, revision), "P0001", "address_conflict");
    }
    assert.deepEqual(await read(), original);
    await db.exec("reset role; update shopthie_private.address_books set revision = 2147483646");
    await actor();
    const ceiling = await save(valid, 2147483646, id);
    assert.equal(ceiling.revision, 2147483647);
    await rejected(() => save(valid, 2147483647, id), "P0001", "address_conflict");
    await rejected(() => remove(id, 2147483647), "P0001", "address_conflict");
    assert.deepEqual(await read(), ceiling);
  }));

test("anonymous, missing actors and invalid assurance cannot invoke address RPCs", async () =>
  isolated(async () => {
    await actor();
    const original = await save();
    const id = original.addresses[0].id;
    const before = await snapshot();
    for (const claims of [
      {},
      { aal: "aal2" },
      { sub: "00000000-0000-4000-8000-000000000099", aal: "aal2" },
      { sub: customerId },
      { sub: customerId, aal: "invented" },
    ]) {
      await asActor(db, "authenticated", {
        ...claims,
        user_metadata: { role: "owner", status: "active", mfa_required: false },
      });
      await deniedCalls(id);
    }
    for (const claims of [{}, { sub: customerId, aal: "aal2" }]) {
      await asActor(db, "anon", claims);
      for (const schema of ["public.shopthie_", "shopthie_private."]) {
        for (const sql of [
          `select ${schema}addresses_read()`,
          `select ${schema}address_save(null, '{}'::jsonb, 1)`,
          `select ${schema}address_delete('${id}', 1)`,
        ])
          await rejected(() => db.exec(sql), "42501");
      }
    }
    assert.deepEqual(await snapshot(), before);
  }));

test("live status, role grants, dependencies and MFA deny every operation despite forged metadata", async () =>
  isolated(async () => {
    await actor();
    const original = await save();
    const id = original.addresses[0].id;
    const before = await snapshot();
    const changes = [
      "update shopthie_private.app_accounts set status = 'suspended'",
      "delete from shopthie_private.app_user_roles",
      "delete from shopthie_private.app_role_permissions where permission_id = 'address.manage_own'",
      ...["addresses", "geography", "profiles"].map(
        (id) => `update shopthie_private.app_modules set enabled = false where id = '${id}'`,
      ),
      "insert into shopthie_private.app_module_dependencies values ('geography', 'staff')",
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
          app_metadata: { role: "owner", permissions: ["address.manage_own"] },
        });
        await deniedCalls(id);
      } finally {
        await db.exec("rollback to savepoint guard_case; release savepoint guard_case");
      }
      assert.deepEqual(await snapshot(), before, change);
    }
    await db.query(
      "insert into auth.mfa_factors (user_id, status) values ($1, 'unverified'), ($2, 'verified')",
      [customerId, otherId],
    );
    await actor();
    assert.deepEqual(await read(), original);
    await db.exec("reset role");
    await db.query("update auth.mfa_factors set status = 'verified' where user_id = $1", [
      customerId,
    ]);
    await actor();
    await deniedCalls(id);
    await actor(customerId, { aal: "aal2" });
    assert.equal((await save(valid, 1, id)).revision, 2);
    assert.deepEqual(await remove(id, 2), { revision: 3, addresses: [] });
  }));

test("raw ACLs deny every client role and no RPC accepts an owner or target selector", async () =>
  isolated(async () => {
    await actor();
    await save();
    const before = await snapshot();
    const tables = ["address_countries", "address_subdivisions", "address_books", "addresses"];
    for (const appRole of ["customer", "admin", "owner"]) {
      await db.exec("reset role");
      await db.query("update shopthie_private.app_user_roles set role_id = $1 where user_id = $2", [
        appRole,
        customerId,
      ]);
      for (const role of ["anon", "authenticated"] as const) {
        await asActor(db, role, { sub: customerId, aal: "aal2", user_metadata: { role: "owner" } });
        for (const table of tables) {
          for (const sql of [
            `select * from shopthie_private.${table}`,
            `insert into shopthie_private.${table} default values`,
            `delete from shopthie_private.${table}`,
            `truncate shopthie_private.${table}`,
          ])
            await rejected(() => db.exec(sql), "42501");
        }
        await rejected(
          () => db.exec("update shopthie_private.addresses set recipient = 'Intruder'"),
          "42501",
        );
      }
    }
    await actor(customerId, { aal: "aal2" });
    for (const schema of ["public.shopthie_", "shopthie_private."]) {
      for (const sql of [
        `select ${schema}addresses_read('${otherId}'::uuid)`,
        `select ${schema}address_save(null, '{}'::jsonb, 1, '${otherId}'::uuid)`,
        `select ${schema}address_delete(null, 1, '${otherId}'::uuid)`,
        `select ${schema}address_save(p_id => null, p_address => '{}'::jsonb, p_revision => 1, p_user_id => '${otherId}'::uuid)`,
      ])
        await rejected(() => db.exec(sql), "42883");
    }
    assert.deepEqual(await snapshot(), before);
    for (const table of tables) {
      const privileges = await db.query<{ allowed: boolean }>(`
        select has_table_privilege(role, 'shopthie_private.${table}', privilege) as allowed
        from (values ('anon'), ('authenticated')) roles(role)
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privileges(privilege)
      `);
      assert.ok(
        privileges.rows.every(({ allowed }) => !allowed),
        table,
      );
    }
  }));

test("default-deny RLS still blocks data after accidental client grants", async () =>
  isolated(async () => {
    await actor();
    await save();
    const before = await snapshot();
    const tables = ["address_countries", "address_subdivisions", "address_books", "addresses"];
    await db.exec(`grant usage on schema shopthie_private to anon;
      grant select, insert, update, delete on ${tables.map((name) => `shopthie_private.${name}`).join(", ")} to anon, authenticated`);
    for (const role of ["anon", "authenticated"] as const) {
      await asActor(db, role, { sub: customerId, aal: "aal2" });
      for (const table of tables) {
        assert.deepEqual((await db.query(`select * from shopthie_private.${table}`)).rows, []);
        assert.equal((await db.query(`delete from shopthie_private.${table}`)).affectedRows, 0);
      }
      assert.equal(
        (await db.query("update shopthie_private.addresses set recipient = 'Intruder'"))
          .affectedRows,
        0,
      );
      await rejected(
        () =>
          db.query("insert into shopthie_private.address_books (user_id) values ($1)", [otherId]),
        "42501",
      );
    }
    assert.deepEqual(await snapshot(), before);
  }));

test("delete returns the committed book without replacement defaults and preserves revision after the last deletion", async () =>
  isolated(async () => {
    await actor();
    const first = await save({ ...valid, is_default: true });
    const firstId = first.addresses[0].id;
    const two = await save({ ...valid, label: "Second" }, 1);
    const second = two.addresses.find(({ id }) => id !== firstId)!;
    assert.deepEqual(await remove(firstId, 2), { revision: 3, addresses: [second] });
    assert.deepEqual(await remove(second.id, 3), { revision: 4, addresses: [] });
    assert.deepEqual(await read(), { revision: 4, addresses: [] });
    for (const revision of [0, 1, 2, 3, 5]) {
      await rejected(() => save(valid, revision), "P0001", "address_conflict");
      await rejected(() => remove(second.id, revision), "P0001", "address_conflict");
    }
    await rejected(() => remove(second.id, 4), "P0001", "address_conflict");
    const recreated = await save(valid, 4);
    assert.equal(recreated.revision, 5);
    assert.equal(recreated.addresses.length, 1);
  }));

test("ten-address cap is self-scoped, permits edits at capacity and leaves defaults and revision unchanged on failure", async () =>
  isolated(async () => {
    await actor();
    let book: Book = { revision: 0, addresses: [] };
    for (let index = 0; index < 10; index++)
      book = await save({ ...valid, label: `Synthetic ${index}`, is_default: index === 0 }, index);
    assert.equal(book.addresses.length, 10);
    assert.equal(book.revision, 10);
    await rejected(() => save({ ...valid, is_default: true }, 10), "P0001", "address_limit");
    assert.deepEqual(await read(), book);
    const edited = await save(
      { ...valid, label: "Edited at cap", is_default: true },
      10,
      book.addresses[0].id,
    );
    assert.equal(edited.addresses.length, 10);
    assert.equal(edited.revision, 11);
    await actor(otherId);
    assert.equal((await save()).addresses.length, 1);
  }));

test("default switching is atomic, nullable as a choice, and protected by a partial unique index", async () =>
  isolated(async () => {
    await actor();
    const one = await save({ ...valid, is_default: true });
    const firstId = one.addresses[0].id;
    const two = await save({ ...valid, label: "Second", is_default: true }, 1);
    const secondId = two.addresses.find(({ id }) => id !== firstId)!.id;
    assert.deepEqual(
      two.addresses.filter((row) => row.is_default).map(({ id }) => id),
      [secondId],
    );
    const switched = await save({ ...valid, is_default: true }, 2, firstId);
    assert.deepEqual(
      switched.addresses.filter((row) => row.is_default).map(({ id }) => id),
      [firstId],
    );
    await rejected(
      () => save({ ...valid, recipient: "", is_default: true }, 3, secondId),
      "22023",
      "address_invalid",
    );
    assert.deepEqual(await read(), switched);
    await db.exec("reset role");
    await rejected(
      () =>
        db.query("update shopthie_private.addresses set is_default = true where id = $1", [
          secondId,
        ]),
      "23505",
    );
    await actor();
    const none = await save(valid, 3, firstId);
    assert.equal(none.revision, 4);
    assert.equal(none.addresses.filter((row) => row.is_default).length, 0);
    await actor(otherId);
    assert.equal((await save({ ...valid, is_default: true })).addresses[0].is_default, true);
    await actor();
    assert.deepEqual(await read(), none);
  }));

test("text validation preserves Unicode code points without repair and rejects ECMAScript edge whitespace, controls and empty optionals", async () =>
  isolated(async () => {
    await actor();
    const original = await save();
    const id = original.addresses[0].id;
    const whitespace = [
      0x09,
      0x0a,
      0x0b,
      0x0c,
      0x0d,
      0x20,
      0xa0,
      0x1680,
      ...Array.from({ length: 11 }, (_, i) => 0x2000 + i),
      0x2028,
      0x2029,
      0x202f,
      0x205f,
      0x3000,
      0xfeff,
    ];
    for (const point of whitespace) {
      const char = String.fromCodePoint(point);
      for (const recipient of [char + "Synthetic", "Synthetic" + char])
        await rejected(() => save({ ...valid, recipient }, 1, id), "22023", "address_invalid");
    }
    // U+0000 cannot enter PostgreSQL jsonb/text at all; its type parser rejects before RPC dispatch.
    for (const point of [
      ...Array.from({ length: 31 }, (_, i) => i + 1),
      ...Array.from({ length: 33 }, (_, i) => 0x7f + i),
      0x2028,
      0x2029,
    ]) {
      await rejected(
        () => save({ ...valid, recipient: "A" + String.fromCodePoint(point) + "B" }, 1, id),
        "22023",
        "address_invalid",
      );
    }
    for (const field of [
      "label",
      "recipient",
      "line1",
      "line2",
      "subdivision_text",
      "locality",
      "postal_code",
    ]) {
      const base = field === "subdivision_text" ? { ...valid, subdivision_code: null } : valid;
      await rejected(() => save({ ...base, [field]: "" }, 1, id), "22023", "address_invalid");
    }
    assert.deepEqual(await read(), original);
    let revision = 1;
    for (const [field, limit] of Object.entries({
      label: 40,
      recipient: 100,
      line1: 180,
      line2: 180,
      subdivision_text: 100,
      locality: 100,
      postal_code: 32,
    })) {
      const base = field === "subdivision_text" ? { ...valid, subdivision_code: null } : valid;
      await rejected(
        () => save({ ...base, [field]: "😀".repeat(limit + 1) }, revision, id),
        "22023",
        "address_invalid",
      );
      const address = { ...base, [field]: "😀".repeat(limit) };
      assert.deepEqual(await save(address, revision++, id), {
        revision,
        addresses: [{ id, ...address }],
      });
    }
    const literal = { ...valid, recipient: "Cafe\u0301 東京 😀", line1: "A\u00a0B\u2000C\ufeffD" };
    assert.deepEqual(await save(literal, revision++, id), {
      revision,
      addresses: [{ id, ...literal }],
    });
  }));

test("geography enforces exact country-scoped membership and required presence with manual fallback everywhere", async () =>
  isolated(async () => {
    await actor();
    const original = await save();
    const id = original.addresses[0].id;
    const foreignSubdivision = reference.find(
      ([code, , , , subdivisions]) => code !== "US" && subdivisions.length,
    )![4][0];
    for (const changed of [
      { country_code: "us" },
      { country_code: " US" },
      { country_code: "ZZ" },
      { country_code: "USA" },
      { subdivision_code: foreignSubdivision },
      { subdivision_code: "999999999999999" },
      { subdivision_code: "US-CA" },
      { subdivision_code: "04829764" },
      { subdivision_text: "Manual area" },
      { subdivision_code: null },
      { locality: null },
      { postal_code: null },
      { country_code: "HK", subdivision_code: "1819730", subdivision_text: null },
    ]) {
      await rejected(() => save({ ...valid, ...changed }, 1, id), "22023", "address_invalid");
      assert.deepEqual(await read(), original);
    }
    let revision = 1;
    for (const [country_code, area, locality, postal, subdivisions] of reference) {
      // Manual fallback is valid even if the selected country has coded options, or none.
      const address = {
        ...valid,
        country_code,
        subdivision_code: null,
        subdivision_text: area ? "Synthetic manual area" : null,
        locality: locality ? "Synthetic locality" : null,
        postal_code: postal ? "X" : null,
      };
      const result = await save(address, revision++, id);
      assert.deepEqual(result, { revision, addresses: [{ id, ...address }] });
      for (const field of [
        area ? "subdivision_text" : null,
        locality ? "locality" : null,
        postal ? "postal_code" : null,
      ].filter(Boolean)) {
        await rejected(
          () => save({ ...address, [field!]: null }, revision, id),
          "22023",
          "address_invalid",
        );
      }
      if (!area) {
        const manual = { ...address, subdivision_text: "Synthetic manual area" };
        assert.deepEqual(await save(manual, revision++, id), {
          revision,
          addresses: [{ id, ...manual }],
        });
      }
      if (subdivisions.length) {
        const coded = { ...address, subdivision_code: subdivisions[0], subdivision_text: null };
        assert.deepEqual(await save(coded, revision++, id), {
          revision,
          addresses: [{ id, ...coded }],
        });
      }
    }
    assert.deepEqual(reference.find(([code]) => code === "HK")![4], []);
    assert.ok(reference.some(([, area, locality, postal]) => !area && !locality && !postal));
  }));

test("save accepts exactly ten directly typed editable JSON fields, never authority fields or coercions", async () =>
  isolated(async () => {
    await actor();
    const original = await save();
    const missing = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "label"));
    for (const invalid of [
      null,
      [],
      "address",
      1,
      true,
      {},
      missing,
      { ...valid, user_id: otherId },
      { ...valid, id: otherId },
      { ...valid, revision: 1 },
      { ...valid, role: "owner" },
      { ...valid, is_default: "true" },
      { ...valid, is_default: 1 },
      { ...valid, is_default: null },
      ...Object.keys(valid)
        .filter((key) => key !== "is_default")
        .flatMap((key) => [
          { ...valid, [key]: 123 },
          { ...valid, [key]: false },
          { ...valid, [key]: {} },
          { ...valid, [key]: [] },
        ]),
      { ...valid, recipient: null },
      { ...valid, line1: null },
      { ...valid, country_code: null },
    ]) {
      await rejected(() => save(invalid, 1, original.addresses[0].id), "22023", "address_invalid");
      assert.deepEqual(await read(), original);
    }
  }));

test("save creates and edits only the verified actor's address and returns the whole minimal ordered book", async () =>
  isolated(async () => {
    await actor(otherId);
    const other = await save({ ...valid, recipient: "Synthetic B" });
    await actor(customerId, {
      user_metadata: { user_id: otherId, role: "owner" },
      app_metadata: { role: "owner" },
    });
    assert.deepEqual(await read(), { revision: 0, addresses: [] });
    const created = await save();
    assert.equal(created.revision, 1);
    assert.equal(created.addresses.length, 1);
    const id = created.addresses[0].id;
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(created.addresses, [{ id, ...valid }]);
    const edited = await save({ ...valid, label: "Synthetic home", line2: "Unit 2" }, 1, id);
    assert.deepEqual(edited, {
      revision: 2,
      addresses: [{ id, ...valid, label: "Synthetic home", line2: "Unit 2" }],
    });
    const two = await save({ ...valid, label: "Synthetic second" }, 2);
    assert.equal(two.revision, 3);
    assert.equal(two.addresses.length, 2);
    assert.deepEqual(
      two.addresses.map(({ id }) => id),
      two.addresses.map(({ id }) => id).sort(),
    );
    assert.deepEqual(await read(), two);
    await actor(otherId);
    assert.deepEqual(await read(), other);
  }));

test("self-contained migration embeds the exact pinned reference and returns the initial minimal book", async () => {
  const embedded = migration.match(/\$geography_reference\$([\s\S]*?)\$geography_reference\$/);
  assert.ok(embedded, "one addresses migration must embed the local real reference seed");
  assert.deepEqual(JSON.parse(embedded[1]), reference);
  const installed = await db.query<{
    code: string;
    area: boolean;
    locality: boolean;
    postal: boolean;
    subdivisions: string[];
  }>(`
    select c.code, c.require_subdivision as area, c.require_locality as locality, c.require_postal as postal,
      coalesce((select jsonb_agg(s.code order by s.code) from shopthie_private.address_subdivisions s where s.country_code = c.code), '[]') as subdivisions
    from shopthie_private.address_countries c order by c.code
  `);
  assert.deepEqual(
    installed.rows,
    reference
      .map(([code, area, locality, postal, subdivisions]) => ({
        code,
        area: !!area,
        locality: !!locality,
        postal: !!postal,
        subdivisions: [...subdivisions].sort(),
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  );
  await isolated(async () => {
    await actor();
    assert.deepEqual(await read(), { revision: 0, addresses: [] });
  });
});
