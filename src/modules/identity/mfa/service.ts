import { decodeMfaEnrollment, validateMfaInput } from "./policy.ts";
import type { MfaActionResult, MfaContext, MfaPageState } from "./types.ts";

export type MfaProviderResult =
  { ok: true; data: unknown } | { ok: false; reason: "rejected" | "rate_limited" | "uncertain" };
export type MfaTransport = {
  readContext(): Promise<MfaPageState>;
  enroll(): Promise<MfaProviderResult>;
  verify(factorId: string, code: string): Promise<MfaProviderResult>;
  remove(factorId: string): Promise<MfaProviderResult>;
  refresh(): Promise<MfaProviderResult>;
};
const uncertain = (): MfaActionResult => ({
  status: "error",
  message:
    "The security change could not be confirmed. Reload security before trying again, or sign out.",
  reloadRequired: true,
});
function providerFailure(
  result: Extract<MfaProviderResult, { ok: false }>,
  verifying = false,
): MfaActionResult {
  if (result.reason === "rate_limited")
    return { status: "error", message: "Too many attempts. Please wait before trying again." };
  if (result.reason === "rejected" && verifying)
    return {
      status: "error",
      message: "The code could not be verified. Enter a fresh code and try again.",
    };
  return uncertain();
}
function sameActor(before: MfaContext, after: MfaPageState): after is MfaContext {
  return after.status === "ready" && after.subject === before.subject && after.role === before.role;
}

/** Authority is read before any provider mutation; IDs are only self-owned resource IDs. */
export async function performMfaOperation(
  port: MfaTransport,
  form: FormData,
): Promise<MfaActionResult> {
  try {
    const context = await port.readContext();
    if (context.status !== "ready")
      return {
        status: "error",
        message: "Sign in to an active, confirmed account to manage security.",
        reloadRequired: true,
      };
    const input = validateMfaInput(form);
    if (!input)
      return {
        status: "error",
        message: "Check the security form and enter a six-digit authenticator code when required.",
      };
    if (input.subject !== context.subject)
      return {
        status: "error",
        message: "The signed-in account changed. Reload security before continuing.",
        reloadRequired: true,
      };
    if (input.operation === "enroll") {
      if (context.otherVerifiedFactor || context.factors.length !== 0)
        return {
          status: "error",
          message:
            "An authenticator or unfinished setup already exists, or this account cannot enroll here. Reload security to review it.",
          reloadRequired: true,
        };
      const result = await port.enroll();
      if (!result.ok) return providerFailure(result);
      const enrollment = decodeMfaEnrollment(result.data);
      const after = await port.readContext();
      if (
        !enrollment ||
        !sameActor(context, after) ||
        after.otherVerifiedFactor ||
        after.factors.length !== 1 ||
        !after.factors.some(
          (item) => item.id === enrollment.factorId && item.status === "unverified",
        )
      )
        return uncertain();
      return {
        status: "enrollment",
        message: "Scan the QR code with your authenticator, then verify a code to enable MFA.",
        context: after,
        enrollment,
      };
    }
    if (input.operation === "cancel") {
      // Unenroll cannot conditionally delete only pending factors; verification can race this read.
      if (context.role !== "customer")
        return {
          status: "error",
          message:
            "Cancelling or restarting staff authenticator setup is not available here. If setup details are lost, contact the project operator.",
        };
      if (
        !context.factors.some((item) => item.id === input.factorId && item.status === "unverified")
      )
        return uncertain();
      const removed = await port.remove(input.factorId);
      if (!removed.ok) return providerFailure(removed);
      const after = await port.readContext();
      if (!sameActor(context, after) || after.factors.some((item) => item.id === input.factorId))
        return uncertain();
      return {
        status: "success",
        message: "Unfinished authenticator setup cancelled.",
        context: after,
      };
    }
    const factor = context.factors.find((item) => item.id === input.factorId);
    if (
      !factor ||
      (context.role !== "customer" && input.operation === "remove") ||
      (input.operation === "remove" && factor.status !== "verified")
    )
      return uncertain();
    const result = await port.verify(input.factorId, input.code);
    if (!result.ok) return providerFailure(result, true);
    const after = await port.readContext();
    if (
      !sameActor(context, after) ||
      after.aal !== "aal2" ||
      !after.factors.some((item) => item.id === input.factorId && item.status === "verified")
    )
      return uncertain();
    if (input.operation === "remove") {
      const removed = await port.remove(input.factorId);
      if (!removed.ok) return providerFailure(removed);
      const refreshed = await port.refresh();
      if (!refreshed.ok) return uncertain();
      const final = await port.readContext();
      if (
        !sameActor(context, final) ||
        final.factors.some((item) => item.id === input.factorId) ||
        (!final.otherVerifiedFactor &&
          !final.factors.some((item) => item.status === "verified") &&
          final.aal !== "aal1")
      )
        return uncertain();
      return {
        status: "success",
        message: "Authenticator removed. Your current security settings have been refreshed.",
        context: final,
      };
    }
    return { status: "success", message: "Authenticator verification completed.", context: after };
  } catch {
    return uncertain();
  }
}
