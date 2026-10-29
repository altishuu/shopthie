import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, createAuthFixture, customerId, otherId, provision } from "./auth-fixture.ts";
import { backendModuleDependencies, resolveBackendModules } from "../../src/modules/registry.ts";
import { permissionDefinitions, rolePermissions } from "../../src/modules/access/permissions.ts";

// TEST ONLY: single-connection PostgreSQL SQL/roles and deterministic audit-hook
// transitions. Synthetic trusted claims, not native JWT/OTP or multi-session proof.
let db: PGlite;

test("latest full schema module/dependency/permission/grant contracts match the current app", async () => {
  const enabled = resolveBackendModules([
    "profiles",
    "geography",
    "addresses",
    "customer_lookup",
    "customer_status",
  ]);
  assert.deepEqual(
    (await db.query("select id,enabled from shopthie_private.app_modules order by id")).rows,
    Object.keys(backendModuleDependencies)
      .sort()
      .map((id) => ({ id, enabled: enabled.includes(id as (typeof enabled)[number]) })),
  );
  const dependencies = Object.entries(backendModuleDependencies)
    .flatMap(([module_id, values]) => values.map((depends_on) => ({ module_id, depends_on })))
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

async function statusRead(target = otherId) {
  return db.query("select public.shopthie_customer_status_read($1,'account_review')", [target]);
}
async function statusChange(target = otherId) {
  return db.query(
    "select public.shopthie_customer_status_change($1,'suspended',0,'account_security')",
    [target],
  );
}
test("status RPCs deny Guests/Customers/forged metadata, incomplete MFA and live authority revocation", async () =>
  isolated(async () => {
    await asActor(db, "anon");
    await rejected(() => db.query("select public.shopthie_customer_status_ready()"));
    await rejected(() => statusRead());
    await rejected(() => statusChange());
    for (const id of [otherId, customerId]) {
      await actor(id, id === customerId ? "aal1" : "aal2");
      assert.equal(
        (
          await db.query<{ ready: boolean }>(
            "select public.shopthie_customer_status_ready() as ready",
          )
        ).rows[0].ready,
        false,
      );
      await rejected(() => statusRead());
      await rejected(() => statusChange());
    }
    for (const mutation of [
      "delete from auth.mfa_factors",
      `update shopthie_private.app_accounts set status='suspended' where user_id='${customerId}'`,
      `delete from shopthie_private.app_user_roles where user_id='${customerId}'`,
      "update shopthie_private.app_modules set enabled=false where id='customer_status'",
      "update shopthie_private.app_modules set enabled=false where id='customer_lookup'",
      "delete from shopthie_private.app_role_permissions where role_id='owner' and permission_id='customer.status.manage'",
    ]) {
      await db.exec("reset role;savepoint authority");
      await db.exec(mutation);
      await actor();
      assert.equal(
        (
          await db.query<{ ready: boolean }>(
            "select public.shopthie_customer_status_ready() as ready",
          )
        ).rows[0].ready,
        false,
      );
      await rejected(() => statusRead());
      await rejected(() => statusChange());
      await db.exec("reset role;rollback to savepoint authority;release savepoint authority");
    }
    assert.equal((await db.query("select * from shopthie_private.audit_events")).rows.length, 0);
  }));
test("status RPCs exclude self/staff/missing targets and reject malformed change inputs", async () =>
  isolated(async () => {
    await actor();
    for (const target of [customerId, adminId, "00000000-0000-4000-8000-000000000099"]) {
      await rejected(() => statusRead(target));
      await rejected(() => statusChange(target));
    }
    for (const [status, revision, reason] of [
      ["banned", 0, "account_security"],
      ["suspended", -1, "account_security"],
      ["suspended", 2147483647, "account_security"],
      ["suspended", 0, "free text"],
      [null, 0, "account_security"],
      ["suspended", null, "account_security"],
    ])
      await rejected(
        () =>
          db.query("select public.shopthie_customer_status_change($1,$2,$3,$4)", [
            otherId,
            status,
            revision,
            reason,
          ]),
        "22023",
      );
    await rejected(
      () => db.query("select public.shopthie_customer_status_read($1,'free text')", [otherId]),
      "22023",
    );
    await db.exec("reset role");
    assert.equal((await db.query("select * from shopthie_private.audit_events")).rows.length, 0);
  }));
test("audit failure rolls back read side effects and status changes through public and private paths", async () =>
  isolated(async () => {
    await auditHook(
      `update shopthie_private.profiles set revision=revision+1 where user_id='${otherId}'; raise exception using errcode='23514',message='TEST_AUDIT_FAILURE'`,
    );
    for (const schema of ["public.shopthie_", "shopthie_private."]) {
      await actor();
      await rejected(
        () => db.query(`select ${schema}customer_status_read($1,'account_review')`, [otherId]),
        "23514",
      );
      await rejected(
        () =>
          db.query(`select ${schema}customer_status_change($1,'suspended',0,'account_security')`, [
            otherId,
          ]),
        "23514",
      );
    }
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select status,status_revision from shopthie_private.app_accounts where user_id=$1",
          [otherId],
        )
      ).rows,
      [{ status: "active", status_revision: 0 }],
    );
    assert.equal(
      (
        await db.query<{ revision: number }>(
          "select revision from shopthie_private.profiles where user_id=$1",
          [otherId],
        )
      ).rows[0].revision,
      1,
    );
    assert.equal((await db.query("select * from shopthie_private.audit_events")).rows.length, 0);
  }));
