import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityState } from "../identity/types.ts";
import type { ProfileSupportTransport } from "./service.ts";

/** Request-local user-scoped SDK only; no raw tables or separate audit write. */
export function createProfileSupportTransport(
  client: SupabaseClient,
  identity: () => Promise<IdentityState>,
): ProfileSupportTransport {
  return {
    identity,
    ready: async () => client.rpc("shopthie_profile_support_ready"),
    read: async ({ targetSubject, username, reason }) =>
      client.rpc("shopthie_profile_support_read", {
        p_target: targetSubject,
        p_username: username,
        p_reason: reason,
      }),
  };
}
