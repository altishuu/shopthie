import assert from "node:assert/strict";
import test from "node:test";
import { decodeMfaContext } from "../../src/modules/identity/mfa/policy.ts";

const subject = "11111111-1111-4111-8111-111111111111";
const user = {
  id: subject,
  email: "synthetic@example.invalid",
  email_confirmed_at: "2026-10-29T00:00:00Z",
};
const claims = { sub: subject, aal: "aal1" };
const row = {
  user_id: subject,
  status: "active",
  role: "customer",
  aal: "aal1",
  mfa_required: false,
};

test("verified active Customer can see only minimal self MFA setup context at AAL1", () => {
  assert.deepEqual(decodeMfaContext(user, claims, [row], []), {
    status: "ready",
    subject,
    role: "customer",
    aal: "aal1",
    factors: [],
    otherVerifiedFactor: false,
  });
});

test("enrolled AAL1 may challenge but ordinary account identity stays MFA-restricted", () => {
  const factor = {
    id: "22222222-2222-4222-8222-222222222222",
    status: "verified",
    factor_type: "totp",
    secret: "never-return-provider-extras",
  };
  assert.deepEqual(decodeMfaContext(user, claims, [{ ...row, mfa_required: true }], [factor]), {
    status: "ready",
    subject,
    role: "customer",
    aal: "aal1",
    factors: [{ id: factor.id, status: "verified" }],
    otherVerifiedFactor: false,
  });
});

test("MFA form parser keeps subject and factor literal and rejects ambiguous/sensitive inputs", async () => {
  const { validateMfaInput } = await import("../../src/modules/identity/mfa/policy.ts");
  const input = new FormData();
  input.set("operation", "remove");
  input.set("expected_subject", subject);
  input.set("factor_id", "22222222-2222-4222-8222-222222222222");
  input.set("code", "012345");
  input.set("confirm_remove", "yes");
  assert.deepEqual(validateMfaInput(input), {
    operation: "remove",
    subject,
    factorId: input.get("factor_id"),
    code: "012345",
  });
  for (const value of ["12345", "1234567", "１２３４５６", "123456\n", " 123456", "abcdef"]) {
    input.set("code", value);
    assert.equal(validateMfaInput(input), null);
  }
  input.set("code", "012345");
  input.append("code", "999999");
  assert.equal(validateMfaInput(input), null);
  input.set("code", "012345");
  input.set("owner_id", subject);
  assert.equal(validateMfaInput(input), null);
  input.delete("owner_id");
  input.delete("confirm_remove");
  assert.equal(validateMfaInput(input), null);
});

test("invalid identity, suspended membership, malformed factors and inconsistent live MFA state fail closed", async () => {
  const { identityFromVerifiedData } = await import("../../src/modules/identity/policy.ts");
  assert.equal(
    identityFromVerifiedData(user, claims, [{ ...row, mfa_required: true }]).status,
    "mfa_required",
  );
  for (const [u, c, r, f] of [
    [{ ...user, id: "33333333-3333-4333-8333-333333333333" }, claims, [row], []],
    [{ ...user, is_anonymous: true }, claims, [row], []],
    [{ ...user, email_confirmed_at: undefined }, claims, [row], []],
    [user, claims, [{ ...row, status: "suspended" }], []],
    [user, { ...claims, aal: undefined }, [row], []],
    [user, claims, [{ ...row, role: "admin", mfa_required: false }], []],
    [user, claims, [row], [{ id: "not-a-factor", status: "verified", factor_type: "totp" }]],
    [user, claims, [row], [{ id: subject, status: "verified", factor_type: "totp" }]],
    [user, claims, [{ ...row, mfa_required: true }], []],
  ] as const)
    assert.notEqual(decodeMfaContext(u, c, r, f).status, "ready");
  const unsupported = decodeMfaContext(
    user,
    claims,
    [{ ...row, mfa_required: true }],
    [{ id: subject, status: "verified", factor_type: "phone", secret: "not-returned" }],
  );
  assert.equal(unsupported.status, "ready");
  if (unsupported.status === "ready") {
    assert.equal(unsupported.otherVerifiedFactor, true);
    assert.deepEqual(unsupported.factors, []);
  }
});

test("enrollment decoder emits only transient setup fields and encodes SVG as image data", async () => {
  const { decodeMfaEnrollment } = await import("../../src/modules/identity/mfa/policy.ts");
  const data = {
    id: subject,
    type: "totp",
    totp: {
      secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
      qr_code:
        'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000"/></svg>',
      uri: "must-not-return",
    },
    access_token: "must-not-return",
  };
  const result = decodeMfaEnrollment(data);
  assert.ok(result);
  assert.equal(result.factorId, subject);
  assert.equal(result.secret, data.totp.secret);
  assert.ok(result.qrCode.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg"));
  assert.ok(!JSON.stringify(result).includes("must-not-return"));
  for (const invalid of [
    null,
    { ...data, id: "broken" },
    { ...data, type: "phone" },
    { ...data, totp: { ...data.totp, secret: "not base32" } },
    { ...data, totp: { ...data.totp, qr_code: "https://example.invalid/tracker" } },
  ])
    assert.equal(decodeMfaEnrollment(invalid), null);
});

test("UUID and setup-key formats do not accept a final newline", async () => {
  const { validateMfaInput, decodeMfaEnrollment } =
    await import("../../src/modules/identity/mfa/policy.ts");
  const f = new FormData();
  f.set("operation", "enroll");
  f.set("expected_subject", subject + "\n");
  f.set("acknowledge_backup", "yes");
  assert.equal(validateMfaInput(f), null);
  assert.equal(
    decodeMfaEnrollment({
      id: subject,
      type: "totp",
      totp: {
        secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567\n",
        qr_code: "data:image/svg+xml;utf-8,<svg></svg>",
      },
    }),
    null,
  );
});

test("password login cannot skip the MFA challenge with a supplied private return path", async () => {
  const { accountDestinationAfterLogin } = await import("../../src/modules/identity/policy.ts");
  assert.equal(
    accountDestinationAfterLogin({ status: "mfa_required" }, "/account/addresses"),
    "/account/security",
  );
  assert.equal(
    accountDestinationAfterLogin({ status: "suspended" }, "/account/addresses"),
    "/account",
  );
  const active = decodeMfaContext(user, claims, [row], []);
  assert.equal(active.status, "ready");
  const identity = (await import("../../src/modules/identity/policy.ts")).identityFromVerifiedData(
    user,
    claims,
    [row],
  );
  assert.equal(accountDestinationAfterLogin(identity, "/account/addresses"), "/account/addresses");
  assert.equal(accountDestinationAfterLogin(identity, "https://example.invalid"), "/account");
});
