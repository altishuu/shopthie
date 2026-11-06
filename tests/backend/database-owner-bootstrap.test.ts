import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createAuthFixture, customerId, otherId } from "./auth-fixture.ts";

const directory = new URL("../../supabase/migrations/", import.meta.url);
const migration = "20261106020000_owner_bootstrap.sql";
const session = "00000000-0000-4000-8000-000000000010";
const factor = "00000000-0000-4000-8000-000000000011";
const approval = "00000000-0000-4000-8000-000000000012";
// Enum-shaped provider fixtures + synthetic claims, never native JWT/MFA proof.
async function fixture(install = true) {
  const db = await createAuthFixture();
  await db.exec(`create role service_role nologin;
    alter table auth.users add column email_confirmed_at timestamptz,
      add column banned_until timestamptz, add column deleted_at timestamptz;
    create type auth.aal_level as enum ('aal1','aal2','aal3');
    create type auth.factor_type as enum ('totp','webauthn','phone');
    create type auth.factor_status as enum ('unverified','verified');
    alter table auth.mfa_factors alter column factor_type drop default;
    alter table auth.mfa_factors alter column factor_type type auth.factor_type using factor_type::auth.factor_type;
    alter table auth.mfa_factors alter column factor_type set default 'totp';
    alter table auth.mfa_factors drop constraint mfa_factors_status_check;
    alter table auth.mfa_factors alter column status type auth.factor_status using status::auth.factor_status;
    create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
      factor_id uuid,aal auth.aal_level,not_after timestamptz,created_at timestamptz,refreshed_at timestamptz);`);
  for (const name of (await readdir(directory))
    .filter((n) => /^\d+_.+\.sql$/.test(n) && n < migration)
    .sort())
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  await db.exec(`insert into auth.users(id,email_confirmed_at) values ('${customerId}',clock_timestamp()),('${otherId}',clock_timestamp());
    insert into auth.mfa_factors(id,user_id,status) values ('${factor}','${customerId}','verified');
    insert into auth.sessions values ('${session}','${customerId}','${factor}','aal2',clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 hour',clock_timestamp());`);
  if (install) await db.exec(await readFile(new URL(migration, directory), "utf8"));
  return db;
}
async function claims(
  db: Awaited<ReturnType<typeof fixture>>,
  patch: Record<string, unknown> = {},
) {
  const now = (
    await db.query<{ now: number }>(
      "select floor(extract(epoch from clock_timestamp()))::float8 now",
    )
  ).rows[0].now;
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: customerId,
      session_id: session,
      aal: "aal2",
      exp: now + 3600,
      amr: [{ method: "totp", timestamp: now }],
      ...patch,
    }),
  ]);
}
async function state(db: Awaited<ReturnType<typeof fixture>>) {
  return (
    await db.query<{ state: Record<string, unknown> }>(
      "select public.shopthie_owner_bootstrap_state() state",
    )
  ).rows[0].state;
}
async function designate(db: Awaited<ReturnType<typeof fixture>>) {
  return (
    await db.query<{ id: string }>("select shopthie_private.designate_first_owner($1,$2) id", [
      customerId,
      approval,
    ])
  ).rows[0].id;
}
async function consent(db: Awaited<ReturnType<typeof fixture>>, id: string) {
  return (
    await db.query<{
      state: {
        subject: string;
        status: string;
        designation: string;
        intent: { id: string; expiresAt: string };
      };
    }>("select public.shopthie_owner_bootstrap_consent($1) state", [id])
  ).rows[0].state;
}

