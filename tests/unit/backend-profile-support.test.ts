import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import type { IdentityState } from "../../src/modules/identity/types.ts";

const subject = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
const username = "Demo_Customer";
const profile = { subject: target, username, phone: "+15550000001" };
function form(patch: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    expected_subject: subject,
    target_subject: target,
    username,
    reason: "profile_help",
    ...patch,
  }))
    data.set(key, value);
  return data;
}

// Policy is shared by server and UI; neither boundary may repair malformed values.
test("profile support validates exact form fields and binds an exact minimal unverified profile without normalization", async () => {
  assert.ok(
    existsSync(new URL("../../src/modules/profile-support/policy.ts", import.meta.url)),
    "profile-support policy must exist",
  );
  const { validateProfileSupportInput, decodeProfileSupportRecord } =
    await import("../../src/modules/profile-support/policy.ts");
  assert.deepEqual(validateProfileSupportInput(form()), {
    valid: true,
    expectedSubject: subject,
    targetSubject: target,
    username,
    reason: "profile_help",
  });
  const bookkeeping = form();
  bookkeeping.set("$ACTION_ID_fixture", "framework");
  assert.equal(validateProfileSupportInput(bookkeeping).valid, true);
  for (const patch of [
    { expected_subject: " " + subject },
    { expected_subject: subject.toUpperCase().replace("000001", "00000A") },
    { expected_subject: subject + "\n" },
    { target_subject: subject },
    { target_subject: target + "\n" },
    { target_subject: "not-a-uuid" },
    { username: "ab" },
    { username: "a".repeat(33) },
    { username: "_abc" },
    { username: " abc" },
    { username: "abc " },
    { username: "abc\n" },
    { username: "Ａbc" },
    { username: "demo.customer" },
    { reason: "" },
    { reason: "PROFILE_HELP" },
    { reason: "profile_help " },
    { reason: "account_access" },
    { reason: "address_help" },
  ] as Record<string, string>[])
    assert.deepEqual(
      validateProfileSupportInput(form(patch)),
      { valid: false },
      JSON.stringify(patch),
    );
  for (const key of ["expected_subject", "target_subject", "username", "reason"]) {
    const missing = form();
    missing.delete(key);
    assert.equal(validateProfileSupportInput(missing).valid, false);
    const duplicate = form();
    duplicate.append(key, String(duplicate.get(key)));
    assert.equal(validateProfileSupportInput(duplicate).valid, false);
    const file = form();
    file.set(key, new Blob(["fixture"]), "fixture.txt");
    assert.equal(validateProfileSupportInput(file).valid, false);
  }
  for (const key of [
    "phone",
    "role",
    "scope",
    "actor",
    "limit",
    "target_role",
    "expectedSubject",
  ]) {
    const expanded = form();
    expanded.set(key, "untrusted");
    assert.equal(validateProfileSupportInput(expanded).valid, false);
  }
  assert.deepEqual(decodeProfileSupportRecord(profile, target, "demo_customer"), {
    valid: true,
    profile,
  });
  assert.deepEqual(decodeProfileSupportRecord({ ...profile, phone: null }, target, username), {
    valid: true,
    profile: { ...profile, phone: null },
  });
  for (const value of [
    null,
    [],
    "profile",
    {},
    { ...profile, email: "private@example.invalid" },
    { ...profile, role: "customer" },
    { ...profile, subject },
    { ...profile, subject: target + "\n" },
    { ...profile, username: "Other_Customer" },
    { ...profile, username: "Demo_Customer\n" },
    { ...profile, phone: "" },
    { ...profile, phone: "15550000001" },
    { ...profile, phone: "+015550000001" },
    { ...profile, phone: "+15550000001\n" },
    { ...profile, phone: "+1234567890123456" },
    { subject: target, username },
    { ...profile, phone: undefined },
    { ...profile, phone: 123 },
  ])
    assert.deepEqual(decodeProfileSupportRecord(value, target, username), { valid: false });
  for (const invalid of ["Demo_Customer\n", " demo_customer", "Ｄemo_Customer", "ab"])
    assert.equal(decodeProfileSupportRecord(profile, target, invalid).valid, false);
  assert.equal(decodeProfileSupportRecord(profile, target + "\n", username).valid, false);
  const symbol = { ...profile, [Symbol("hidden")]: "private" };
  const hidden = Object.defineProperty({ ...profile }, "email", {
    value: "private",
    enumerable: false,
  });
  const inherited = Object.assign(Object.create({ phone: profile.phone }), {
    subject: target,
    username,
  });
  for (const value of [symbol, hidden, inherited])
    assert.equal(decodeProfileSupportRecord(value, target, username).valid, false);
});

