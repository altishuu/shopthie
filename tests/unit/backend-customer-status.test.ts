import assert from "node:assert/strict";
import test from "node:test";

test("status decoder rejects expanded, wrong-target and malformed revision data", async () => {
  const { decodeStatusRecord } = await import("../../src/modules/customer-status/policy.ts");
  const row = { subject: targetId, status: "active", revision: 0 };
  assert.deepEqual(decodeStatusRecord(row, targetId), { valid: true, record: row });
  for (const value of [
    null,
    [],
    [row],
    { ...row, role: "customer" },
    { ...row, subject: actorId },
    { ...row, subject: targetId + "\n" },
    { ...row, status: "pending" },
    { ...row, revision: -1 },
    { ...row, revision: 1.2 },
    { ...row, revision: 2147483648 },
    { ...row, revision: "0" },
  ])
    assert.equal(decodeStatusRecord(value, targetId).valid, false);
  assert.equal(decodeStatusRecord({ ...row, revision: 2147483647 }, targetId).valid, true);
});

test("status input rejects duplicate, binary, unconfirmed, self and noncanonical values", async () => {
  const { validateStatusInput } = await import("../../src/modules/customer-status/policy.ts");
  for (const [key, value] of [
    ["revision", "0\n"],
    ["revision", "01"],
    ["revision", "2147483647"],
    ["revision", "-1"],
    ["confirm_change", "no"],
    ["desired_status", "banned"],
    ["target_subject", actorId],
    ["target_subject", targetId + "\n"],
    ["expected_subject", actorId + "\n"],
    ["reason", "free text"],
  ]) {
    const data = input(true);
    data.set(key, value);
    assert.equal(validateStatusInput(data, true).valid, false, `${key}:${value}`);
  }
  for (const key of [
    "expected_subject",
    "target_subject",
    "reason",
    "revision",
    "desired_status",
    "confirm_change",
  ]) {
    const data = input(true);
    data.append(key, String(data.get(key)));
    assert.equal(validateStatusInput(data, true).valid, false);
    const binary = input(true);
    binary.set(key, new Blob(["bad"]));
    assert.equal(validateStatusInput(binary, true).valid, false);
  }
  const expanded = input();
  expanded.set("role", "owner");
  assert.equal(validateStatusInput(expanded, false).valid, false);
});

function staff() {
  return {
    status: "active" as const,
    email: "fixture@example.invalid",
    actor: {
      userId: actorId,
      role: "admin" as const,
      status: "active" as const,
      aal: "aal2" as const,
      hasVerifiedMfa: true,
    },
  };
}
test("status service readiness and audited read/change use current actor and freshly loaded target facts", async () => {
  const { readStatusPage, performCustomerStatus } =
    await import("../../src/modules/customer-status/service.ts");
  const calls: string[] = [];
  const port = {
    identity: async () => staff(),
    ready: async () => ({ data: true, error: null }),
    read: async () => {
      calls.push("read");
      return { data: { subject: targetId, status: "active", revision: 0 }, error: null };
    },
    change: async (value: unknown) => {
      calls.push("change");
      assert.deepEqual(value, {
        targetSubject: targetId,
        reason: "account_security",
        desiredStatus: "suspended",
        revision: 0,
      });
      return { data: { subject: targetId, status: "suspended", revision: 1 }, error: null };
    },
  };
  assert.deepEqual(await readStatusPage(port), { status: "ready", subject: actorId });
  assert.equal((await performCustomerStatus(port, input(), false)).status, "ready");
  const result = await performCustomerStatus(port, input(true), true);
  assert.equal(result.status, "success");
  assert.deepEqual(result.record, { subject: targetId, status: "suspended", revision: 1 });
  assert.deepEqual(calls, ["read", "read", "change"]);
});

