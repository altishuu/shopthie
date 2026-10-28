import "server-only";
import { createIdentityClient } from "@/platform/supabase/server";
import { readRequestIdentity } from "./session";
import type { IdentityState } from "./types";

/** No module/global session cache; verified identity + current DB membership on every private read. */
export async function getIdentity(): Promise<IdentityState> {
  try {
    const client = await createIdentityClient();
    return readRequestIdentity({
      verify: async () => {
        const verified = await client.auth.getClaims();
        if (verified.error) {
          if ([400, 401, 403].includes(verified.error.status ?? 0)) return null;
          throw new Error("Identity verification unavailable.");
        }
        const claims = verified.data?.claims;
        if (!claims || typeof claims.sub !== "string") return null;
        // Consult the provider for current email verification; editable JWT metadata is NOT proof.
        const result = await client.auth.getUser();
        if (result.error) {
          if ([400, 401, 403].includes(result.error.status ?? 0)) return null;
          throw new Error("Identity verification unavailable.");
        }
        if (!result.data.user) return null;
        return { user: result.data.user, claims: { sub: claims.sub, aal: claims.aal } };
      },
      actor: async () => {
        const result = await client.rpc("shopthie_actor_context");
        if (result.error) throw new Error("Authority read unavailable.");
        return result.data;
      },
    });
  } catch {
    return {
      status: "unavailable",
      message: "Account access is temporarily unavailable. Please try again.",
    };
  }
}
