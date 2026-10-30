import { authorize } from "../access/permissions.ts";
import type { IdentityState } from "../identity/types.ts";
import { decodeAuditPage, validAuditSubject, validateAuditInput } from "./policy.ts";
import type { AuditActionResult, AuditCursor, AuditPageState, AuditScope } from "./types.ts";
export type AuditRpcResult = { data: unknown; error: unknown | null };
export type AuditTransport = {
  identity(): Promise<IdentityState>;
  ready(): Promise<AuditRpcResult>;
  read(before: AuditCursor | null): Promise<AuditRpcResult>;
  enabledModules?: readonly string[];
};
const modules = ["audit_view"] as const;
function scopeFor(identity: IdentityState, port: AuditTransport): AuditScope | null {
  if (
    identity.status !== "active" ||
    !["owner", "admin"].includes(identity.actor.role) ||
    !validAuditSubject(identity.actor.userId)
  )
    return null;
  if (
    !authorize(
      identity.actor,
      { permission: "audit.read", auditActorId: identity.actor.userId },
      port.enabledModules ?? modules,
    ).allowed
  )
    return null;
  return identity.actor.role === "owner" ? "all" : "own";
}
const unavailable = (): AuditPageState => ({
  status: "unavailable",
  message: "Audit history is temporarily unavailable. Reload or sign out before continuing.",
});
export async function readAuditViewPage(port: AuditTransport): Promise<AuditPageState> {
  try {
    const identity = await port.identity();
    if (identity.status === "guest" || identity.status === "mfa_required") return identity;
    if (identity.status === "unavailable") return unavailable();
    const scope = scopeFor(identity, port);
    if (!scope || identity.status !== "active")
      return { status: "denied", message: "Audit history is not available to this account." };
    const result = await port.ready();
    if (result.error !== null) return unavailable();
    if (result.data === false)
      return { status: "denied", message: "Audit history is not available to this account." };
    if (result.data !== true) return unavailable();
    return { status: "ready", subject: identity.actor.userId, scope };
  } catch {
    return unavailable();
  }
}
/** Native RPC chooses actual scope from current membership; no actor filter is sent. */
export async function readAuditEvents(
  port: AuditTransport,
  form: FormData,
): Promise<AuditActionResult> {
  const error = (
    message = "Audit history could not be confirmed. Reload before trying again.",
  ): AuditActionResult => ({ status: "error", message, page: null });
  try {
    const input = validateAuditInput(form);
    if (!input.valid) return error("Check the history request and reload if necessary.");
    const identity = await port.identity();
    const scope = scopeFor(identity, port);
    if (!scope || identity.status !== "active") return error();
    if (identity.actor.userId !== input.expectedSubject)
      return error("Your sign-in changed. Reload before viewing history.");
    const ready = await port.ready();
    if (ready.error !== null || ready.data !== true) return error();
    const result = await port.read(input.before);
    if (result.error !== null) return error();
    const page = decodeAuditPage(result.data, identity.actor.userId, scope, input.before);
    if (!page.valid) return error();
    return {
      status: "ready",
      message: page.page.events.length
        ? "Recorded operational events loaded."
        : "No supported events in this part of history.",
      page: page.page,
    };
  } catch {
    return error();
  }
}
