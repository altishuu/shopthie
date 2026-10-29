import { resolveBackendModules, type BackendModuleId } from "../registry.ts";

export type ApplicationRole = "owner" | "admin" | "customer";

/** Must come from verified identity + CURRENT database membership, never a request body. */
export type AuthorizationActor = {
  userId: string;
  role: ApplicationRole;
  status: "active" | "suspended" | "pending";
  aal: "aal1" | "aal2";
  hasVerifiedMfa: boolean;
};

type Scope = "self" | "directory" | "customer" | "staff_assignment" | "support" | "audit";
export const permissionDefinitions = {
  "staff.enter": { module: "identity", scope: "self" },
  "profile.read_own": { module: "profiles", scope: "self" },
  "profile.update_own": { module: "profiles", scope: "self" },
  "address.manage_own": { module: "addresses", scope: "self" },
  "customer.lookup": { module: "customer_lookup", scope: "directory" },
  "customer.status.manage": { module: "customer_status", scope: "customer" },
  "support.private.read": { module: "support", scope: "support" },
  "staff.manage": { module: "staff", scope: "staff_assignment" },
  "audit.read": { module: "audit", scope: "audit" },
} as const satisfies Record<string, { module: BackendModuleId; scope: Scope }>;
export type ApplicationPermission = keyof typeof permissionDefinitions;

const ownPermissions = ["profile.read_own", "profile.update_own", "address.manage_own"] as const;
const staffPermissions = [
  ...ownPermissions,
  "staff.enter",
  "customer.lookup",
  "customer.status.manage",
  "support.private.read",
  "audit.read",
] as const;
export const rolePermissions: Readonly<Record<ApplicationRole, readonly ApplicationPermission[]>> =
  Object.freeze({
    customer: Object.freeze([...ownPermissions]),
    admin: Object.freeze([...staffPermissions]),
    owner: Object.freeze([...staffPermissions, "staff.manage"] as ApplicationPermission[]),
  });

export type AccessRequest = {
  permission: string;
  resourceOwnerId?: string;
  /** Target facts must be loaded by the server, not copied from client input. */
  targetRole?: string;
  desiredRole?: string;
  supportReason?: string;
  auditActorId?: string;
};
export type AccessDecision =
  { allowed: true; requiresAudit: boolean } | { allowed: false; reason: string };

/**
 * Early application guard, not a data reader or a JWT verifier.
 * A requiresAudit result MUST be fulfilled by an audited data operation, never raw SELECT.
 * RLS/current DB permissions and target checks still apply at the actual data boundary.
 */
export function authorize(
  actor: AuthorizationActor | null,
  request: AccessRequest,
  enabledOptionalModules: readonly string[] = [],
): AccessDecision {
  if (!actor?.userId) return { allowed: false, reason: "unauthenticated" };
  if (actor.status !== "active") return { allowed: false, reason: "account_inactive" };
  if (!Object.hasOwn(rolePermissions, actor.role))
    return { allowed: false, reason: "unknown_role" };
  if (!["aal1", "aal2"].includes(actor.aal)) {
    return { allowed: false, reason: "invalid_assurance" };
  }
  if (
    (actor.role !== "customer" && actor.hasVerifiedMfa !== true) ||
    ((actor.role !== "customer" || actor.hasVerifiedMfa) && actor.aal !== "aal2")
  ) {
    return { allowed: false, reason: "mfa_required" };
  }
  if (!Object.hasOwn(permissionDefinitions, request.permission)) {
    return { allowed: false, reason: "unknown_permission" };
  }
  const permission = request.permission as ApplicationPermission;
  const definition = permissionDefinitions[permission];
  try {
    if (!resolveBackendModules(enabledOptionalModules).includes(definition.module)) {
      return { allowed: false, reason: "module_disabled" };
    }
  } catch {
    return { allowed: false, reason: "invalid_configuration" };
  }
  if (!rolePermissions[actor.role].includes(permission)) {
    return { allowed: false, reason: "forbidden" };
  }
  switch (definition.scope) {
    case "directory":
      if (!["account_access", "profile_help", "address_help"].includes(request.supportReason ?? ""))
        return { allowed: false, reason: "lookup_reason_required" };
      return { allowed: true, requiresAudit: true };
    case "self":
      if (request.resourceOwnerId !== actor.userId) {
        return { allowed: false, reason: "ownership_required" };
      }
      break;
    case "customer":
    case "support":
      if (
        !request.resourceOwnerId ||
        request.resourceOwnerId === actor.userId ||
        request.targetRole !== "customer"
      ) {
        return { allowed: false, reason: "target_restricted" };
      }
      if (definition.scope === "customer") {
        if (
          !["account_security", "customer_request", "account_review"].includes(
            request.supportReason ?? "",
          )
        )
          return { allowed: false, reason: "status_reason_required" };
        return { allowed: true, requiresAudit: true };
      }
      if (definition.scope === "support") {
        if (
          !["account_access", "profile_help", "address_help"].includes(request.supportReason ?? "")
        ) {
          return { allowed: false, reason: "support_reason_required" };
        }
        return { allowed: true, requiresAudit: true };
      }
      break;
    case "staff_assignment":
      if (
        !request.resourceOwnerId ||
        request.resourceOwnerId === actor.userId ||
        !["customer", "admin"].includes(request.targetRole ?? "") ||
        !["customer", "admin"].includes(request.desiredRole ?? "")
      )
        return { allowed: false, reason: "target_restricted" };
      break;
    case "audit":
      if (actor.role !== "owner" && request.auditActorId !== actor.userId) {
        return { allowed: false, reason: "audit_scope_restricted" };
      }
      break;
    default:
      return { allowed: false, reason: "unsupported_scope" };
  }
  return { allowed: true, requiresAudit: false };
}
