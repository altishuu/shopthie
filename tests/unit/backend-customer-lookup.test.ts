import assert from "node:assert/strict";
import test from "node:test";

const subject = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";

test("lookup action returns an exact audited RPC result bound to the submitted username", async () => {
  const { performCustomerLookup } = await import("../../src/modules/customer-lookup/service.ts");
  for (const role of ["owner", "admin"] as const) {
    let calls = 0;
    const row = { subject: target, username: "Demo_Customer", status: "active" };
    const port = {
      identity: async () => staffIdentity(role),
      ready: async () => ({ data: true, error: null }),
      lookup: async (input: unknown) => {
        calls++;
        assert.deepEqual(input, { username: "Demo_Customer", reason: "account_access" });
        return { data: row, error: null };
      },
    };
    const result = await performCustomerLookup(port, form());
    assert.equal(result.status, "found");
    assert.deepEqual(result.customer, row);
    assert.equal(calls, 1);
  }
});

const staffIdentity = (role: "owner" | "admin" = "admin") => ({
  status: "active" as const,
  email: "fixture@example.invalid",
  actor: {
    userId: subject,
    role,
    status: "active" as const,
    aal: "aal2" as const,
    hasVerifiedMfa: true,
  },
});

test("lookup page checks current staff and native readiness before exposing any form subject", async () => {
  const { readCustomerLookupPage } = await import("../../src/modules/customer-lookup/service.ts");
  for (const role of ["owner", "admin"] as const) {
    let calls = 0;
    const port = {
      identity: async () => staffIdentity(role),
      ready: async () => {
        calls++;
        return { data: true, error: null };
      },
      lookup: async () => ({ data: null, error: null }),
    };
    assert.deepEqual(await readCustomerLookupPage(port), { status: "ready", subject });
    assert.equal(calls, 1);
    port.ready = async () => ({ data: false, error: null });
    assert.equal((await readCustomerLookupPage(port)).status, "denied");
    port.ready = async () => ({ data: { allowed: true } as unknown as boolean, error: null });
    assert.equal((await readCustomerLookupPage(port)).status, "unavailable");
  }
});

function form() {
  const data = new FormData();
  data.set("expected_subject", subject);
  data.set("username", "Demo_Customer");
  data.set("reason", "account_access");
  return data;
}

test("exact lookup input accepts only one bounded username, approved reason and caller assertion", async () => {
  const { validateLookupInput } = await import("../../src/modules/customer-lookup/policy.ts");
  assert.deepEqual(validateLookupInput(form()), {
    valid: true,
    expectedSubject: subject,
    username: "Demo_Customer",
    reason: "account_access",
  });
});

test("lookup rejects wildcard, whitespace, duplicate, binary and expanded form fields", async () => {
  const { validateLookupInput } = await import("../../src/modules/customer-lookup/policy.ts");
  for (const [key, value] of [
    ["username", "ab"],
    ["username", "a".repeat(33)],
    ["username", "%demo%"],
    ["username", " Demo_Customer"],
    ["username", "demo@example.invalid"],
    ["username", "démo"],
    ["reason", ""],
    ["reason", "other"],
    ["reason", "private free text"],
    ["expected_subject", "not-a-uuid"],
    ["expected_subject", subject.toUpperCase().replace("4000", "4ABC")],
  ]) {
    const data = form();
    data.set(key, value);
    assert.equal(validateLookupInput(data).valid, false, `${key}:${value}`);
  }
  for (const key of ["username", "reason", "expected_subject"]) {
    const duplicate = form();
    duplicate.append(key, String(duplicate.get(key)));
    assert.equal(validateLookupInput(duplicate).valid, false);
    const absent = form();
    absent.delete(key);
    assert.equal(validateLookupInput(absent).valid, false);
    const binary = form();
    binary.set(key, new Blob(["invalid"]));
    assert.equal(validateLookupInput(binary).valid, false);
  }
  const expanded = form();
  expanded.set("role", "owner");
  assert.equal(validateLookupInput(expanded).valid, false);
  const framework = form();
  framework.set("$ACTION_ID_fixture", "");
  assert.equal(validateLookupInput(framework).valid, true);
});

test("lookup decoder returns only exact matched minimal metadata or a real no-match", async () => {
  const { decodeLookupRecord } = await import("../../src/modules/customer-lookup/policy.ts");
  const row = { subject: target, username: "DEMO_Customer", status: "active" };
  assert.deepEqual(decodeLookupRecord(row, "demo_customer"), { valid: true, customer: row });
  assert.deepEqual(decodeLookupRecord(null, "Demo_Customer"), { valid: true, customer: null });
  assert.equal(decodeLookupRecord({ ...row, status: "suspended" }, "demo_customer").valid, true);
  for (const data of [
    undefined,
    [],
    [row],
    "null",
    {},
    { ...row, phone: "+123" },
    { ...row, role: "customer" },
    Object.assign(Object.create({ subject: target }), {
      username: row.username,
      status: row.status,
      extra: true,
    }),
    { ...row, subject: "invalid" },
    { ...row, status: "pending" },
    { ...row, username: "someone_else" },
    { ...row, username: "" },
  ]) {
    assert.equal(decodeLookupRecord(data, "demo_customer").valid, false);
  }
});