test("closed by default; exact self-only state, explicit designation, consent never promotes", async () => {
  const db = await fixture();
  try {
    await claims(db);
    assert.deepEqual(await state(db), {
      subject: customerId,
      status: "unavailable",
      designation: null,
    });
    const id = await designate(db);
    await claims(db, { aal: "aal1" });
    assert.deepEqual(await state(db), {
      subject: customerId,
      status: "mfa_required",
      designation: id,
    });
    await claims(db);
    assert.deepEqual(await state(db), { subject: customerId, status: "ready", designation: id });
    const result = await consent(db, id);
    assert.deepEqual(Object.keys(result).sort(), ["designation", "intent", "status", "subject"]);
    assert.equal(result.status, "consented");
    assert.match(result.intent.expiresAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
    assert.deepEqual(await consent(db, id), result);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from shopthie_private.audit_events where event_type='owner.bootstrap.consent'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<{ role_id: string }>(
          "select role_id from shopthie_private.app_user_roles where user_id=$1",
          [customerId],
        )
      ).rows[0].role_id,
      "customer",
    );
    await claims(db, { sub: otherId });
    assert.deepEqual(await state(db), {
      subject: otherId,
      status: "unavailable",
      designation: null,
    });
    await assert.rejects(consent(db, id));
  } finally {
    await db.close();
  }
});

test("trusted exact-bound activation promotes once; consumed tombstone outlives Owner removal", async () => {
  const db = await fixture();
  try {
    await claims(db);
    const id = await designate(db);
    const result = await consent(db, id);
    const activate = (a = approval, i = result.intent.id, d = id) =>
      db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [d, i, a]);
    await assert.rejects(activate(otherId));
    await assert.rejects(activate(approval, otherId));
    await assert.rejects(activate(approval, result.intent.id, otherId));
    await activate();
    assert.deepEqual(await state(db), {
      subject: customerId,
      status: "completed",
      designation: id,
    });
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from shopthie_private.app_user_roles where role_id='owner'",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(activate());
    await assert.rejects(
      db.query("update shopthie_private.app_accounts set status='suspended' where user_id=$1", [
        customerId,
      ]),
      /owner_frozen/,
    );
    assert.deepEqual(
      (
        await db.query(
          "select tgenabled from pg_trigger where tgname like 'owner_freeze%' order by tgrelid,tgname",
        )
      ).rows,
      Array(4).fill({ tgenabled: "A" }),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from shopthie_private.audit_events where event_type='owner.bootstrap.activate' and actor_id is null",
        )
      ).rows[0].n,
      1,
    );
    // Trusted fixture-only future maintenance cannot reopen the global tombstone.
    await db.exec(`alter table shopthie_private.app_user_roles disable trigger owner_freeze_guard;
      update shopthie_private.app_user_roles set role_id='customer' where user_id='${customerId}';
      alter table shopthie_private.app_user_roles enable always trigger owner_freeze_guard;`);
    await assert.rejects(
      db.query("select shopthie_private.designate_first_owner($1,$2)", [otherId, otherId]),
    );
  } finally {
    await db.close();
  }
});

test("proof gates reject forged, stale, future, fractional and malformed synthetic claims", async () => {
  const db = await fixture();
  try {
    const id = await designate(db);
    const now = (
      await db.query<{ now: number }>(
        "select floor(extract(epoch from clock_timestamp()))::float8 now",
      )
    ).rows[0].now;
    for (const patch of [
      { aal: "aal1" },
      { exp: now - 1 },
      { exp: String(now + 3600) },
      { exp: now + 0.5 },
      { session_id: null },
      { session_id: otherId },
      { amr: [] },
      { amr: null },
      { amr: [{ method: "password", timestamp: now }] },
      { amr: [{ method: "totp", timestamp: now - 301 }] },
      { amr: [{ method: "totp", timestamp: now + 60 }] },
      { amr: [{ method: "totp", timestamp: now - 0.5 }] },
      { amr: [{ method: "totp", timestamp: String(now) }] },
      {
        amr: [
          { method: "totp", timestamp: now },
          { method: "", timestamp: now },
        ],
      },
    ]) {
      await claims(db, patch);
      await assert.rejects(consent(db, id), /owner_bootstrap_denied/, JSON.stringify(patch));
    }
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from shopthie_private.owner_bootstrap_intents",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("live session, factor and user gates are revalidated for consent and activation", async () => {
  const db = await fixture();
  try {
    await claims(db);
    const id = await designate(db);
    const patches = [
      "update auth.users set email_confirmed_at=null",
      "update auth.users set deleted_at=clock_timestamp()",
      "update auth.users set banned_until=clock_timestamp()+interval '1 hour'",
      "update shopthie_private.app_accounts set status='suspended'",
      "update auth.sessions set user_id='" + otherId + "'",
      "update auth.sessions set aal='aal1'",
      "update auth.sessions set factor_id='" + otherId + "'",
      "update auth.sessions set not_after=clock_timestamp()-interval '1 second'",
      "update auth.sessions set created_at=clock_timestamp()+interval '1 hour'",
      "update auth.mfa_factors set status='unverified'",
      "update auth.mfa_factors set factor_type='phone'",
      "delete from auth.sessions",
      "delete from auth.mfa_factors",
    ];
    for (const patch of patches) {
      await db.exec("begin");
      try {
        await db.exec(patch);
        await assert.rejects(consent(db, id), /owner_bootstrap_denied/, patch);
      } finally {
        await db.exec("rollback");
      }
    }
    const result = await consent(db, id);
    for (const patch of patches) {
      await db.exec("begin");
      try {
        await db.exec(patch);
        await assert.rejects(
          db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
            id,
            result.intent.id,
            approval,
          ]),
          /owner_bootstrap_denied/,
          patch,
        );
      } finally {
        await db.exec("rollback");
      }
    }
  } finally {
    await db.close();
  }
});

