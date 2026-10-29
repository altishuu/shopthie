import assert from "node:assert/strict";
import test from "node:test";

test("post-login destinations stay inside known account paths", async () => {
  const { safeAccountReturnPath } = await import("../../src/modules/identity/policy.ts");
  assert.equal(safeAccountReturnPath("/account/security"), "/account/security");
  for (const value of [
    undefined,
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/account?next=//evil.invalid",
    "/account/%2f%2fevil.invalid",
    " /account",
    "/admin",
  ]) {
    assert.equal(safeAccountReturnPath(value), "/account");
  }
});

test("login validation rejects malformed input without repairing identifiers or returning them in errors", async () => {
  const { validateLoginInput } = await import("../../src/modules/identity/policy.ts");
  const form = new FormData();
  form.set("email", "test@example.invalid");
  form.set("password", "unit-only-not-a-real-password");
  form.set("next", "//evil.invalid");
  const valid = validateLoginInput(form);
  assert.equal(valid.valid, true);
  if (valid.valid) assert.equal(valid.next, "/account");
  form.set("email", " test@example.invalid");
  assert.deepEqual(validateLoginInput(form), { valid: false });
  form.set("email", "test@example.invalid");
  form.append("password", "second-value");
  assert.deepEqual(validateLoginInput(form), { valid: false });
});

const subject = "11111111-1111-4111-8111-111111111111";
const providerUser = {
  id: subject,
  email: "unit@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  is_anonymous: false,
};
const claims = {
  sub: subject,
  aal: "aal1",
  user_metadata: { role: "owner" },
  app_metadata: { role: "owner" },
};
const row = {
  user_id: subject,
  role: "customer",
  status: "active",
  aal: "aal1",
  mfa_required: false,
};

test("verified-input resolver uses current DB authority, never editable role claims", async () => {
  const { identityFromVerifiedData } = await import("../../src/modules/identity/policy.ts");
  const result = identityFromVerifiedData(providerUser, claims, [row]);
  assert.equal(result.status, "active");
  if (result.status === "active") {
    assert.equal(result.actor.role, "customer");
    assert.equal(result.actor.userId, subject);
    assert.equal(result.email, providerUser.email);
  }
});

test("verified-input resolver refuses mismatched, missing and malformed authority", async () => {
  const { identityFromVerifiedData: resolve } =
    await import("../../src/modules/identity/policy.ts");
  assert.equal(resolve(providerUser, claims, []).status, "unprovisioned");
  assert.equal(
    resolve(providerUser, claims, [{ ...row, user_id: "22222222-2222-4222-8222-222222222222" }])
      .status,
    "unavailable",
  );
  for (const rows of [
    null,
    row,
    [row, row],
    [{ ...row, role: "root" }],
    [{ ...row, status: "pending" }],
    [{ ...row, mfa_required: "false" }],
    [{ ...row, aal: "aal2" }],
  ]) {
    assert.equal(resolve(providerUser, claims, rows).status, "unavailable");
  }
  assert.equal(resolve(providerUser, { ...claims, aal: undefined }, [row]).status, "unavailable");
  assert.equal(
    resolve({ ...providerUser, id: "different-subject" }, claims, [row]).status,
    "guest",
  );
});

test("verified-input resolver blocks anonymous, unverified and suspended accounts without returning private fields", async () => {
  const { identityFromVerifiedData: resolve } =
    await import("../../src/modules/identity/policy.ts");
  assert.deepEqual(resolve({ ...providerUser, is_anonymous: true }, claims, [row]), {
    status: "guest",
  });
  assert.deepEqual(resolve({ ...providerUser, email_confirmed_at: undefined }, claims, [row]), {
    status: "unverified",
  });
  assert.deepEqual(resolve(providerUser, claims, [{ ...row, status: "suspended" }]), {
    status: "suspended",
  });
});

test("verified-input resolver requires aal2 for staff and MFA-enrolled customers", async () => {
  const { identityFromVerifiedData: resolve } =
    await import("../../src/modules/identity/policy.ts");
  assert.deepEqual(resolve(providerUser, claims, [{ ...row, role: "owner", mfa_required: true }]), {
    status: "mfa_required",
  });
  assert.deepEqual(resolve(providerUser, claims, [{ ...row, mfa_required: true }]), {
    status: "mfa_required",
  });
  assert.equal(
    resolve(providerUser, claims, [{ ...row, role: "owner", mfa_required: false }]).status,
    "unavailable",
  );
  assert.equal(
    resolve(
      { ...providerUser, factors: [{ id: subject, factor_type: "totp", status: "verified" }] },
      { ...claims, aal: "aal2" },
      [{ ...row, aal: "aal2", role: "owner", mfa_required: true }],
    ).status,
    "active",
  );
});
