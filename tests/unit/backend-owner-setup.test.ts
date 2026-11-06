import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { backendModuleDependencies, resolveBackendModules } from "../../src/modules/registry.ts";
import {
  authorize,
  permissionDefinitions,
  rolePermissions,
} from "../../src/modules/access/permissions.ts";
const subject = "00000000-0000-4000-8000-000000000001";
const designation = "00000000-0000-4000-8000-000000000002";
const intentId = "00000000-0000-4000-8000-000000000003";

test("owner setup contributes only an audited self-request capability, never an app promotion permission", () => {
  assert.deepEqual(
    backendModuleDependencies["owner_setup" as keyof typeof backendModuleDependencies],
    ["identity", "access", "audit"],
  );
  assert.ok(resolveBackendModules(["owner_setup"]).includes("owner_setup" as never));
  assert.equal(Object.hasOwn(permissionDefinitions, "owner.bootstrap.request_own"), true);
  for (const role of ["customer", "admin", "owner"] as const) {
    const actor = {
      userId: subject,
      role,
      status: "active" as const,
      aal: "aal2" as const,
      hasVerifiedMfa: true,
    };
    const request = { permission: "owner.bootstrap.request_own", resourceOwnerId: subject };
    assert.equal(
      (rolePermissions[role] as readonly string[]).includes(request.permission),
      role === "customer",
    );
    assert.deepEqual(
      authorize(actor, request, ["owner_setup"]),
      role === "customer"
        ? { allowed: true, requiresAudit: true }
        : { allowed: false, reason: "forbidden" },
    );
  }
  for (const hasVerifiedMfa of [false, true]) {
    assert.equal(
      authorize(
        { userId: subject, role: "customer", status: "active", aal: "aal1", hasVerifiedMfa },
        { permission: "owner.bootstrap.request_own", resourceOwnerId: subject },
        ["owner_setup"],
      ).allowed,
      false,
    );
  }
});

function setupForm(fields: Record<string, string | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data.set(key, value);
  return data;
}
test("native setup DTOs reject non-string phases, hidden fields and accessor/prototype objects without invoking them", async () => {
  const { decodeOwnerSetupState } = await import("../../src/modules/owner-setup/policy.ts");
  const ready = { subject, status: "ready", designation };
  for (const raw of [
    { ...ready, status: { toString: () => "ready" } },
    Object.assign(Object.create({ extra: "hidden" }), ready),
    Object.defineProperty({ ...ready }, Symbol("private"), { value: "hidden" }),
  ])
    assert.equal(decodeOwnerSetupState(raw, subject), null);
  let reads = 0;
  const getter = Object.defineProperty({ ...ready }, "subject", {
    get: () => {
      reads++;
      return subject;
    },
  });
  assert.equal(decodeOwnerSetupState(getter, subject), null);
  assert.equal(reads, 0);
});

test("owner setup validates exact self DTO, confirmation and code without exposing proof", async () => {
  assert.ok(existsSync(new URL("../../src/modules/owner-setup/policy.ts", import.meta.url)));
  const { decodeOwnerSetupState, validateOwnerSetupConsent, validateOwnerSetupVerification } =
    await import("../../src/modules/owner-setup/policy.ts");
  const intent = { id: intentId, expiresAt: "2026-11-06T00:00:00.123456Z" };
  const native = { subject, status: "consented", designation, intent };
  assert.deepEqual(decodeOwnerSetupState(native, subject), {
    status: "ready",
    subject,
    phase: "consented",
    designation,
    intent,
  });
  for (const patch of [
    { subject: intentId },
    { designation: designation + "\n" },
    { status: "owner" },
    { session_id: intentId },
    { aal: "aal2" },
    { intent: { ...intent, token: "fixture" } },
    { intent: { ...intent, expiresAt: "2026-02-31T00:00:00.123456Z" } },
  ])
    assert.equal(decodeOwnerSetupState({ ...native, ...patch }, subject), null);
  for (const raw of [
    { subject, status: "ready", designation: null },
    { subject, status: "ready", designation, intent },
    { subject, status: "consented", designation },
  ])
    assert.equal(decodeOwnerSetupState(raw, subject), null);
  assert.deepEqual(validateOwnerSetupConsent(setupForm({ subject, designation, confirm: "yes" })), {
    subject,
    designation,
  });
  assert.deepEqual(validateOwnerSetupVerification(setupForm({ subject, code: "123456" })), {
    subject,
    code: "123456",
  });
  for (const fields of [
    { subject, designation, confirm: "no" },
    { subject, designation, confirm: "yes", role: "owner" },
    { subject: subject + "\n", designation, confirm: "yes" },
  ])
    assert.equal(validateOwnerSetupConsent(setupForm(fields)), null);
  for (const fields of [
    { subject, code: "123456\n" },
    { subject, code: "123456", factor_id: intentId },
    { subject, code: "１２３４５６" },
  ])
    assert.equal(validateOwnerSetupVerification(setupForm(fields)), null);
  const repeated = setupForm({ subject, designation, confirm: "yes" });
  repeated.append("subject", subject);
  assert.equal(validateOwnerSetupConsent(repeated), null);
  const bookkeeping = setupForm({ subject, designation, confirm: "yes" });
  bookkeeping.append("$ACTION_ID_fixture", "framework");
  assert.deepEqual(validateOwnerSetupConsent(bookkeeping), { subject, designation });
});