test("designation rotates target binding; stale intent, stale proof and approval replay do not renew", async () => {
  const db = await fixture();
  try {
    await claims(db);
    const id = await designate(db);
    const old = await consent(db, id);
    const next = (
      await db.query<{ id: string }>("select shopthie_private.designate_first_owner($1,$2) id", [
        customerId,
        otherId,
      ])
    ).rows[0].id;
    await assert.rejects(consent(db, id));
    await assert.rejects(
      db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
        next,
        old.intent.id,
        otherId,
      ]),
    );
    await assert.rejects(designate(db), /owner_bootstrap_denied/);
    const current = await consent(db, next);
    await db.exec(
      "update shopthie_private.owner_bootstrap_intents set expires_at=clock_timestamp()-interval '1 second'",
    );
    await claims(db);
    await assert.rejects(consent(db, next));
    await assert.rejects(
      db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
        next,
        current.intent.id,
        otherId,
      ]),
    );
  } finally {
    await db.close();
  }
});

async function snapshot(db: Awaited<ReturnType<typeof fixture>>) {
  return (
    await db.query<{ state: unknown }>(`select jsonb_build_array(
    (select jsonb_agg(c) from shopthie_private.owner_bootstrap_control c),
    (select jsonb_agg(i order by i.id) from shopthie_private.owner_bootstrap_intents i),
    (select jsonb_agg(r order by r.user_id) from shopthie_private.app_user_roles r),
    (select jsonb_agg(e order by e.id) from shopthie_private.audit_events e),
    (select relfilenode from pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass),
    (select count(*) from shopthie_private.owner_freeze_cutover),
    (select jsonb_agg(jsonb_build_array(tgrelid,tgname,tgenabled) order by tgrelid,tgname) from pg_trigger where tgname like 'owner_freeze%')) state`)
  ).rows[0].state;
}
// RESET removes the sole proconfig entry on guards/wrappers/helpers, yielding
// SQL NULL (not an empty array). Operator entry points retain their timeouts.
for (const signature of [
  "shopthie_private.owner_freeze_guard()",
  "shopthie_private.owner_freeze_truncate_guard()",
  "public.shopthie_owner_bootstrap_state()",
  "public.shopthie_owner_bootstrap_consent(uuid)",
  "shopthie_private.owner_bootstrap_modules()",
  "shopthie_private.owner_bootstrap_eligible(uuid,text)",
  "shopthie_private.owner_bootstrap_lock_native(uuid,uuid,uuid)",
  "shopthie_private.owner_bootstrap_live(uuid,uuid,uuid,timestamptz,timestamptz,text)",
  "shopthie_private.owner_bootstrap_proof(uuid)",
  "shopthie_private.owner_bootstrap_audit(uuid,uuid,text)",
  "shopthie_private.owner_bootstrap_assert_environment()",
  "shopthie_private.owner_bootstrap_state()",
  "shopthie_private.owner_bootstrap_consent(uuid)",
  "shopthie_private.designate_first_owner(uuid,uuid)",
  "shopthie_private.activate_first_owner(uuid,uuid,uuid)",
]) {
  test(`runtime RESET search_path rejects without promotion/consumption: ${signature}`, async () => {
    const db = await fixture();
    try {
      await claims(db);
      const id = await designate(db);
      const result = await consent(db, id);
      await db.exec(`alter function ${signature} reset search_path`);
      const config = (
        await db.query<{ proconfig: string[] | null }>(
          "select proconfig from pg_proc where oid=$1::regprocedure",
          [signature],
        )
      ).rows[0].proconfig;
      assert.equal(config?.some((entry) => entry.startsWith("search_path=")) ?? false, false);
      if (
        signature.startsWith("public.") ||
        !/designate_first_owner|activate_first_owner|owner_bootstrap_(state|consent)\(/.test(
          signature,
        )
      ) {
        assert.equal(config, null);
      }
      const before = await snapshot(db);
      for (const reject of [
        () => db.query("select shopthie_private.owner_bootstrap_assert_environment()"),
        () =>
          db.query("select shopthie_private.designate_first_owner($1,$2)", [customerId, otherId]),
        () =>
          db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
            id,
            result.intent.id,
            approval,
          ]),
      ]) {
        await assert.rejects(reject(), /owner_bootstrap_unsafe/);
        // Includes exact roles, unconsumed intent/control, audit, marker and modes.
        assert.deepEqual(await snapshot(db), before);
      }
    } finally {
      await db.close();
    }
  });
}

