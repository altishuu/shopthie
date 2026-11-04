import { authorize, rolePermissions } from "../access/permissions.ts";
import { resolveBackendModules } from "../registry.ts";
import type { IdentityState } from "../identity/types.ts";
import {
  decodeProfileSupportRecord,
  profileSupportSubjectPattern,
  validateProfileSupportInput,
} from "./policy.ts";
import type { ProfileSupportPageState, ProfileSupportResult } from "./types.ts";

export type ProfileSupportRpcResult = { data: unknown; error: unknown | null };
export type ProfileSupportTransport = {
  identity(): Promise<IdentityState>;
  ready(): Promise<ProfileSupportRpcResult>;
  read(input: {
    targetSubject: string;
    username: string;
    reason: "profile_help";
  }): Promise<ProfileSupportRpcResult>;
  enabledModules?: readonly string[];
};
const modules = ["profiles", "customer_lookup", "profile_support"] as const;

function eligible(identity: IdentityState, port: ProfileSupportTransport): boolean {
  if (
    identity.status !== "active" ||
    !["owner", "admin"].includes(identity.actor.role) ||
    typeof identity.actor.userId !== "string" ||
    !profileSupportSubjectPattern.test(identity.actor.userId)
  )
    return false;
  return (
    resolveBackendModules(port.enabledModules ?? modules).includes("profile_support") &&
    rolePermissions[identity.actor.role].includes("support.profile.read") &&
    authorize(identity.actor, { permission: "staff.enter", resourceOwnerId: identity.actor.userId })
      .allowed
  );
}
const unavailable = (): ProfileSupportPageState => ({
  status: "unavailable",
  message: "Profile support is temporarily unavailable. Reload before continuing.",
});
const denied = (): ProfileSupportPageState => ({
  status: "denied",
  message: "Profile support is not available to this account.",
});

/** Self-only boolean capability; no target, profile read or audit operation. */
export async function readProfileSupportPage(
  port: ProfileSupportTransport,
): Promise<ProfileSupportPageState> {
  try {
    const identity = await port.identity();
    if (identity.status === "guest") return { status: "guest" };
    if (identity.status === "mfa_required") return { status: "mfa_required" };
    if (identity.status === "unavailable") return unavailable();
    if (!eligible(identity, port) || identity.status !== "active") return denied();
    const result = await port.ready();
    if (result.error !== null) return unavailable();
    if (result.data === false) return denied();
    if (result.data !== true) return unavailable();
    return { status: "ready", subject: identity.actor.userId };
  } catch {
    return unavailable();
  }
}

export async function readProfileSupport(
  port: ProfileSupportTransport,
  form: FormData,
): Promise<ProfileSupportResult> {
  const failed = (
    message = "Profile support could not be confirmed. Run a fresh Customer lookup before continuing.",
  ): ProfileSupportResult => ({ status: "error", message, profile: null });
  try {
    const input = validateProfileSupportInput(form);
    if (!input.valid)
      return failed("Check the selected Customer, username and profile-help reason.");
    const identity = await port.identity();
    if (!eligible(identity, port) || identity.status !== "active") return failed();
    if (identity.actor.userId !== input.expectedSubject)
      return failed("Your sign-in changed. Reload before continuing.");
    const ready = await port.ready();
    if (ready.error !== null || ready.data !== true) return failed();
    // No loaded target role is invented from input. The fixed native operation
    // authoritatively checks current Customer/nonself, username binding and grants,
    // and atomically audits this exact disclosure before it can return a profile.
    const result = await port.read({
      targetSubject: input.targetSubject,
      username: input.username,
      reason: input.reason,
    });
    if (result.error !== null) return failed();
    const decoded = decodeProfileSupportRecord(result.data, input.targetSubject, input.username);
    if (!decoded.valid) return failed();
    return {
      status: "ready",
      message: "Profile support read and audited. Phone is Customer-supplied and unverified.",
      profile: decoded.profile,
    };
  } catch {
    return failed();
  }
}
