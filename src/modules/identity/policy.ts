import type { IdentityState, ProviderUser, VerifiedIdentityClaims } from "./types.ts";
import { hasVerifiedTotpFactor } from "./mfa/factors.ts";

/** Never redirect to a supplied origin, encoded path, query or fragment after login. */
export function safeAccountReturnPath(value: unknown): string {
  return typeof value === "string" && /^\/account(?:\/[a-z0-9-]+)*$/.test(value)
    ? value
    : "/account";
}

export type LoginInput =
  { valid: false } | { valid: true; email: string; password: string; next: string };

/** Internal transport only: never return the password in action/UI state or logs. */
export function validateLoginInput(form: FormData): LoginInput {
  const email = form.get("email");
  const password = form.get("password");
  if (
    form.getAll("email").length !== 1 ||
    form.getAll("password").length !== 1 ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    email !== email.trim() ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
    password.length < 1 ||
    password.length > 4096
  )
    return { valid: false };
  return { valid: true, email, password, next: safeAccountReturnPath(form.get("next")) };
}

/** Inputs must come from verified SDK claims/getUser and the current actor RPC, never request data. */
export function identityFromVerifiedData(
  user: ProviderUser,
  claims: VerifiedIdentityClaims,
  rows: unknown,
): IdentityState {
  const unavailable = {
    status: "unavailable",
    message: "Account access is temporarily unavailable. Please try again.",
  } as const;
  if (
    user.id !== claims.sub ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.sub) ||
    user.is_anonymous === true
  )
    return { status: "guest" };
  if (!user.email || !user.email_confirmed_at) return { status: "unverified" };
  if (!Array.isArray(rows)) return unavailable;
  if (rows.length === 0) return { status: "unprovisioned" };
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== "object" || Array.isArray(rows[0]))
    return unavailable;
  const { user_id, role, status, aal, mfa_required } = rows[0] as Record<string, unknown>;
  if (
    user_id !== claims.sub ||
    (role !== "owner" && role !== "admin" && role !== "customer") ||
    (status !== "active" && status !== "suspended") ||
    (aal !== "aal1" && aal !== "aal2") ||
    aal !== claims.aal ||
    typeof mfa_required !== "boolean" ||
    (role !== "customer" && !mfa_required)
  )
    return unavailable;
  if (status === "suspended") return { status: "suspended" };
  const hasVerifiedMfa = role === "customer" ? mfa_required : hasVerifiedTotpFactor(user.factors);
  if ((mfa_required && aal !== "aal2") || (role !== "customer" && !hasVerifiedMfa))
    return { status: "mfa_required" };
  return {
    status: "active",
    email: user.email,
    actor: {
      userId: user_id,
      role,
      status,
      aal,
      // Customer enrollment comes from the live RPC; staff also need fresh provider TOTP evidence.
      hasVerifiedMfa,
    },
  };
}

/** An enrolled AAL1 session must reach its challenge even when login supplied a private destination. */
export function accountDestinationAfterLogin(identity: IdentityState, next: unknown): string {
  if (identity.status === "mfa_required") return "/account/security";
  return identity.status === "active" ? safeAccountReturnPath(next) : "/account";
}