// Guard and public-wrapper configuration remains exact, not merely a required
// empty search_path among arbitrary additional settings.
for (const signature of [
  "shopthie_private.owner_freeze_guard()",
  "shopthie_private.owner_freeze_truncate_guard()",
  "public.shopthie_owner_bootstrap_state()",
  "public.shopthie_owner_bootstrap_consent(uuid)",
]) {
  test(`runtime rejects additional exact-config setting without consumption: ${signature}`, async () => {
    const db = await fixture();
    try {
      await claims(db);
      const id = await designate(db);
      const result = await consent(db, id);
      await db.exec(`alter function ${signature} set lock_timeout='2s'`);
      const before = await snapshot(db);
      await assert.rejects(
        db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
          id,
          result.intent.id,
          approval,
        ]),
        /owner_bootstrap_unsafe/,
      );
      assert.deepEqual(await snapshot(db), before);
    } finally {
      await db.close();
    }
  });
}

for (const fault of [
  "return null;",
  "raise exception 'fixture_audit_failure';",
  "delete from auth.mfa_factors; return new;",
  "delete from shopthie_private.audit_events where id=new.id; return new;",
]) {
  test(`mandatory audit and post-audit checks fail closed: ${fault}`, async () => {
    const db = await fixture();
    try {
      await claims(db);
      const id = await designate(db);
      const trigger = fault.startsWith("delete from shopthie_private.audit") ? "after" : "before";
      await db.exec(`create function public.fixture_audit_fault() returns trigger language plpgsql as $$begin ${fault} end$$;
        create trigger fixture_audit_fault ${trigger} insert on shopthie_private.audit_events for each row execute function public.fixture_audit_fault();`);
      const before = await snapshot(db);
      await assert.rejects(consent(db, id));
      assert.deepEqual(await snapshot(db), before);
      await db.exec("drop trigger fixture_audit_fault on shopthie_private.audit_events");
      const result = await consent(db, id);
      await db.exec(
        `create trigger fixture_audit_fault ${trigger} insert on shopthie_private.audit_events for each row execute function public.fixture_audit_fault();`,
      );
      const beforeActivation = await snapshot(db);
      await assert.rejects(
        db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
          id,
          result.intent.id,
          approval,
        ]),
      );
      assert.deepEqual(await snapshot(db), beforeActivation);
    } finally {
      await db.close();
    }
  });
}

