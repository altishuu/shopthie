import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityState } from "../identity/types.ts";
import type { LookupTransport } from "./service.ts";

/** Request-local user-scoped SDK only. No raw table read or separate audit write. */
export function createLookupTransport(
  client: SupabaseClient,
  identity: () => Promise<IdentityState>,
): LookupTransport {
  return {
    identity,
    ready: async () => client.rpc("shopthie_customer_lookup_ready"),
    lookup: async ({ username, reason }) =>
      client.rpc("shopthie_customer_lookup", {
        p_username: username,
        p_reason: reason,
      }),
  };
}
