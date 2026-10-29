import { identityFromVerifiedData } from "../policy.ts";
import type { ProviderUser, VerifiedIdentityClaims } from "../types.ts";
import type { MfaContext, MfaEnrollment, MfaFactor, MfaInput, MfaPageState } from "./types.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = {
  status: "unavailable",
  message: "Security settings are temporarily unavailable. Reload before trying again.",
} as const;

/** Verified identity policy is reused without weakening ordinary account/data guards. */
export function decodeMfaContext(
  user: ProviderUser,
  claims: VerifiedIdentityClaims,
  rows: unknown,
  providerFactors: unknown,
): MfaPageState {
  const identity = identityFromVerifiedData(user, claims, rows);
  if (identity.status === "guest") return identity;
  if (identity.status === "unavailable") return unavailable;
  if (identity.status !== "active" && identity.status !== "mfa_required")
    return { status: "denied", message: "Security access is unavailable for this account." };
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== "object")
    return unavailable;
  const { role, mfa_required } = rows[0] as Record<string, unknown>;
  if (
    (role !== "customer" && role !== "owner" && role !== "admin") ||
    (claims.aal !== "aal1" && claims.aal !== "aal2")
  )
    return unavailable;
  if (!Array.isArray(providerFactors) || providerFactors.length > 64) return unavailable;
  const factors: MfaFactor[] = [];
  const ids = new Set<string>();
  let otherVerifiedFactor = false;
  let anyVerifiedFactor = false;
  for (const raw of providerFactors) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return unavailable;
    const factor = raw as Record<string, unknown>;
    if (
      typeof factor.id !== "string" ||
      !uuid.test(factor.id) ||
      ids.has(factor.id) ||
      (factor.status !== "verified" && factor.status !== "unverified") ||
      typeof factor.factor_type !== "string" ||
      !factor.factor_type.length
    )
      return unavailable;
    ids.add(factor.id);
    if (factor.status === "verified") anyVerifiedFactor = true;
    if (factor.factor_type === "totp") factors.push({ id: factor.id, status: factor.status });
    else if (factor.status === "verified") otherVerifiedFactor = true;
  }
  if (mfa_required !== (role !== "customer" || anyVerifiedFactor)) return unavailable;
  return {
    status: "ready",
    subject: user.id,
    role,
    aal: claims.aal,
    factors,
    otherVerifiedFactor,
  } satisfies MfaContext;
}

/** Internal only: never put the returned OTP in action state or a log. */
export function validateMfaInput(form: FormData): MfaInput | null {
  const op = form.get("operation");
  if (op !== "enroll" && op !== "verify" && op !== "remove" && op !== "cancel") return null;
  const keys = [
    "operation",
    "expected_subject",
    ...(op === "enroll" ? ["acknowledge_backup"] : ["factor_id"]),
    ...(op === "verify" || op === "remove" ? ["code"] : []),
    ...(op === "remove" ? ["confirm_remove"] : []),
  ];
  if (
    [...form.keys()].some((key) => !keys.includes(key)) ||
    keys.some((key) => form.getAll(key).length !== 1 || typeof form.get(key) !== "string")
  )
    return null;
  const subject = form.get("expected_subject");
  if (typeof subject !== "string" || !uuid.test(subject)) return null;
  if (op === "enroll")
    return form.get("acknowledge_backup") === "yes" ? { operation: op, subject } : null;
  const factorId = form.get("factor_id");
  if (typeof factorId !== "string" || !uuid.test(factorId)) return null;
  if (op === "cancel") return { operation: op, subject, factorId };
  const code = form.get("code");
  if (
    typeof code !== "string" ||
    code.length !== 6 ||
    !/^[0-9]{6}$/.test(code) ||
    (op === "remove" && form.get("confirm_remove") !== "yes")
  )
    return null;
  return { operation: op, subject, factorId, code };
}

/** Sensitive setup data: explicit action result only, never logs/URLs/shared caches. */
export function decodeMfaEnrollment(value: unknown): MfaEnrollment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.id !== "string" ||
    !uuid.test(data.id) ||
    data.type !== "totp" ||
    !data.totp ||
    typeof data.totp !== "object" ||
    Array.isArray(data.totp)
  )
    return null;
  const totp = data.totp as Record<string, unknown>;
  const prefix = "data:image/svg+xml;utf-8,";
  if (
    typeof totp.secret !== "string" ||
    !/^[A-Z2-7]{16,128}$/.test(totp.secret) ||
    typeof totp.qr_code !== "string" ||
    !totp.qr_code.startsWith(prefix) ||
    totp.qr_code.length > 200000
  )
    return null;
  const svg = totp.qr_code.slice(prefix.length);
  if (!svg.includes("<svg") || !svg.includes("</svg>")) return null;
  return {
    factorId: data.id,
    secret: totp.secret,
    qrCode: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}