test("post-audit target promotion or actor revocation cannot return status data or commit a change", async () =>
  isolated(async () => {
    for (const statement of [
      `update shopthie_private.app_user_roles set role_id='admin' where user_id='${otherId}'`,
      `delete from shopthie_private.app_user_roles where user_id='${customerId}'`,
    ]) {
      await db.exec("reset role;savepoint transition");
      await auditHook(statement);
      await actor();
      await rejected(() => statusRead());
      await rejected(() => statusChange());
      await db.exec("reset role;rollback to savepoint transition;release savepoint transition");
    }
    assert.deepEqual(
      (
        await db.query(
          "select status,status_revision from shopthie_private.app_accounts where user_id=$1",
          [otherId],
        )
      ).rows,
      [{ status: "active", status_revision: 0 }],
    );
    assert.equal((await db.query("select * from shopthie_private.audit_events")).rows.length, 0);
  }));
test("suspension blocks protected own-data capabilities with unchanged TEST claims and reactivation restores them", async () =>
  isolated(async () => {
    await actor();
    await statusChange();
    await actor(otherId, "aal1");
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select shopthie_private.has_permission('profile.read_own') as allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await actor();
    await db.query(
      "select public.shopthie_customer_status_change($1,'active',1,'account_review')",
      [otherId],
    );
    await actor(otherId, "aal1");
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select shopthie_private.has_permission('profile.read_own') as allowed",
        )
      ).rows[0].allowed,
      true,
    );
  }));
test("status fixed-path RPC ACLs, writer-only triggers and UUID lock order preserve raw-table denial", async () => {
  const rows = (
    await db.query<{
      name: string;
      definer: boolean;
      settings: string[];
      auth: boolean;
      anon: boolean;
      pub: boolean;
      definition: string;
    }>(`select n.nspname||'.'||p.proname as name,p.prosecdef as definer,p.proconfig as settings,
 has_function_privilege('authenticated',p.oid,'execute') as auth,has_function_privilege('anon',p.oid,'execute') as anon,
 exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where grantee=0 and privilege_type='EXECUTE') as pub,
 pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname like 'shopthie_customer_status_%') or (n.nspname='shopthie_private' and p.proname in ('customer_status_ready','customer_status_read','customer_status_change','customer_subject_writer_guard','account_status_revision_guard'))`)
  ).rows;
  assert.equal(rows.length, 8);
  for (const row of rows) {
    assert.deepEqual(row.settings, ['search_path=""']);
    assert.equal(row.anon, false);
    assert.equal(row.pub, false);
    assert.equal(row.definer, row.name.startsWith("shopthie_private"));
    assert.equal(row.auth, !row.name.endsWith("_guard"));
    if (row.name.startsWith("shopthie_private") && /customer_status_(read|change)$/.test(row.name))
      assert.match(row.definition, /order by account.user_id for update/i);
  }
  const lookup = (
    await db.query<{ definition: string }>(
      "select pg_get_functiondef('shopthie_private.customer_lookup(text,text)'::regprocedure) as definition",
    )
  ).rows[0].definition;
  assert.match(lookup, /order by account.user_id for share/i);
  for (const table of ["app_accounts", "app_user_roles", "profiles", "audit_events"]) {
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') as allowed",
          ["shopthie_private." + table],
        )
      ).rows[0].allowed,
      false,
    );
  }
});

