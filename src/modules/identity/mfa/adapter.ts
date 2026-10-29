import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeMfaContext } from "./policy.ts";
import type { MfaProviderResult, MfaTransport } from "./service.ts";
import type { MfaPageState } from "./types.ts";

const unavailable = (): MfaPageState => ({
  status: "unavailable",
  message: "Security settings are temporarily unavailable. Please reload or sign out.",
});
function providerResult(error: { status?: number } | null): MfaProviderResult {
  if (!error) return { ok: true, data: null };
  if (error.status === 429) return { ok: false, reason: "rate_limited" };
  if (error.status && error.status >= 400 && error.status < 500)
    return { ok: false, reason: "rejected" };
  return { ok: false, reason: "uncertain" };
}

/** Only the request-scoped server adapter supplies this client; never instantiate a browser token client. */
export function createMfaTransport(client: SupabaseClient): MfaTransport {
  return {
    readContext: async () => {
      try {
        const verified = await client.auth.getClaims();
        if (verified.error)
          return [400, 401, 403].includes(verified.error.status ?? 0)
            ? { status: "guest" }
            : unavailable();
        const claims = verified.data?.claims;
        if (!claims || typeof claims.sub !== "string") return { status: "guest" };
        const provider = await client.auth.getUser();
        if (provider.error)
          return [400, 401, 403].includes(provider.error.status ?? 0)
            ? { status: "guest" }
            : unavailable();
        if (!provider.data.user) return { status: "guest" };
        const factors = await client.auth.mfa.listFactors();
        if (factors.error || !factors.data) return unavailable();
        const actor = await client.rpc("shopthie_actor_context");
        if (actor.error) return unavailable();
        return decodeMfaContext(
          provider.data.user,
          { sub: claims.sub, aal: claims.aal },
          actor.data,
          factors.data.all,
        );
      } catch {
        return unavailable();
      }
    },
    enroll: async () => {
      const result = await client.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Shopthie",
        friendlyName: "Shopthie authenticator",
      });
      return result.error ? providerResult(result.error) : { ok: true, data: result.data };
    },
    verify: async (factorId, code) => {
      const result = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) return providerResult(result.error);
      // SDK persists HttpOnly-cookie session via the SSR auth event. Never return session/token data.
      return typeof result.data?.access_token === "string" && result.data.access_token.length > 0
        ? { ok: true, data: null }
        : { ok: false, reason: "uncertain" };
    },
    remove: async (factorId) => {
      const result = await client.auth.mfa.unenroll({ factorId });
      return providerResult(result.error);
    },
    refresh: async () => {
      const result = await client.auth.refreshSession();
      if (result.error) return providerResult(result.error);
      return result.data.session ? { ok: true, data: null } : { ok: false, reason: "uncertain" };
    },
  };
}
