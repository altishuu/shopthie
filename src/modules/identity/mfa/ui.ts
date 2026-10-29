import type { MfaActionResult, MfaContext } from "./types";

type ConfirmedResult = Extract<MfaActionResult, { context: MfaContext }>;

/** A response may replace local security state only when its postcondition is proven. */
export function confirmMfaResult(
  before: MfaContext,
  operation: string,
  factorId: string | null,
  result: unknown,
): result is ConfirmedResult {
  if (!result || typeof result !== "object") return false;
  const candidate = result as ConfirmedResult;
  const context = candidate.context;
  if (
    !context ||
    context.status !== "ready" ||
    context.subject !== before.subject ||
    context.role !== before.role ||
    !["aal1", "aal2"].includes(context.aal) ||
    typeof context.otherVerifiedFactor !== "boolean" ||
    typeof candidate.message !== "string" ||
    !Array.isArray(context.factors) ||
    context.factors.some(
      (factor) =>
        !factor ||
        typeof factor.id !== "string" ||
        !factor.id ||
        !["verified", "unverified"].includes(factor.status),
    ) ||
    new Set(context.factors.map((factor) => factor.id)).size !== context.factors.length
  )
    return false;
  if (operation === "enroll" && candidate.status === "enrollment") {
    const setup = candidate.enrollment;
    return (
      ["customer", "owner", "admin"].includes(before.role) &&
      before.factors.length === 0 &&
      !before.otherVerifiedFactor &&
      !!setup &&
      typeof setup.secret === "string" &&
      setup.secret.length > 0 &&
      typeof setup.qrCode === "string" &&
      /^data:image\/svg\+xml;(?:charset=)?utf-8,/.test(setup.qrCode) &&
      context.factors.length === 1 &&
      !context.otherVerifiedFactor &&
      context.factors.some(
        (factor) => factor.id === setup.factorId && factor.status === "unverified",
      )
    );
  }
  if (candidate.status !== "success") return false;
  const previousFactor = before.factors.find((factor) => factor.id === factorId);
  const currentFactor = context.factors.find((factor) => factor.id === factorId);
  if (operation === "verify") {
    return !!previousFactor && context.aal === "aal2" && currentFactor?.status === "verified";
  }
  if (operation === "cancel")
    return before.role === "customer" && previousFactor?.status === "unverified" && !currentFactor;
  if (operation === "remove") {
    const hasVerified =
      context.otherVerifiedFactor || context.factors.some((factor) => factor.status === "verified");
    return (
      before.role === "customer" &&
      previousFactor?.status === "verified" &&
      !currentFactor &&
      (hasVerified || context.aal === "aal1")
    );
  }
  return false;
}