test("status changes use revision CAS, deny no-ops and audit both transitions", async () =>
  isolated(async () => {
    await actor();
    const change = async (status: string, revision: number) =>
      (
        await db.query<{ value: unknown }>(
          "select public.shopthie_customer_status_change($1,$2,$3,'account_security') as value",
          [otherId, status, revision],
        )
      ).rows[0].value;
    assert.deepEqual(await change("suspended", 0), {
      subject: otherId,
      status: "suspended",
      revision: 1,
    });
    await rejected(() => change("active", 0), "P0001", "customer_status_conflict");
    await rejected(() => change("suspended", 1), "22023");
    assert.deepEqual(await change("active", 1), {
      subject: otherId,
      status: "active",
      revision: 2,
    });
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query<{ event_type: string; outcome: string }>(
          "select event_type,outcome from shopthie_private.audit_events order by created_at,id",
        )
      ).rows.map((row) => row.event_type),
      ["customer.status.change", "customer.status.change"],
    );
    assert.equal((await db.query("select * from shopthie_private.audit_events")).rows.length, 2);
  }));

test("status revision bumps only on real transitions, rejects tampering, and installs only its dedicated capability", async () =>
  isolated(async () => {
    assert.deepEqual(
      (
        await db.query(
          "select status,status_revision from shopthie_private.app_accounts where user_id=$1",
          [otherId],
        )
      ).rows,
      [{ status: "active", status_revision: 0 }],
    );
    await db.query("update shopthie_private.app_accounts set status='suspended' where user_id=$1", [
      otherId,
    ]);
    assert.deepEqual(
      (
        await db.query(
          "select status,status_revision from shopthie_private.app_accounts where user_id=$1",
          [otherId],
        )
      ).rows,
      [{ status: "suspended", status_revision: 1 }],
    );
    await db.query("update shopthie_private.app_accounts set status=status where user_id=$1", [
      otherId,
    ]);
    assert.equal(
      (
        await db.query<{ status_revision: number }>(
          "select status_revision from shopthie_private.app_accounts where user_id=$1",
          [otherId],
        )
      ).rows[0].status_revision,
      1,
    );
    await rejected(
      () =>
        db.query("update shopthie_private.app_accounts set status_revision=99 where user_id=$1", [
          otherId,
        ]),
      "22023",
    );
    await rejected(
      () =>
        db.query("update shopthie_private.app_accounts set user_id=$1 where user_id=$2", [
          "00000000-0000-4000-8000-000000000098",
          otherId,
        ]),
      "22023",
    );
    assert.deepEqual(
      (
        await db.query(
          "select id,enabled from shopthie_private.app_modules where id in ('customer_status','staff','support') order by id",
        )
      ).rows,
      [
        { id: "customer_status", enabled: true },
        { id: "staff", enabled: false },
        { id: "support", enabled: false },
      ],
    );
    assert.deepEqual(
      (
        await db.query(
          "select module_id from shopthie_private.app_permissions where id='customer.status.manage'",
        )
      ).rows,
      [{ module_id: "customer_status" }],
    );
    await actor();
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select shopthie_private.has_permission('customer.status.manage') as allowed",
        )
      ).rows[0].allowed,
      true,
    );
  }));

test("verified staff status readiness and explicit read return only a Customer revision with mandatory audit", async () =>
  isolated(async () => {
    for (const id of [customerId, adminId]) {
      await actor(id);
      assert.equal(
        (
          await db.query<{ ready: boolean }>(
            "select public.shopthie_customer_status_ready() as ready",
          )
        ).rows[0].ready,
        true,
      );
      const row = (
        await db.query<{ value: unknown }>(
          "select public.shopthie_customer_status_read($1,'account_review') as value",
          [otherId],
        )
      ).rows[0].value;
      assert.deepEqual(row, { subject: otherId, status: "active", revision: 0 });
    }
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select event_type,reason_category,outcome,target_id from shopthie_private.audit_events order by created_at,id",
        )
      ).rows,
      [0, 1].map(() => ({
        event_type: "customer.status.read",
        reason_category: "account_review",
        outcome: "read",
        target_id: otherId,
      })),
    );
  }));

