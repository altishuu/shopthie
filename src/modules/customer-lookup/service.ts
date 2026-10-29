import { authorize } from "../access/permissions.ts";
import type { IdentityState } from "../identity/types.ts";
import { decodeLookupRecord, validateLookupInput } from "./policy.ts";
import type { LookupActionResult, LookupPageState, LookupReason } from "./types.ts";

export type LookupRpcResult = { data: unknown; error: unknown | null };
export type LookupTransport = {
  identity(): Promise<IdentityState>;
  ready(): Promise<LookupRpcResult>;
  lookup(input: { username: string; reason: LookupReason }): Promise<LookupRpcResult>;
  /** Trusted developer configuration, never taken from a form. SQL rechecks live module state. */
  enabledModules?: readonly string[];
};
const defaultModules = ["profiles", "customer_lookup"] as const;
const unavailable = (): LookupPageState => ({
  status: "unavailable",
  message: "Customer lookup is temporarily unavailable. Reload or sign out before trying again.",
});
const denied = (): LookupPageState => ({
  status: "denied",
  message: "Customer lookup is not available to this account.",
});
function canLookup(identity: IdentityState, port: LookupTransport, reason: LookupReason): boolean {
  if (identity.status !== "active" || !["owner", "admin"].includes(identity.actor.role))
    return false;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(identity.actor.userId))
    return false;
  const decision = authorize(
    identity.actor,
    { permission: "customer.lookup", supportReason: reason },
    port.enabledModules ?? defaultModules,
  );
  return decision.allowed && decision.requiresAudit;
}

/** Self capability only: this readiness request reads no Customer or audit records. */
export async function readCustomerLookupPage(port: LookupTransport): Promise<LookupPageState> {
  try {
    const identity = await port.identity();
    if (identity.status === "guest" || identity.status === "mfa_required") return identity;
    if (identity.status === "unavailable") return unavailable();
    if (!canLookup(identity, port, "account_access") || identity.status !== "active")
      return denied();
    const result = await port.ready();
    if (result.error !== null) return unavailable();
    if (result.data === false) return denied();
    if (result.data !== true) return unavailable();
    return { status: "ready", subject: identity.actor.userId };
  } catch {
    return unavailable();
  }
}

/** The only data transport is the native read+audit RPC; never a raw select then separate log. */
export async function performCustomerLookup(
  port: LookupTransport,
  form: FormData,
): Promise<LookupActionResult> {
  const error = (
    message = "Customer lookup could not be confirmed. Please try again.",
  ): LookupActionResult => ({ status: "error", message, customer: null });
  try {
    const input = validateLookupInput(form);
    if (!input.valid) return error("Enter an exact username and select an approved lookup reason.");
    const identity = await port.identity();
    if (!canLookup(identity, port, input.reason) || identity.status !== "active")
      return error("Customer lookup is not available to this account.");
    if (input.expectedSubject !== identity.actor.userId)
      return error("Your sign-in changed. Reload before looking up an account.");
    const result = await port.lookup({ username: input.username, reason: input.reason });
    if (result.error !== null) return error();
    const decoded = decodeLookupRecord(result.data, input.username);
    if (!decoded.valid || decoded.customer?.subject === identity.actor.userId) return error();
    return decoded.customer
      ? {
          status: "found",
          message: "Customer account found. This lookup was audited.",
          customer: decoded.customer,
        }
      : {
          status: "not_found",
          message: "No matching Customer account. This lookup was audited.",
          customer: null,
        };
  } catch {
    return error();
  }
}