test("application roles cannot designate, activate or read private evidence; self RPC works under authenticated", async () => {
  const db = await fixture();
  try {
    await claims(db);
    const id = await designate(db);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select shopthie_private.designate_first_owner($1,$2)", [customerId, approval]),
      );
      await assert.rejects(
        db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
          id,
          approval,
          approval,
        ]),
      );
      await assert.rejects(db.query("select * from shopthie_private.owner_bootstrap_control"));
      await assert.rejects(db.query("select * from shopthie_private.owner_bootstrap_intents"));
      if (role === "authenticated") {
        assert.equal((await state(db)).status, "ready");
        assert.equal((await consent(db, id)).status, "consented");
      } else {
        await assert.rejects(state(db));
      }
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

for (const ddl of [
  "create role extra_executor nologin; alter default privileges in schema shopthie_private grant execute on functions to extra_executor;",
  "create role extra_executor nologin; alter default privileges in schema public grant execute on functions to extra_executor;",
  "create role private_reader nologin; create role inherited_reader nologin; grant private_reader to inherited_reader; alter default privileges in schema shopthie_private grant select on tables to private_reader;",
  "create role all_reader nologin noinherit; grant pg_read_all_data to all_reader;",
])
  test(`installation rejects unsafe effective/default privilege: ${ddl}`, async () => {
    const db = await fixture(false);
    try {
      await db.exec(ddl);
      await assert.rejects(
        db.exec(await readFile(new URL(migration, directory), "utf8")),
        /owner_bootstrap_unsafe/,
      );
    } finally {
      await db.close();
    }
  });

for (const ddl of [
  "alter table shopthie_private.app_accounts enable trigger owner_freeze_guard",
  "alter function shopthie_private.owner_freeze_guard() set search_path='public'",
  "create or replace function shopthie_private.owner_freeze_truncate_guard() returns trigger language plpgsql security definer set search_path='' as $$begin return null; end$$",
  "grant execute on function shopthie_private.activate_first_owner(uuid,uuid,uuid) to authenticated",
  "grant select on shopthie_private.owner_bootstrap_intents to service_role",
  "alter table shopthie_private.owner_bootstrap_intents disable row level security",
  "create role dangerous_reader nologin noinherit; grant pg_read_all_data to dangerous_reader",
])
  test(`activation revalidates installed safeguards: ${ddl}`, async () => {
    const db = await fixture();
    try {
      await claims(db);
      const id = await designate(db);
      const result = await consent(db, id);
      await db.exec(ddl);
      await assert.rejects(
        db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
          id,
          result.intent.id,
          approval,
        ]),
        /owner_bootstrap_unsafe/,
      );
      assert.equal(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from shopthie_private.app_user_roles where role_id='owner'",
          )
        ).rows[0].n,
        0,
      );
    } finally {
      await db.close();
    }
  });

test("mutations reject RR/SERIALIZABLE and disabled owner_setup without changing prior staff modules", async () => {
  const db = await fixture();
  try {
    await claims(db);
    const id = await designate(db);
    for (const isolation of ["repeatable read", "serializable"]) {
      await db.exec("begin isolation level " + isolation);
      await assert.rejects(consent(db, id));
      await db.exec("rollback");
    }
    await db.exec("update shopthie_private.app_modules set enabled=false where id='owner_setup'");
    assert.deepEqual(await state(db), {
      subject: customerId,
      status: "unavailable",
      designation: null,
    });
    await assert.rejects(consent(db, id));
  } finally {
    await db.close();
  }
});

