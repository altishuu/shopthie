import assert from "node:assert/strict";
import test from "node:test";
import { performMfaOperation, type MfaTransport } from "../../src/modules/identity/mfa/service.ts";
import type { MfaContext } from "../../src/modules/identity/mfa/types.ts";
const subject = "11111111-1111-4111-8111-111111111111";
const factorId = "22222222-2222-4222-8222-222222222222";
const pending: MfaContext = {
  status: "ready",
  subject,
  role: "customer",
  aal: "aal1",
  factors: [{ id: factorId, status: "unverified" }],
  otherVerifiedFactor: false,
};
const verified: MfaContext = {
  ...pending,
  aal: "aal2",
  factors: [{ id: factorId, status: "verified" }],
};
function form(operation: string) {
  const f = new FormData();
  f.set("operation", operation);
  f.set("expected_subject", subject);
  f.set("factor_id", factorId);
  f.set("code", "012345");
  return f;
}
function transport(contexts: MfaContext[] = [pending, verified]) {
  const calls: string[] = [];
  let index = 0;
  const port: MfaTransport = {
    readContext: async () => contexts[Math.min(index++, contexts.length - 1)]!,
    enroll: async () => {
      calls.push("enroll");
      return { ok: true, data: null };
    },
    verify: async (id, code) => {
      assert.equal(id, factorId);
      assert.equal(code, "012345");
      calls.push("verify");
      return { ok: true, data: null };
    },
    remove: async (id) => {
      assert.equal(id, factorId);
      calls.push("remove");
      return { ok: true, data: null };
    },
    refresh: async () => {
      calls.push("refresh");
      return { ok: true, data: null };
    },
  };
  return { port, calls };
}

test("verification reports success only after fresh AAL2 and verified self factor readback", async () => {
  const { port, calls } = transport();
  const result = await performMfaOperation(port, form("verify"));
  assert.equal(result.status, "success");
  assert.deepEqual(calls, ["verify"]);
  assert.ok(!JSON.stringify(result).includes("012345"));
  const missingProof = transport([pending]);
  const denied = await performMfaOperation(missingProof.port, form("verify"));
  assert.equal(denied.status, "error");
  if (denied.status === "error") assert.equal(denied.reloadRequired, true);
});

test("verified-factor removal requires a fresh code, live AAL2, refresh and absent-factor readback", async () => {
  const empty: MfaContext = { ...verified, aal: "aal1", factors: [] };
  const { port, calls } = transport([verified, verified, empty]);
  const f = form("remove");
  f.set("confirm_remove", "yes");
  const result = await performMfaOperation(port, f);
  assert.equal(result.status, "success");
  assert.deepEqual(calls, ["verify", "remove", "refresh"]);
  const bad = transport([verified]);
  bad.port.verify = async () => ({ ok: false, reason: "rejected" });
  assert.equal((await performMfaOperation(bad.port, f)).status, "error");
  assert.deepEqual(bad.calls, []);
  const changed = transport([
    verified,
    { ...verified, subject: "33333333-3333-4333-8333-333333333333" },
  ]);
  assert.equal((await performMfaOperation(changed.port, f)).status, "error");
  assert.deepEqual(changed.calls, ["verify"]);
});

test("cancel only removes the current account's pending factor, never a verified factor", async () => {
  const { port, calls } = transport([pending, { ...pending, factors: [] }]);
  const f = form("cancel");
  f.delete("code");
  assert.equal((await performMfaOperation(port, f)).status, "success");
  assert.deepEqual(calls, ["remove"]);
  for (const ctx of [verified]) {
    const denied = transport([ctx]);
    assert.equal((await performMfaOperation(denied.port, f)).status, "error");
    assert.deepEqual(denied.calls, []);
  }
});

