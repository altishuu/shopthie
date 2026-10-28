export type BackendEnvironment = Readonly<{
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NODE_ENV?: string;
}>;

export type BackendConfiguration =
  | { status: "unconfigured"; issue: "missing_configuration"; publicSignupEnabled: false }
  | {
      status: "invalid";
      issue: "incomplete_configuration" | "invalid_url" | "invalid_publishable_key";
      publicSignupEnabled: false;
    }
  | { status: "configured"; url: string; publishableKey: string; publicSignupEnabled: false };

/** Configuration is not a connectivity check or authorization proof. Never echo invalid values. */
export function readBackendConfig(env: BackendEnvironment): BackendConfiguration {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const blocked = { publicSignupEnabled: false as const };
  if (!url && !publishableKey)
    return { status: "unconfigured", issue: "missing_configuration", ...blocked };
  if (!url || !publishableKey)
    return { status: "invalid", issue: "incomplete_configuration", ...blocked };
  try {
    const parsed = new URL(url);
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    const localHttp =
      parsed.protocol === "http:" && local && ["development", "test"].includes(env.NODE_ENV ?? "");
    if (
      url !== url.trim() ||
      (parsed.protocol !== "https:" && !localHttp) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      return { status: "invalid", issue: "invalid_url", ...blocked };
  } catch {
    return { status: "invalid", issue: "invalid_url", ...blocked };
  }
  // Modern publishable keys only; no legacy/service JWT classification from an unverified payload.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    return { status: "invalid", issue: "invalid_publishable_key", ...blocked };
  }
  // Email delivery and teen eligibility are unresolved; no env switch may silently open signup.
  return { status: "configured", url, publishableKey, ...blocked };
}