test("installation requires zero Owners and the exact native session enum/column contract", async () => {
  for (const ddl of [
    `alter table shopthie_private.app_user_roles disable trigger owner_freeze_guard;
     update shopthie_private.app_user_roles set role_id='owner' where user_id='${customerId}';
     alter table shopthie_private.app_user_roles enable always trigger owner_freeze_guard;`,
    "alter table auth.sessions alter column aal type text using aal::text",
  ]) {
    const db = await fixture(false);
    try {
      await db.exec(ddl);
      await assert.rejects(
        db.exec(await readFile(new URL(migration, directory), "utf8")),
        /owner_bootstrap_/,
      );
    } finally {
      await db.close();
    }
  }
});

test("null subject is denied; unavailable self carries no designation or intent", async () => {
  const db = await fixture();
  try {
    await claims(db, { sub: null });
    await assert.rejects(state(db), /owner_bootstrap_denied/);
    await claims(db);
    await designate(db);
    await claims(db, { aal: null });
    assert.deepEqual(await state(db), {
      subject: customerId,
      status: "unavailable",
      designation: null,
    });
  } finally {
    await db.close();
  }
});

test("designation audit cannot erase approval replay history", async () => {
  const db = await fixture();
  try {
    await db.exec(`create function public.fixture_rewrite_designation() returns trigger language plpgsql as $$
      begin update shopthie_private.owner_bootstrap_control set used_approval_refs=array[]::uuid[];
      return new; end$$;
      create trigger fixture_rewrite_designation after insert on shopthie_private.audit_events
      for each row execute function public.fixture_rewrite_designation();`);
    await assert.rejects(designate(db), /owner_bootstrap_denied/);
  } finally {
    await db.close();
  }
});

test("activation cannot rewrite immutable intent binding while consuming", async () => {
  const db = await fixture();
  try {
    await claims(db);
    const id = await designate(db);
    const result = await consent(db, id);
    await db.exec(`create function public.fixture_rewrite_intent() returns trigger language plpgsql as $$
      begin new.designation='${otherId}'; return new; end$$;
      create trigger fixture_rewrite_intent before update on shopthie_private.owner_bootstrap_intents
      for each row execute function public.fixture_rewrite_intent();`);
    const before = await snapshot(db);
    await assert.rejects(
      db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
        id,
        result.intent.id,
        approval,
      ]),
      /owner_bootstrap_denied/,
    );
    assert.deepEqual(await snapshot(db), before);
  } finally {
    await db.close();
  }
});

// A harmless pre-fix probe demonstrated that an anon-owned (text,text,text)
// overload was selected for untyped literals and returned the trusted invoker's
// current_user before the genuine UUID operator could validate its environment.
// Prevent the unsafe namespace baseline, rather than trying to repair resolution.
for (const [label, ddl] of [
  ["anon", "grant usage,create on schema shopthie_private to anon"],
  [
    "inherited NOLOGIN",
    `create role schema_writer nologin; create role schema_client nologin;
    grant schema_writer to schema_client;
    grant usage,create on schema shopthie_private to schema_writer`,
  ],
  [
    "NOINHERIT member path",
    `create role schema_writer nologin; create role schema_client nologin noinherit;
    grant schema_writer to schema_client;
    grant usage,create on schema shopthie_private to schema_writer`,
  ],
  ["PUBLIC", "grant usage,create on schema shopthie_private to public"],
]) {
  test(`installation rejects effective private-schema CREATE: ${label}`, async () => {
    const db = await fixture(false);
    try {
      await db.exec(ddl);
      const baseline = async () =>
        (
          await db.query(`select jsonb_build_array(
        (select jsonb_agg(r order by user_id) from shopthie_private.app_user_roles r),
        (select jsonb_agg(e order by id) from shopthie_private.audit_events e),
        (select relfilenode from pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass),
        (select jsonb_agg(c) from shopthie_private.owner_freeze_cutover c),
        (select jsonb_agg(m order by id) from shopthie_private.app_modules m),
        (select jsonb_agg(jsonb_build_array(tgrelid,tgname,tgenabled) order by tgrelid,tgname)
          from pg_trigger where tgname like 'owner_freeze%')) state`)
        ).rows;
      const before = await baseline();
      await assert.rejects(
        db.exec(await readFile(new URL(migration, directory), "utf8")),
        /owner_bootstrap_unsafe_schema_acl/,
      );
      await db.exec("rollback");
      assert.deepEqual(await baseline(), before);
      // Failed installation cannot leave any consumable evidence or promotion.
      assert.deepEqual(
        (
          await db.query(`select
        to_regclass('shopthie_private.owner_bootstrap_control') control,
        to_regclass('shopthie_private.owner_bootstrap_intents') intents,
        to_regprocedure('shopthie_private.activate_first_owner(uuid,uuid,uuid)') operator`)
        ).rows,
        [{ control: null, intents: null, operator: null }],
      );
    } finally {
      await db.close();
    }
  });

  test(`runtime rejects effective private-schema CREATE without consumption: ${label}`, async () => {
    const db = await fixture();
    try {
      await claims(db);
      const id = await designate(db);
      const result = await consent(db, id);
      await db.exec(ddl);
      if (label === "inherited NOLOGIN") {
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select has_schema_privilege('schema_client','shopthie_private','CREATE') allowed",
            )
          ).rows[0].allowed,
          true,
        );
      }
      const before = await snapshot(db);
      for (const reject of [
        () => db.query("select shopthie_private.owner_bootstrap_assert_environment()"),
        () =>
          db.query("select shopthie_private.designate_first_owner($1,$2)", [customerId, otherId]),
        () =>
          db.query("select shopthie_private.activate_first_owner($1,$2,$3)", [
            id,
            result.intent.id,
            approval,
          ]),
      ]) {
        await assert.rejects(reject(), /owner_bootstrap_unsafe_schema_acl/);
        assert.deepEqual(await snapshot(db), before);
      }
    } finally {
      await db.close();
    }
  });
}