test("profile support exposes the fixed interfaces and shared UI subject guard", async () => {
  const policy = await import("../../src/modules/profile-support/policy.ts");
  const service = await import("../../src/modules/profile-support/service.ts");
  assert.deepEqual(Object.keys(policy).sort(), [
    "decodeProfileSupportRecord",
    "profileSupportSubjectPattern",
    "validateProfileSupportInput",
  ]);
  assert.deepEqual(Object.keys(service).sort(), ["readProfileSupport", "readProfileSupportPage"]);
});

test("profile support decoder rejects hostile accessors/proxies without throwing or reading private getters", async () => {
  const { decodeProfileSupportRecord } =
    await import("../../src/modules/profile-support/policy.ts");
  let getterReads = 0;
  const accessor = Object.defineProperty({ subject: target, username }, "phone", {
    enumerable: true,
    get() {
      getterReads++;
      throw Error("PRIVATE_GETTER");
    },
  });
  const hostile = new Proxy(
    {},
    {
      ownKeys() {
        throw Error("PRIVATE_PROXY");
      },
    },
  );
  for (const value of [accessor, hostile]) {
    assert.doesNotThrow(() => decodeProfileSupportRecord(value, target, username));
    assert.deepEqual(decodeProfileSupportRecord(value, target, username), { valid: false });
  }
  assert.equal(getterReads, 0);
});

function harness(identityPatch?: IdentityState) {
  const calls: unknown[] = [];
  const state = {
    identity:
      identityPatch ??
      ({
        status: "active",
        email: "fixture@example.invalid",
        actor: {
          userId: subject,
          role: "admin",
          status: "active",
          aal: "aal2",
          hasVerifiedMfa: true,
        },
      } as IdentityState),
    ready: { data: true as unknown, error: null as unknown },
    read: { data: profile as unknown, error: null as unknown },
  };
  const port = {
    identity: async () => {
      calls.push("identity");
      return state.identity;
    },
    ready: async () => {
      calls.push("ready");
      return state.ready;
    },
    read: async (input: { targetSubject: string; username: string; reason: "profile_help" }) => {
      calls.push(["read", input]);
      return state.read;
    },
    enabledModules: ["profiles", "customer_lookup", "profile_support"],
  };
  return { port, calls, state };
}

test("profile support capability is self-only while explicit read binds caller and selected username through readiness", async () => {
  assert.ok(
    existsSync(new URL("../../src/modules/profile-support/service.ts", import.meta.url)),
    "profile-support service must exist",
  );
  const { readProfileSupportPage, readProfileSupport } =
    await import("../../src/modules/profile-support/service.ts");
  const page = harness();
  assert.deepEqual(await readProfileSupportPage(page.port), { status: "ready", subject });
  assert.deepEqual(page.calls, ["identity", "ready"]);
  const operation = harness();
  const result = await readProfileSupport(operation.port, form({ username: "demo_CUSTOMER" }));
  assert.equal(result.status, "ready");
  assert.deepEqual(result.profile, profile);
  assert.deepEqual(operation.calls, [
    "identity",
    "ready",
    ["read", { targetSubject: target, username: "demo_CUSTOMER", reason: "profile_help" }],
  ]);
  operation.calls.length = 0;
  operation.state.read.data = { ...profile, phone: null };
  assert.deepEqual((await readProfileSupport(operation.port, form())).profile, {
    ...profile,
    phone: null,
  });
});

