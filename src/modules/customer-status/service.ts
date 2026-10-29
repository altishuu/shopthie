import { authorize } from "../access/permissions.ts";
import { resolveBackendModules } from "../registry.ts";
import type { IdentityState } from "../identity/types.ts";
import { decodeStatusRecord, statusSubjectPattern, validateStatusInput } from "./policy.ts";
import type { CustomerStatusPageState, CustomerStatusResult, StatusReason } from "./types.ts";
export type StatusRpcResult = { data: unknown; error: unknown | null };
export type StatusTransport = {
  identity(): Promise<IdentityState>;
  ready(): Promise<StatusRpcResult>;
  read(input: { targetSubject: string; reason: StatusReason }): Promise<StatusRpcResult>;
  change(input: {
    targetSubject: string;
    reason: StatusReason;
    revision: number;
    desiredStatus: "active" | "suspended";
  }): Promise<StatusRpcResult>;
  enabledModules?: readonly string[];
};
const modules = ["profiles", "customer_lookup", "customer_status"] as const;
function eligible(identity: IdentityState, port: StatusTransport): boolean {
  if (
    identity.status !== "active" ||
    !["owner", "admin"].includes(identity.actor.role) ||
    !statusSubjectPattern.test(identity.actor.userId)
  )
    return false;
  try {
    return (
      resolveBackendModules(port.enabledModules ?? modules).includes("customer_status") &&
      authorize(identity.actor, {
        permission: "staff.enter",
        resourceOwnerId: identity.actor.userId,
      }).allowed
    );
  } catch {
    return false;
  }
}
const pageError = (): CustomerStatusPageState => ({
  status: "unavailable",
  message: "Application access controls are temporarily unavailable.",
});
export async function readStatusPage(port: StatusTransport): Promise<CustomerStatusPageState> {
  try {
    const identity = await port.identity();
    if (identity.status === "guest" || identity.status === "mfa_required") return identity;
    if (identity.status === "unavailable") return pageError();
    if (!eligible(identity, port) || identity.status !== "active")
      return {
        status: "denied",
        message: "Application access controls are not available to this account.",
      };
    const result = await port.ready();
    if (result.error !== null) return pageError();
    if (result.data === false)
      return {
        status: "denied",
        message: "Application access controls are not available to this account.",
      };
    if (result.data !== true) return pageError();
    return { status: "ready", subject: identity.actor.userId };
  } catch {
    return pageError();
  }
}
export async function performCustomerStatus(
  port: StatusTransport,
  form: FormData,
  change: boolean,
): Promise<CustomerStatusResult> {
  const failed = (
    message = "The access operation could not be confirmed. Check current access before trying again.",
  ): CustomerStatusResult => ({ status: "error", message, record: null });
  const conflict = (): CustomerStatusResult => ({
    status: "conflict",
    message: "Application access changed. Check current access before trying again.",
    record: null,
  });
  try {
    const input = validateStatusInput(form, change);
    if (!input.valid) return failed("Check the selected account, reason and confirmation.");
    const identity = await port.identity();
    if (!eligible(identity, port) || identity.status !== "active") return failed();
    if (identity.actor.userId !== input.expectedSubject)
      return failed("Your sign-in changed. Reload before continuing.");
    const ready = await port.ready();
    if (ready.error !== null || ready.data !== true) return failed();
    const current = await port.read({ targetSubject: input.targetSubject, reason: input.reason });
    if (current.error !== null) return failed();
    const decoded = decodeStatusRecord(current.data, input.targetSubject);
    if (!decoded.valid) return failed();
    // The native read contract supplies only current Customer records. These facts
    // are server-loaded, not the role/status/revision asserted by the browser.
    const access = authorize(
      identity.actor,
      {
        permission: "customer.status.manage",
        resourceOwnerId: decoded.record.subject,
        targetRole: "customer",
        supportReason: input.reason,
      },
      port.enabledModules ?? modules,
    );
    if (!access.allowed || !access.requiresAudit) return failed();
    if (!change)
      return {
        status: "ready",
        message: "Current application access checked and audited.",
        record: decoded.record,
      };
    if (input.revision === undefined || input.desiredStatus === undefined) return failed();
    if (decoded.record.revision !== input.revision) return conflict();
    if (decoded.record.status === input.desiredStatus)
      return failed(
        "That access state is already current. Check current access before continuing.",
      );
    const result = await port.change({
      targetSubject: input.targetSubject,
      reason: input.reason,
      revision: input.revision,
      desiredStatus: input.desiredStatus,
    });
    if (result.error !== null) {
      const error = result.error as { code?: unknown; message?: unknown };
      return error?.code === "P0001" && error.message === "customer_status_conflict"
        ? conflict()
        : failed();
    }
    const saved = decodeStatusRecord(result.data, input.targetSubject);
    if (
      !saved.valid ||
      saved.record.revision !== input.revision + 1 ||
      saved.record.status !== input.desiredStatus
    )
      return failed();
    return {
      status: "success",
      message:
        "Application access updated and audited. Provider sessions and MFA were not changed.",
      record: saved.record,
    };
  } catch {
    return failed();
  }
}