test("enrollment needs backup acknowledgment and proves pending ownership before returning setup", async () => {
  const empty = { ...pending, factors: [] };
  const { port, calls } = transport([empty, pending]);
  port.enroll = async () => {
    calls.push("enroll");
    return {
      ok: true,
      data: {
        id: factorId,
        type: "totp",
        totp: {
          secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
          qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        },
      },
    };
  };
  const f = new FormData();
  f.set("operation", "enroll");
  f.set("expected_subject", subject);
  f.set("acknowledge_backup", "yes");
  const result = await performMfaOperation(port, f);
  assert.equal(result.status, "enrollment");
  assert.deepEqual(calls, ["enroll"]);
  for (const ctx of [pending, verified, { ...empty, otherVerifiedFactor: true }]) {
    const blocked = transport([ctx]);
    assert.equal((await performMfaOperation(blocked.port, f)).status, "error");
    assert.deepEqual(blocked.calls, []);
  }
  const unmatched = transport([empty, empty]);
  unmatched.port.enroll = port.enroll;
  const denied = await performMfaOperation(unmatched.port, f);
  assert.equal(denied.status, "error");
  assert.ok(!JSON.stringify(denied).includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"));
});

test("stale subject, foreign factor and guest stop before provider mutations", async () => {
  const changed = transport();
  const f = form("verify");
  f.set("expected_subject", "33333333-3333-4333-8333-333333333333");
  assert.equal((await performMfaOperation(changed.port, f)).status, "error");
  assert.deepEqual(changed.calls, []);
  const foreign = transport();
  f.set("expected_subject", subject);
  f.set("factor_id", "44444444-4444-4444-8444-444444444444");
  assert.equal((await performMfaOperation(foreign.port, f)).status, "error");
  assert.deepEqual(foreign.calls, []);
  const guest = transport();
  guest.port.readContext = async () => ({ status: "guest" });
  assert.equal((await performMfaOperation(guest.port, form("verify"))).status, "error");
  assert.deepEqual(guest.calls, []);
});

test("rate limits are bounded, ambiguous writes lock for reload, and refresh failures never report removal success", async () => {
  const rate = transport();
  rate.port.verify = async () => ({ ok: false, reason: "rate_limited" });
  const limited = await performMfaOperation(rate.port, form("verify"));
  assert.equal(limited.status, "error");
  assert.match(limited.message, /wait/i);
  const network = transport();
  network.port.verify = async () => {
    throw new Error("synthetic-private-provider-detail");
  };
  const unknown = await performMfaOperation(network.port, form("verify"));
  assert.equal(unknown.status, "error");
  if (unknown.status === "error") assert.equal(unknown.reloadRequired, true);
  assert.ok(!JSON.stringify(unknown).includes("synthetic-private-provider-detail"));
  const refresh = transport([verified]);
  refresh.port.refresh = async () => ({ ok: false, reason: "uncertain" });
  const f = form("remove");
  f.set("confirm_remove", "yes");
  const result = await performMfaOperation(refresh.port, f);
  assert.equal(result.status, "error");
  if (result.status === "error") assert.equal(result.reloadRequired, true);
  assert.deepEqual(refresh.calls, ["verify", "remove"]);
});

test("staff cancel never removes a factor verified concurrently while the action is in flight", async () => {
  for (const role of ["owner", "admin"] as const) {
    for (const aal of ["aal1", "aal2"] as const) {
      const snapshot: MfaContext = { ...pending, role, aal };
      let live: MfaContext = snapshot;
      const { port, calls } = transport();
      let release!: (context: MfaContext) => void;
      let reads = 0;
      port.readContext = async () =>
        ++reads === 1
          ? new Promise<MfaContext>((resolve) => {
              release = resolve;
            })
          : live;
      port.remove = async () => {
        calls.push("remove");
        assert.equal(live.factors[0]?.status, "verified");
        live = { ...live, factors: [] };
        return { ok: true, data: null };
      };
      const f = form("cancel");
      f.delete("code");
      const inFlight = performMfaOperation(port, f);
      live = { ...verified, role };
      release(snapshot);
      const result = await inFlight;
      assert.equal(result.status, "error");
      assert.deepEqual(calls, [], "no staff unenroll, even with a stale pending snapshot");
      assert.equal(live.factors[0]?.status, "verified");
    }
  }
});

test("active staff can enroll and verify their pending authenticator but cannot cancel or remove factors", async () => {
  for (const role of ["owner", "admin"] as const) {
    const start = { ...pending, role, factors: [] };
    const pendingStaff = { ...pending, role };
    const verifiedStaff = { ...verified, role };
    const enroll = transport([start, pendingStaff]);
    enroll.port.enroll = async () => ({
      ok: true,
      data: {
        id: factorId,
        type: "totp",
        totp: {
          secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
          qr_code: "data:image/svg+xml;utf-8,<svg></svg>",
        },
      },
    });
    const f = new FormData();
    f.set("operation", "enroll");
    f.set("expected_subject", subject);
    f.set("acknowledge_backup", "yes");
    assert.equal((await performMfaOperation(enroll.port, f)).status, "enrollment");
    const verify = transport([pendingStaff, verifiedStaff]);
    assert.equal((await performMfaOperation(verify.port, form("verify"))).status, "success");
    const cancel = transport([pendingStaff, start]);
    const c = form("cancel");
    c.delete("code");
    assert.equal((await performMfaOperation(cancel.port, c)).status, "error");
    assert.deepEqual(cancel.calls, []);
    const verifiedCancel = transport([verifiedStaff]);
    assert.equal((await performMfaOperation(verifiedCancel.port, c)).status, "error");
    assert.deepEqual(verifiedCancel.calls, []);
    const remove = transport([verifiedStaff]);
    const r = form("remove");
    r.set("confirm_remove", "yes");
    assert.equal((await performMfaOperation(remove.port, r)).status, "error");
    assert.deepEqual(remove.calls, []);
  }
});
