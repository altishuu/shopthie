import type { AuthorizationActor } from "../access/permissions.ts";

export type LoginState = { status: "idle" | "error"; message: string };
export type IdentityState =
  | { status: "guest" }
  | { status: "unavailable"; message: string }
  | { status: "unprovisioned" }
  | { status: "unverified" }
  | { status: "suspended" }
  | { status: "mfa_required" }
  | { status: "active"; email: string; actor: AuthorizationActor };

export type ProviderUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  is_anonymous?: boolean;
};
export type VerifiedIdentityClaims = { sub: string; aal?: unknown };