test("private-schema USAGE alone is supported but cannot install an operator overload", async () => {
  const db = await fixture(false);
  try {
    await db.exec(
      "create role schema_client nologin; grant usage on schema shopthie_private to schema_client",
    );
    await db.exec(await readFile(new URL(migration, directory), "utf8"));
    const before = await snapshot(db);
    for (const role of ["anon", "schema_client"]) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(
          db.exec(`create function shopthie_private.activate_first_owner(text,text,text)
          returns text language sql security invoker set search_path='' as $$ select current_user::text $$`),
          /permission denied for schema shopthie_private/,
        );
      } finally {
        await db.exec("reset role");
      }
      assert.deepEqual(await snapshot(db), before);
    }
    assert.equal(
      (
        await db.query<{ overload: string | null }>(
          "select to_regprocedure('shopthie_private.activate_first_owner(text,text,text)') overload",
        )
      ).rows[0].overload,
      null,
    );
  } finally {
    await db.close();
  }
});

test("full-chain module dependency permission and per-role grant parity", async () => {
  const db = await fixture();
  try {
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
      "owner_setup",
    ]);
    assert.deepEqual(
      (await db.query("select id,enabled from shopthie_private.app_modules order by id")).rows,
      Object.keys(backendModuleDependencies)
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
        .flatMap(([module_id, deps]) => deps.map((depends_on) => ({ module_id, depends_on })))
        .sort(
          (a, b) =>
            a.module_id.localeCompare(b.module_id) || a.depends_on.localeCompare(b.depends_on),
        ),
    );
    assert.deepEqual(
      (await db.query("select id,module_id from shopthie_private.app_permissions order by id"))
        .rows,
      Object.entries(permissionDefinitions)
        .map(([id, spec]) => ({ id, module_id: spec.module }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    const grants = (
      await db.query<{ role_id: string; permissions: string[] }>(
        "select role_id,array_agg(permission_id order by permission_id) permissions from shopthie_private.app_role_permissions group by role_id order by role_id",
      )
    ).rows;
    assert.deepEqual(
      Object.fromEntries(grants.map((r) => [r.role_id, r.permissions])),
      Object.fromEntries(
        Object.entries(rolePermissions).map(([role, permissions]) => [
          role,
          [...permissions].sort(),
        ]),
      ),
    );
  } finally {
    await db.close();
  }
});