const adminId = "00000000-0000-4000-8000-000000000003";
before(async () => {
  db = await createAuthFixture();
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()) {
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  }
});
after(async () => {
  await db?.close();
});
async function isolated(work: () => Promise<void>) {
  await db.exec("begin");
  try {
    for (const id of [customerId, otherId, adminId]) await provision(db, id);
    await db.exec(`update shopthie_private.app_user_roles set role_id='owner' where user_id='${customerId}';
      update shopthie_private.app_user_roles set role_id='admin' where user_id='${adminId}';
      insert into auth.mfa_factors (user_id,status,factor_type) values
        ('${customerId}','verified','totp'),('${adminId}','verified','totp');
      insert into shopthie_private.profiles (user_id,username) values ('${otherId}','Target_Name');`);
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
    app_metadata: { role: "owner", permissions: ["customer.status.manage"] },
  });
}
async function rejected(work: () => Promise<unknown>, code = "42501", message?: string) {
  await db.exec("savepoint rejection");
  try {
    await assert.rejects(work, (error: unknown) => {
      const failure = error as { code?: string; message?: string };
      return failure.code === code && (message === undefined || failure.message === message);
    });
  } finally {
    await db.exec("rollback to savepoint rejection; release savepoint rejection");
  }
}
async function auditHook(statement: string) {
  await db.exec(`reset role;
    create function shopthie_private.test_audit_transition() returns trigger
    language plpgsql set search_path='' as $$ begin ${statement}; return new; end $$;
    create trigger test_audit_transition after insert on shopthie_private.audit_events
    for each row execute function shopthie_private.test_audit_transition();`);
}
async function lookup() {
  return (
    await db.query<{ value: unknown }>(
      "select public.shopthie_customer_lookup('target_name','account_access') as value",
    )
  ).rows[0].value;
}

test("membership/profile writers acquire parent UPDATE locks, reject owner reassignment, and permit account cascades", async () =>
  isolated(async () => {
    const guards = (
      await db.query<{
        relname: string;
        tgtype: number;
        definition: string;
        settings: string[];
        definer: boolean;
      }>(`
    select c.relname,t.tgtype,pg_get_functiondef(p.oid) as definition,p.proconfig as settings,p.prosecdef as definer
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal and c.oid in ('shopthie_private.app_user_roles'::regclass,'shopthie_private.profiles'::regclass)
    order by c.relname`)
    ).rows;
    assert.equal(guards.length, 2);
    for (const guard of guards) {
      assert.equal(guard.tgtype, 31); // BEFORE ROW INSERT/UPDATE/DELETE
      assert.equal(guard.definer, true);
      assert.deepEqual(guard.settings, ['search_path=""']);
      assert.match(guard.definition, /shopthie_private\.app_accounts[\s\S]*for update/i);
    }
    await rejected(
      () =>
        db.query("update shopthie_private.app_user_roles set user_id=$1 where user_id=$2", [
          "00000000-0000-4000-8000-000000000099",
          otherId,
        ]),
      "22023",
    );
    await rejected(
      () =>
        db.query("update shopthie_private.profiles set user_id=$1 where user_id=$2", [
          adminId,
          otherId,
        ]),
      "22023",
    );
    for (const table of ["app_user_roles", "profiles"]) {
      await db.exec(
        `update shopthie_private.${table} set user_id=user_id where user_id='${otherId}'`,
      );
      assert.equal(
        (
          await db.query<{ held: boolean }>(
            `select exists(select 1 from pg_locks where pid=pg_backend_pid() and relation='shopthie_private.app_accounts'::regclass and mode='RowShareLock' and granted) as held`,
          )
        ).rows[0].held,
        true,
      );
    }
    await db.query("delete from shopthie_private.app_accounts where user_id=$1", [otherId]);
    for (const table of ["app_user_roles", "profiles"])
      assert.equal(
        (await db.query(`select * from shopthie_private.${table} where user_id=$1`, [otherId])).rows
          .length,
        0,
      );
    await db.query("delete from auth.users where id=$1", [customerId]);
    assert.equal(
      (await db.query("select * from shopthie_private.app_accounts where user_id=$1", [customerId]))
        .rows.length,
      0,
    );
  }));

test("lookup rejects target becoming staff during audit instead of returning a stale Customer DTO", async () =>
  isolated(async () => {
    await auditHook(
      `update shopthie_private.app_user_roles set role_id='admin' where user_id='${otherId}'`,
    );
    await actor();
    await rejected(lookup);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ role_id: string }>(
          "select role_id from shopthie_private.app_user_roles where user_id=$1",
          [otherId],
        )
      ).rows[0].role_id,
      "customer",
    );
    assert.equal((await db.query("select * from shopthie_private.audit_events")).rows.length, 0);
  }));

test("lookup rejects actor revocation during audit instead of returning a stale Customer DTO", async () =>
  isolated(async () => {
    await auditHook(`delete from shopthie_private.app_user_roles where user_id='${customerId}'`);
    await actor();
    await rejected(lookup);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query("select * from shopthie_private.app_user_roles where user_id=$1", [
          customerId,
        ])
      ).rows.length,
      1,
    );
    assert.equal((await db.query("select * from shopthie_private.audit_events")).rows.length, 0);
  }));