test("lookup enables only its dedicated module and obligates an approved audited reason", async () => {
  const { resolveBackendModules } = await import("../../src/modules/registry.ts");
  const { authorize } = await import("../../src/modules/access/permissions.ts");
  const modules = ["profiles", "customer_lookup"];
  assert.deepEqual(resolveBackendModules(modules), [
    "identity",
    "access",
    "audit",
    "profiles",
    "customer_lookup",
  ]);
  const actor = {
    userId: subject,
    role: "admin" as const,
    status: "active" as const,
    aal: "aal2" as const,
    hasVerifiedMfa: true,
  };
  assert.deepEqual(
    authorize(actor, { permission: "customer.lookup", supportReason: "account_access" }, modules),
    { allowed: true, requiresAudit: true },
  );
  assert.equal(authorize(actor, { permission: "customer.lookup" }, modules).allowed, false);
  assert.equal(
    authorize(actor, { permission: "customer.lookup", supportReason: "unapproved" }, modules)
      .allowed,
    false,
  );
  assert.equal(
    authorize(actor, { permission: "customer.lookup", supportReason: "account_access" }, [
      "profiles",
      "staff",
    ]).allowed,
    false,
  );
  for (const permission of ["customer.status.manage", "staff.manage", "support.private.read"]) {
    assert.equal(authorize({ ...actor, role: "owner" }, { permission }, modules).allowed, false);
  }
});

test("unauthorized, incomplete MFA, malformed actors and disabled lookup never read readiness or Customer data", async () => {
  const { readCustomerLookupPage, performCustomerLookup } =
    await import("../../src/modules/customer-lookup/service.ts");
  const { actor } = staffIdentity();
  const identities = [
    { status: "guest" },
    { status: "mfa_required" },
    { status: "unavailable", message: "private provider error" },
    { status: "suspended" },
    { status: "unverified" },
    { status: "unprovisioned" },
    { ...staffIdentity(), actor: { ...actor, role: "customer" } },
    { ...staffIdentity(), actor: { ...actor, role: "__proto__" } },
    { ...staffIdentity(), actor: { ...actor, userId: "invalid" } },
    { ...staffIdentity(), actor: { ...actor, aal: "aal1" } },
    { ...staffIdentity(), actor: { ...actor, hasVerifiedMfa: false } },
    { ...staffIdentity(), actor: { ...actor, status: "suspended" } },
  ];
  for (const identity of identities) {
    let reads = 0;
    const port = {
      identity: async () => identity as import("../../src/modules/identity/types.ts").IdentityState,
      ready: async () => {
        reads++;
        return { data: true, error: null };
      },
      lookup: async () => {
        reads++;
        return { data: null, error: null };
      },
    };
    assert.notEqual((await readCustomerLookupPage(port)).status, "ready");
    const result = await performCustomerLookup(port, form());
    assert.equal(result.status, "error");
    assert.equal(result.customer, null);
    assert.equal(reads, 0);
    assert.doesNotMatch(JSON.stringify(result), /private provider error/);
  }
  const disabled = {
    identity: async () => staffIdentity(),
    enabledModules: [],
    ready: async () => {
      throw Error("must not read");
    },
    lookup: async () => {
      throw Error("must not read");
    },
  };
  assert.equal((await readCustomerLookupPage(disabled)).status, "denied");
  assert.equal((await performCustomerLookup(disabled, form())).status, "error");
});

test("invalid or stale-subject lookup never calls the audited RPC", async () => {
  const { performCustomerLookup } = await import("../../src/modules/customer-lookup/service.ts");
  let reads = 0;
  const port = {
    identity: async () => staffIdentity(),
    ready: async () => ({ data: true, error: null }),
    lookup: async () => {
      reads++;
      return { data: null, error: null };
    },
  };
  const invalid = form();
  invalid.set("username", "%");
  assert.equal((await performCustomerLookup(port, invalid)).status, "error");
  const stale = form();
  stale.set("expected_subject", target);
  assert.match((await performCustomerLookup(port, stale)).message, /sign-in changed/i);
  assert.equal(reads, 0);
});

test("audit errors, provider exceptions, expanded and mismatched results expose no customer payload", async () => {
  const { performCustomerLookup, readCustomerLookupPage } =
    await import("../../src/modules/customer-lookup/service.ts");
  const row = { subject: target, username: "Demo_Customer", status: "active" };
  for (const response of [
    { data: row, error: { code: "23514", message: "PRIVATE_AUDIT_FAILURE" } },
    { data: { ...row, phone: "+999999" }, error: null },
    { data: { ...row, subject }, error: null },
    { data: { ...row, username: "another_customer" }, error: null },
    { data: [], error: null },
    { data: undefined, error: null },
  ]) {
    const result = await performCustomerLookup(
      {
        identity: async () => staffIdentity(),
        ready: async () => ({ data: true, error: null }),
        lookup: async () => response,
      },
      form(),
    );
    assert.equal(result.status, "error");
    assert.equal(result.customer, null);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_AUDIT_FAILURE|999999|another_customer/);
  }
  const throwing = {
    identity: async () => staffIdentity(),
    ready: async () => {
      throw Error("PRIVATE_ERROR");
    },
    lookup: async () => {
      throw Error("PRIVATE_ERROR");
    },
  };
  assert.equal((await readCustomerLookupPage(throwing)).status, "unavailable");
  assert.equal((await performCustomerLookup(throwing, form())).status, "error");
  const missing = await performCustomerLookup(
    { ...throwing, lookup: async () => ({ data: null, error: null }) },
    form(),
  );
  assert.equal(missing.status, "not_found");
  assert.equal(missing.customer, null);
});
