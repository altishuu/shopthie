import assert from "node:assert/strict";
import test from "node:test";
import { identityFromVerifiedData } from "../../src/modules/identity/policy.ts";
import { hasVerifiedTotpFactor } from "../../src/modules/identity/mfa/factors.ts";

const subject = "11111111-1111-4111-8111-111111111111";
const factorId = "22222222-2222-4222-8222-222222222222";
const user = {
  id: subject,
  email: "synthetic@example.invalid",
  email_confirmed_at: "2026-10-29T00:00:00Z",
};
const claims = { sub: subject, aal: "aal2" };
const verifiedFactor = { id: factorId, status: "verified", factor_type: "totp" };

test("staff AAL2 requires current verified TOTP evidence, not just an old assurance claim", () => {
  for (const role of ["owner", "admin"] as const) {
    const row = { user_id: subject, role, status: "active", aal: "aal2", mfa_required: true };
    for (const factors of [
      undefined,
      [],
      [{ ...verifiedFactor, status: "unverified" }],
      [{ ...verifiedFactor, factor_type: "phone" }],
      [{ ...verifiedFactor, id: "malformed" }],
    ]) {
      assert.equal(
        identityFromVerifiedData({ ...user, factors }, claims, [row]).status,
        "mfa_required",
      );
    }
    const active = identityFromVerifiedData({ ...user, factors: [verifiedFactor] }, claims, [row]);
    assert.equal(active.status, "active");
    if (active.status === "active") assert.equal(active.actor.hasVerifiedMfa, true);
  }
});

test("mixed factor evidence rejects an empty factor type even beside a verified TOTP", () => {
  const malformed = {
    ...verifiedFactor,
    id: "33333333-3333-4333-8333-333333333333",
    factor_type: "",
  };
  for (const status of ["verified", "unverified"]) {
    for (const factors of [
      [verifiedFactor, { ...malformed, status }],
      [{ ...malformed, status }, verifiedFactor],
    ]) {
      assert.equal(hasVerifiedTotpFactor(factors), false);
      for (const role of ["owner", "admin"] as const) {
        const row = { user_id: subject, role, status: "active", aal: "aal2", mfa_required: true };
        assert.equal(
          identityFromVerifiedData({ ...user, factors }, claims, [row]).status,
          "mfa_required",
        );
      }
    }
  }
});

test("staff entry is a self identity capability with live MFA, not enabled staff tools", async () => {
  const { authorize } = await import("../../src/modules/access/permissions.ts");
  const actor = {
    userId: subject,
    role: "owner" as const,
    status: "active" as const,
    aal: "aal2" as const,
    hasVerifiedMfa: false,
  };
  assert.equal(
    authorize(actor, { permission: "profile.read_own", resourceOwnerId: subject }, ["profiles"])
      .allowed,
    false,
  );
  const verified = { ...actor, hasVerifiedMfa: true };
  assert.equal(
    authorize(verified, { permission: "staff.enter", resourceOwnerId: subject }).allowed,
    true,
  );
  assert.equal(
    authorize(
      { ...verified, role: "admin" },
      { permission: "staff.enter", resourceOwnerId: subject },
    ).allowed,
    true,
  );
  assert.equal(
    authorize(
      { ...verified, role: "customer" },
      { permission: "staff.enter", resourceOwnerId: subject },
    ).allowed,
    false,
  );
  assert.equal(
    authorize(verified, { permission: "staff.enter", resourceOwnerId: factorId }).allowed,
    false,
  );
  assert.equal(authorize(verified, { permission: "customer.lookup" }).allowed, false);
});

test("staff entry reads only current matching minimal self data after trusted identity and capability checks", async () => {
  const { readStaffEntry } = await import("../../src/modules/staff/service.ts");
  let reads = 0;
  const identity = {
    status: "active" as const,
    email: user.email,
    actor: {
      userId: subject,
      role: "owner" as const,
      status: "active" as const,
      aal: "aal2" as const,
      hasVerifiedMfa: true,
    },
  };
  const port = {
    identity: async () => identity,
    read: async () => {
      reads++;
      return [{ user_id: subject, role: "owner" }];
    },
  };
  assert.deepEqual(await readStaffEntry(port), {
    status: "ready",
    entry: { subject, role: "owner" },
  });
  assert.equal(reads, 1);
  const other = await readStaffEntry({
    ...port,
    read: async () => [{ user_id: factorId, role: "owner" }],
  });
  assert.equal(other.status, "unavailable");
  const expanded = await readStaffEntry({
    ...port,
    read: async () => [{ user_id: subject, role: "owner", email: "private" }],
  });
  assert.equal(expanded.status, "unavailable");
});

test("staff service fails closed before data reads for guests, Customers, incomplete MFA and inactive accounts", async () => {
  const { readStaffEntry } = await import("../../src/modules/staff/service.ts");
  const active = {
    status: "active" as const,
    email: user.email,
    actor: {
      userId: subject,
      role: "owner" as const,
      status: "active" as const,
      aal: "aal2" as const,
      hasVerifiedMfa: true,
    },
  };
  for (const identity of [
    { status: "guest" as const },
    { status: "mfa_required" as const },
    { status: "suspended" as const },
    { ...active, actor: { ...active.actor, role: "customer" as const } },
    { ...active, actor: { ...active.actor, aal: "aal1" as const } },
    { ...active, actor: { ...active.actor, hasVerifiedMfa: false } },
  ]) {
    let called = false;
    const result = await readStaffEntry({
      identity: async () => identity,
      read: async () => {
        called = true;
        return [];
      },
    });
    assert.notEqual(result.status, "ready");
    assert.equal(called, false);
  }
});

test("staff grant revocation, malformed responses and backend errors do not fabricate a workspace", async () => {
  const { readStaffEntry } = await import("../../src/modules/staff/service.ts");
  const identity = {
    status: "active" as const,
    email: user.email,
    actor: {
      userId: subject,
      role: "admin" as const,
      status: "active" as const,
      aal: "aal2" as const,
      hasVerifiedMfa: true,
    },
  };
  assert.equal(
    (await readStaffEntry({ identity: async () => identity, read: async () => [] })).status,
    "denied",
  );
  for (const data of [
    null,
    { user_id: subject, role: "admin" },
    [{ user_id: subject, role: "owner" }],
    [
      { user_id: subject, role: "admin" },
      { user_id: subject, role: "admin" },
    ],
  ]) {
    assert.equal(
      (await readStaffEntry({ identity: async () => identity, read: async () => data })).status,
      "unavailable",
    );
  }
  const error = await readStaffEntry({
    identity: async () => identity,
    read: async () => {
      throw new Error("synthetic-private-provider-detail");
    },
  });
  assert.equal(error.status, "unavailable");
  assert.ok(!JSON.stringify(error).includes("synthetic-private-provider-detail"));
});