test("profile support denies inactive, unverified, unknown and missing authority before any target operation", async () => {
  const { readProfileSupportPage, readProfileSupport } =
    await import("../../src/modules/profile-support/service.ts");
  for (const status of [
    "guest",
    "mfa_required",
    "unavailable",
    "unprovisioned",
    "unverified",
    "suspended",
    "unknown",
  ]) {
    const ctx = harness({ status, message: "PRIVATE_IDENTITY_DETAILS" } as IdentityState);
    const page = await readProfileSupportPage(ctx.port);
    assert.equal(
      page.status,
      status === "guest" || status === "mfa_required"
        ? status
        : status === "unavailable"
          ? "unavailable"
          : "denied",
    );
    const result = await readProfileSupport(ctx.port, form());
    assert.equal(result.status, "error");
    assert.equal(result.profile, null);
    assert.deepEqual(ctx.calls, ["identity", "identity"]);
    assert.doesNotMatch(JSON.stringify([page, result]), /PRIVATE_IDENTITY_DETAILS/);
  }
  const active = harness().state.identity;
  assert.equal(active.status, "active");
  if (active.status !== "active") return;
  const patches: Record<string, unknown>[] = [
    { role: "customer" },
    { role: "manager" },
    { role: "__proto__" },
    { role: undefined },
    { status: "suspended" },
    { status: "pending" },
    { status: undefined },
    { aal: "aal1" },
    { aal: "unknown" },
    { aal: undefined },
    { hasVerifiedMfa: false },
    { hasVerifiedMfa: "true" },
    { hasVerifiedMfa: undefined },
    { userId: "" },
    { userId: subject + "\n" },
    { userId: undefined },
  ];
  for (const actor of [
    null,
    undefined,
    ...patches.map((patch) => ({ ...active.actor, ...patch })),
  ]) {
    const ctx = harness({ ...active, actor } as IdentityState);
    assert.notEqual((await readProfileSupportPage(ctx.port)).status, "ready");
    const result = await readProfileSupport(ctx.port, form());
    assert.equal(result.status, "error");
    assert.equal(result.profile, null);
    assert.deepEqual(ctx.calls, ["identity", "identity"]);
  }
  for (const modules of [
    [],
    ["profiles", "customer_lookup"],
    ["profile_support"],
    ["profiles", "customer_lookup", "profile_support", "unknown"],
  ]) {
    const ctx = harness();
    ctx.port.enabledModules = modules;
    assert.notEqual((await readProfileSupportPage(ctx.port)).status, "ready");
    assert.equal((await readProfileSupport(ctx.port, form())).profile, null);
    assert.deepEqual(ctx.calls, ["identity", "identity"]);
  }
  const changed = harness();
  assert.equal(
    (
      await readProfileSupport(
        changed.port,
        form({ expected_subject: "00000000-0000-4000-8000-000000000003" }),
      )
    ).status,
    "error",
  );
  assert.deepEqual(changed.calls, ["identity"]);
  const invalid = harness();
  assert.equal((await readProfileSupport(invalid.port, form({ actor: subject }))).status, "error");
  assert.deepEqual(invalid.calls, []);
});

test("profile support requires literal self-readiness and rejects all malformed/expanded results and raw errors without partial data", async () => {
  const { readProfileSupportPage, readProfileSupport } =
    await import("../../src/modules/profile-support/service.ts");
  for (const data of [
    false,
    null,
    undefined,
    1,
    "true",
    [],
    { ready: true },
    { ...profile, ready: true },
  ]) {
    const ctx = harness();
    ctx.state.ready.data = data;
    assert.equal(
      (await readProfileSupportPage(ctx.port)).status,
      data === false ? "denied" : "unavailable",
    );
    const result = await readProfileSupport(ctx.port, form());
    assert.equal(result.status, "error");
    assert.equal(result.profile, null);
    assert.deepEqual(ctx.calls, ["identity", "ready", "identity", "ready"]);
  }
  for (const data of [
    null,
    undefined,
    [],
    { ...profile, email: "PRIVATE_DATA" },
    { ...profile, revision: 1 },
    { ...profile, subject },
    { ...profile, username: "Different_Customer" },
    { ...profile, phone: "PRIVATE_DATA" },
    { subject: target, username },
  ]) {
    const ctx = harness();
    ctx.state.read.data = data;
    const result = await readProfileSupport(ctx.port, form());
    assert.equal(result.status, "error");
    assert.equal(result.profile, null);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DATA|15550000001/);
  }
  for (const boundary of ["ready", "read"] as const) {
    for (const error of [
      undefined,
      {},
      { code: "42501", message: "PRIVATE_PROVIDER_DETAILS", details: profile },
      Error("PRIVATE_PROVIDER_DETAILS"),
    ]) {
      const ctx = harness();
      ctx.state[boundary].error = error;
      const result = await readProfileSupport(ctx.port, form());
      assert.equal(result.status, "error");
      assert.equal(result.profile, null);
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PROVIDER_DETAILS|15550000001/);
      if (boundary === "ready") assert.deepEqual(ctx.calls, ["identity", "ready"]);
    }
  }
  for (const boundary of ["identity", "ready", "read"] as const) {
    const ctx = harness();
    ctx.port[boundary] = async () => {
      throw Error("PRIVATE_PROVIDER_DETAILS");
    };
    const page = await readProfileSupportPage(ctx.port);
    const result = await readProfileSupport(ctx.port, form());
    if (boundary !== "read") assert.equal(page.status, "unavailable");
    assert.equal(result.status, "error");
    assert.equal(result.profile, null);
    assert.doesNotMatch(JSON.stringify([page, result]), /PRIVATE_PROVIDER_DETAILS|15550000001/);
  }
});
