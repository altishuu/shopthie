import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import type { MfaPageState } from "../../src/modules/identity/mfa/types.ts";
import type { OwnerSetupTransport } from "../../src/modules/owner-setup/service.ts";
const subject = "00000000-0000-4000-8000-000000000001";
const designation = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const intent = {
  id: "00000000-0000-4000-8000-000000000004",
  expiresAt: "2026-11-06T02:00:00.000001Z",
};
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
function fixture() {
  const calls: string[] = [];
  const context: MfaPageState = {
    status: "ready",
    subject,
    role: "customer",
    aal: "aal2",
    factors: [{ id: other, status: "verified" }],
    otherVerifiedFactor: false,
  };
  let phase = "ready";
  const port: OwnerSetupTransport = {
    readSession: async (): Promise<MfaPageState> => context,
    readState: async () => {
      calls.push("state");
      return {
        ok: true as const,
        data: { subject, status: phase, designation, ...(phase === "consented" ? { intent } : {}) },
      };
    },
    consent: async (id: string) => {
      calls.push("consent:" + id);
      phase = "consented";
      return { ok: true as const, data: { subject, status: phase, designation, intent } };
    },
    verify: async (id: string, code: string) => {
      assert.equal(id, subject);
      assert.equal(code, "123456");
      calls.push("verify");
      return { status: "success" as const, message: "verified", context };
    },
  };
  return { port, calls, context };
}
test("unavailable/foreign identity and expanded native states cannot reach consent", async () => {
  const { prepareOwnerSetupConsent, readOwnerSetupPage } =
    await import("../../src/modules/owner-setup/service.ts");
  for (const kind of ["guest", "admin", "foreign", "expanded", "exception"]) {
    const f = fixture();
    if (kind === "guest") f.port.readSession = async () => ({ status: "guest" });
    if (kind === "admin") f.port.readSession = async () => ({ ...f.context, role: "admin" });
    if (kind === "foreign")
      f.port.readState = async () => ({
        ok: true,
        data: { subject: other, status: "ready", designation },
      });
    if (kind === "expanded")
      f.port.readState = async () => ({
        ok: true,
        data: { subject, status: "ready", designation, session_id: "PRIVATE_FIXTURE" },
      });
    if (kind === "exception")
      f.port.readSession = async () => {
        throw Error("PRIVATE_FIXTURE");
      };
    assert.notEqual((await readOwnerSetupPage(f.port)).status, "ready");
    const result = await prepareOwnerSetupConsent(
      f.port,
      form({ subject, designation, confirm: "yes" }),
    );
    assert.equal(result.status, "error");
    assert.equal(
      f.calls.some((x) => x.startsWith("consent:")),
      false,
    );
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_FIXTURE/);
  }
});
test("uncertain consent is never retried; changed post-consent identity clears all intent data", async () => {
  const { prepareOwnerSetupConsent } = await import("../../src/modules/owner-setup/service.ts");
  for (const kind of ["uncertain", "identity_changed", "changed_intent"]) {
    const f = fixture();
    if (kind === "uncertain")
      f.port.consent = async () => {
        f.calls.push("consent:uncertain");
        return { ok: false, reason: "uncertain" };
      };
    if (kind === "identity_changed") {
      let reads = 0;
      f.port.readSession = async () => (++reads === 1 ? f.context : { status: "guest" });
    }
    if (kind === "changed_intent") {
      let reads = 0;
      f.port.readState = async () => ({
        ok: true,
        data:
          ++reads === 1
            ? { subject, status: "ready", designation }
            : { subject, status: "consented", designation, intent: { ...intent, id: other } },
      });
    }
    const result = await prepareOwnerSetupConsent(
      f.port,
      form({ subject, designation, confirm: "yes" }),
    );
    assert.equal(result.status, "error");
    assert.equal(result.reloadRequired, true);
    assert.equal(f.calls.filter((x) => x.startsWith("consent:")).length, 1);
    assert.equal(result.state?.status, "unavailable");
    assert.equal(JSON.stringify(result).includes(intent.id), false);
  }
});
test("a provider verification success is insufficient when native recent-MFA readiness still denies", async () => {
  const { verifyOwnerSetupCode } = await import("../../src/modules/owner-setup/service.ts");
  const f = fixture();
  f.port.readState = async () => ({
    ok: true,
    data: { subject, status: "mfa_required", designation },
  });
  const result = await verifyOwnerSetupCode(f.port, form({ subject, code: "123456" }));
  assert.equal(result.status, "error");
  assert.equal(result.reloadRequired, true);
  assert.equal(f.calls.filter((x) => x === "verify").length, 1);
  assert.equal(JSON.stringify(result).includes("123456"), false);
});
test("MFA verification is self-only and requires fresh native recent-MFA readiness afterward", async () => {
  const service = await import("../../src/modules/owner-setup/service.ts");
  assert.equal(typeof service.verifyOwnerSetupCode, "function");
  const f = fixture();
  const result = await service.verifyOwnerSetupCode(f.port, form({ subject, code: "123456" }));
  assert.equal(result.status, "success");
  assert.equal(f.calls.filter((x) => x === "verify").length, 1);
  assert.equal(JSON.stringify(result).includes("123456"), false);
  const bad = fixture();
  assert.equal(
    (await service.verifyOwnerSetupCode(bad.port, form({ subject: other, code: "123456" }))).status,
    "error",
  );
  assert.equal(bad.calls.includes("verify"), false);
});

test("self consent is explicit, audited by native RPC, and only succeeds after fresh matching readback", async () => {
  assert.ok(existsSync(new URL("../../src/modules/owner-setup/service.ts", import.meta.url)));
  const { readOwnerSetupPage, prepareOwnerSetupConsent } =
    await import("../../src/modules/owner-setup/service.ts");
  const f = fixture();
  assert.deepEqual(await readOwnerSetupPage(f.port), {
    status: "ready",
    subject,
    phase: "ready",
    designation,
  });
  const result = await prepareOwnerSetupConsent(
    f.port,
    form({ subject, designation, confirm: "yes" }),
  );
  assert.equal(result.status, "success");
  assert.deepEqual(result.state, {
    status: "ready",
    subject,
    phase: "consented",
    designation,
    intent,
  });
  assert.equal(f.calls.filter((x) => x.startsWith("consent:")).length, 1);
  assert.equal(JSON.stringify(result).includes("123456"), false);
  for (const fields of [
    { subject: other, designation, confirm: "yes" },
    { subject, designation: other, confirm: "yes" },
    { subject, designation, confirm: "no" },
  ]) {
    const bad = fixture();
    assert.equal((await prepareOwnerSetupConsent(bad.port, form(fields))).status, "error");
    assert.equal(
      bad.calls.some((x) => x.startsWith("consent:")),
      false,
    );
  }
});