test("status service denies invalid/stale callers and absent current capability before target access", async () => {
  const { readStatusPage, performCustomerStatus } =
    await import("../../src/modules/customer-status/service.ts");
  const base = staff();
  for (const identity of [
    { status: "guest" },
    { status: "mfa_required" },
    { status: "suspended" },
    { status: "unverified" },
    { ...base, actor: { ...base.actor, role: "customer" } },
    { ...base, actor: { ...base.actor, aal: "aal1" } },
    { ...base, actor: { ...base.actor, hasVerifiedMfa: false } },
    { ...base, actor: { ...base.actor, status: "suspended" } },
  ]) {
    let count = 0;
    const port = {
      identity: async () => identity as import("../../src/modules/identity/types.ts").IdentityState,
      ready: async () => {
        count++;
        return { data: true, error: null };
      },
      read: async () => {
        count++;
        return { data: null, error: null };
      },
      change: async () => {
        count++;
        return { data: null, error: null };
      },
    };
    assert.notEqual((await readStatusPage(port)).status, "ready");
    assert.equal((await performCustomerStatus(port, input(true), true)).record, null);
    assert.equal(count, 0);
  }
  const port = {
    identity: async () => base,
    ready: async () => ({ data: false, error: null }),
    read: async () => {
      throw Error("must not read");
    },
    change: async () => {
      throw Error("must not write");
    },
  };
  assert.equal((await performCustomerStatus(port, input(true), true)).status, "error");
  const stale = input(true);
  stale.set("expected_subject", "00000000-0000-4000-8000-000000000009");
  assert.match((await performCustomerStatus(port, stale, true)).message, /sign-in changed/);
});
test("status conflict, unchanged status, audit failures and ambiguous postconditions never fabricate success", async () => {
  const { performCustomerStatus } = await import("../../src/modules/customer-status/service.ts");
  let writes = 0;
  let current = { subject: targetId, status: "active", revision: 0 };
  let response: { data: unknown; error: unknown } = {
    data: { subject: targetId, status: "suspended", revision: 1 },
    error: null,
  };
  const port = {
    identity: async () => staff(),
    ready: async () => ({ data: true, error: null }),
    read: async () => ({ data: current, error: null }),
    change: async () => {
      writes++;
      return response;
    },
  };
  current = { ...current, revision: 1 };
  assert.equal((await performCustomerStatus(port, input(true), true)).status, "conflict");
  assert.equal(writes, 0);
  current = { ...current, revision: 0, status: "suspended" };
  assert.equal((await performCustomerStatus(port, input(true), true)).status, "error");
  assert.equal(writes, 0);
  current = { ...current, status: "active" };
  for (const next of [
    { data: null, error: { code: "P0001", message: "customer_status_conflict" } },
    { data: null, error: { message: "RAW_AUDIT_DETAILS" } },
    { data: { subject: targetId, status: "suspended", revision: 9 }, error: null },
    { data: { ...current, email: "private@example.invalid" }, error: null },
  ]) {
    response = next;
    const result = await performCustomerStatus(port, input(true), true);
    assert.equal(result.record, null);
    assert.notEqual(result.status, "success");
    assert.doesNotMatch(JSON.stringify(result), /RAW_AUDIT_DETAILS|private@example/);
  }
  port.change = async () => {
    throw Error("RAW_NETWORK_FAILURE");
  };
  assert.equal((await performCustomerStatus(port, input(true), true)).status, "error");
});

const actorId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
function input(change = false) {
  const data = new FormData();
  data.set("expected_subject", actorId);
  data.set("target_subject", targetId);
  data.set("reason", "account_security");
  if (change) {
    data.set("desired_status", "suspended");
    data.set("revision", "0");
    data.set("confirm_change", "yes");
  }
  return data;
}

test("status forms bind the caller and a separate Customer target without accepting role authority", async () => {
  const { validateStatusInput } = await import("../../src/modules/customer-status/policy.ts");
  assert.deepEqual(validateStatusInput(input(), false), {
    valid: true,
    expectedSubject: actorId,
    targetSubject: targetId,
    reason: "account_security",
  });
  assert.deepEqual(validateStatusInput(input(true), true), {
    valid: true,
    expectedSubject: actorId,
    targetSubject: targetId,
    reason: "account_security",
    desiredStatus: "suspended",
    revision: 0,
  });
});
