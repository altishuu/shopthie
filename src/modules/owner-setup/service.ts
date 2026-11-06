import type { MfaActionResult, MfaPageState } from "../identity/mfa/types.ts";
import {
  decodeOwnerSetupState,
  validateOwnerSetupConsent,
  validateOwnerSetupVerification,
} from "./policy.ts";
import type { OwnerSetupActionResult, OwnerSetupPageState, OwnerSetupRpcResult } from "./types.ts";

export type OwnerSetupTransport = {
  /** Official verified identity/current factors and actor context, also usable at AAL1. */
  readSession(): Promise<MfaPageState>;
  readState(): Promise<OwnerSetupRpcResult>;
  consent(designation: string): Promise<OwnerSetupRpcResult>;
  verify(subject: string, code: string): Promise<MfaActionResult>;
};
export const ownerSetupUnavailable = (): OwnerSetupPageState => ({
  status: "unavailable",
  message: "Owner setup is unavailable. Reload or contact the project operator.",
});
const failed = (message: string, reloadRequired = false): OwnerSetupActionResult => ({
  status: "error",
  message,
  ...(reloadRequired ? { reloadRequired: true, state: ownerSetupUnavailable() } : {}),
});
export async function readOwnerSetupPage(port: OwnerSetupTransport): Promise<OwnerSetupPageState> {
  try {
    const context = await port.readSession();
    if (context.status === "guest") return { status: "guest" };
    if (context.status !== "ready" || !["customer", "owner"].includes(context.role))
      return ownerSetupUnavailable();
    const result = await port.readState();
    if (!result.ok) return ownerSetupUnavailable();
    const state = decodeOwnerSetupState(result.data, context.subject);
    if (
      !state ||
      (context.role === "owner" && state.status === "ready" && state.phase !== "completed")
    )
      return ownerSetupUnavailable();
    return state;
  } catch {
    return ownerSetupUnavailable();
  }
}
/** Challenges an already enrolled self TOTP only; never enrolls/removes a factor. */
export async function verifyOwnerSetupCode(
  port: OwnerSetupTransport,
  form: FormData,
): Promise<OwnerSetupActionResult> {
  try {
    const before = await readOwnerSetupPage(port);
    if (before.status !== "ready" || !["mfa_required", "ready"].includes(before.phase))
      return failed("Reload Owner setup before verifying an authenticator.", true);
    const input = validateOwnerSetupVerification(form);
    if (!input) return failed("Enter the six-digit code using the current account form.");
    if (input.subject !== before.subject)
      return failed("The signed-in account changed. Reload before continuing.", true);
    const verified = await port.verify(before.subject, input.code);
    if (verified.status !== "success")
      return failed(
        "The authenticator verification could not be confirmed. Check account security before trying again.",
        verified.status === "error" && verified.reloadRequired === true,
      );
    const state = await readOwnerSetupPage(port);
    if (
      state.status !== "ready" ||
      state.subject !== before.subject ||
      state.designation !== before.designation ||
      state.phase !== "ready"
    )
      return failed(
        "Recent authenticator readiness could not be confirmed. Reload before continuing.",
        true,
      );
    return {
      status: "success",
      message:
        "Recent authenticator verification confirmed. Review and explicitly confirm the consent request next.",
      state,
    };
  } catch {
    return failed(
      "Authenticator verification could not be confirmed. Reload before continuing.",
      true,
    );
  }
}
/** Records self consent only. There is intentionally no application promotion transport. */
export async function prepareOwnerSetupConsent(
  port: OwnerSetupTransport,
  form: FormData,
): Promise<OwnerSetupActionResult> {
  try {
    const before = await readOwnerSetupPage(port);
    if (before.status !== "ready" || before.phase !== "ready")
      return failed("Reload Owner setup before requesting consent.", true);
    const input = validateOwnerSetupConsent(form);
    if (!input) return failed("Confirm the Owner setup request using the current form.");
    if (input.subject !== before.subject || input.designation !== before.designation)
      return failed(
        "The signed-in account or designation changed. Reload before continuing.",
        true,
      );
    const response = await port.consent(input.designation);
    if (!response.ok)
      return failed(
        "The consent result could not be confirmed. Reload; do not automatically repeat the request.",
        true,
      );
    const recorded = decodeOwnerSetupState(response.data, before.subject);
    if (
      recorded?.status !== "ready" ||
      recorded.phase !== "consented" ||
      recorded.designation !== before.designation ||
      !recorded.intent
    )
      return failed("The consent result could not be confirmed. Reload before continuing.", true);
    const state = await readOwnerSetupPage(port);
    if (
      state.status !== "ready" ||
      state.subject !== before.subject ||
      !(
        (state.phase === "consented" &&
          state.designation === before.designation &&
          state.intent?.id === recorded.intent.id) ||
        (state.phase === "completed" &&
          (state.designation === before.designation || state.designation === null))
      )
    ) {
      return failed("The account or consent state changed. Reload before continuing.", true);
    }
    return {
      status: "success",
      message:
        "Consent recorded. This does not activate Owner access; separate operator approval is still required.",
      state,
    };
  } catch {
    return failed("The consent result could not be confirmed. Reload before continuing.", true);
  }
}
