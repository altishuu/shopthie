import assert from "node:assert/strict";
import test from "node:test";

const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const customer = {
  userId,
  role: "customer" as const,
  status: "active" as const,
  aal: "aal1" as const,
  hasVerifiedMfa: false,
};
const enabled = ["profiles", "geography", "addresses", "staff", "support"];

test("own-profile access is bound to an active account and the actual owner", async () => {
  const { authorize } = await import("../../src/modules/access/permissions.ts");
  const own = { permission: "profile.read_own", resourceOwnerId: userId };
  assert.equal(authorize(customer, own, enabled).allowed, true);
  assert.equal(authorize(customer, { ...own, resourceOwnerId: otherId }, enabled).allowed, false);
  assert.equal(authorize(customer, { permission: own.permission }, enabled).allowed, false);
  assert.equal(authorize({ ...customer, status: "suspended" }, own, enabled).allowed, false);
  assert.equal(authorize(null, own, enabled).allowed, false);
});

test("staff and MFA-enrolled customers cannot bypass the second factor", async () => {
  const { authorize } = await import("../../src/modules/access/permissions.ts");
  const own = { permission: "profile.read_own", resourceOwnerId: userId };
  for (const role of ["owner", "admin"] as const) {
    assert.equal(authorize({ ...customer, role }, own, enabled).allowed, false);
    assert.equal(authorize({ ...customer, role, aal: "aal2" }, own, enabled).allowed, true);
  }
  assert.equal(authorize({ ...customer, hasVerifiedMfa: true }, own, enabled).allowed, false);
  assert.equal(
    authorize({ ...customer, hasVerifiedMfa: true, aal: "aal2" }, own, enabled).allowed,
    true,
  );
  for (const role of ["manager", "cashier", "__proto__", "toString"]) {
    const invalid = { ...customer, role } as unknown as Parameters<typeof authorize>[0];
    assert.equal(authorize(invalid, own, enabled).allowed, false);
  }
});

test("malformed or missing assurance never grants a Customer capability", async () => {
  const { authorize } = await import("../../src/modules/access/permissions.ts");
  for (const aal of [undefined, null, "unexpected"]) {
    const invalid = { ...customer, aal } as unknown as Parameters<typeof authorize>[0];
    assert.equal(
      authorize(invalid, { permission: "profile.read_own", resourceOwnerId: userId }, enabled)
        .allowed,
      false,
    );
  }
});

test("capabilities fail closed when their module is disabled or configuration is invalid", async () => {
  const { authorize } = await import("../../src/modules/access/permissions.ts");
  const own = { permission: "profile.read_own", resourceOwnerId: userId };
  assert.equal(authorize(customer, own).allowed, false);
  assert.equal(authorize(customer, own, ["addresses"]).allowed, false);
  assert.equal(authorize(customer, own, ["profiles"]).allowed, true);
  assert.equal(
    authorize(customer, { ...own, permission: "payments.charge" }, enabled).allowed,
    false,
  );
});

test("staff permissions enforce target scope and audited support obligations", async () => {
  const { authorize } = await import("../../src/modules/access/permissions.ts");
  const owner = { ...customer, role: "owner" as const, aal: "aal2" as const };
  const admin = { ...customer, role: "admin" as const, aal: "aal2" as const };
  assert.equal(authorize(admin, { permission: "customer.lookup" }, enabled).allowed, true);
  assert.equal(authorize(customer, { permission: "customer.lookup" }, enabled).allowed, false);
  const status = {
    permission: "customer.status.manage",
    resourceOwnerId: otherId,
    targetRole: "customer",
  };
  assert.equal(authorize(admin, status, enabled).allowed, true);
  assert.equal(authorize(admin, { ...status, targetRole: "owner" }, enabled).allowed, false);
  assert.equal(authorize(owner, { permission: "customer.status.manage" }, enabled).allowed, false);
  const assignment = {
    permission: "staff.manage",
    resourceOwnerId: otherId,
    targetRole: "customer",
    desiredRole: "admin",
  };
  assert.equal(authorize(owner, assignment, enabled).allowed, true);
  assert.equal(authorize(admin, assignment, enabled).allowed, false);
  assert.equal(authorize(owner, { ...assignment, desiredRole: "owner" }, enabled).allowed, false);
  assert.equal(authorize(owner, { ...assignment, targetRole: "owner" }, enabled).allowed, false);
  assert.equal(
    authorize(owner, { ...assignment, resourceOwnerId: userId }, enabled).allowed,
    false,
  );
  const support = {
    permission: "support.private.read",
    resourceOwnerId: otherId,
    targetRole: "customer",
    supportReason: "profile_help",
  };
  assert.deepEqual(authorize(admin, support, enabled), { allowed: true, requiresAudit: true });
  assert.equal(authorize(admin, { ...support, supportReason: "" }, enabled).allowed, false);
  assert.equal(authorize(admin, { ...support, targetRole: "admin" }, enabled).allowed, false);
  assert.equal(
    authorize(admin, { permission: "audit.read", auditActorId: otherId }, enabled).allowed,
    false,
  );
  assert.equal(
    authorize(admin, { permission: "audit.read", auditActorId: userId }, enabled).allowed,
    true,
  );
  assert.equal(authorize(owner, { permission: "audit.read" }, enabled).allowed, true);
  for (const permission of ["profile.update_own", "address.manage_own"]) {
    assert.equal(
      authorize(customer, { permission, resourceOwnerId: userId }, enabled).allowed,
      true,
    );
    assert.equal(
      authorize(customer, { permission, resourceOwnerId: otherId }, enabled).allowed,
      false,
    );
  }
  for (const permission of ["__proto__", "toString", "roles.write", "payments.charge"]) {
    assert.equal(authorize(owner, { permission }, enabled).allowed, false);
  }
});
