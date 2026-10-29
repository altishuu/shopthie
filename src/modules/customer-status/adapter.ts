import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityState } from "../identity/types.ts";
import type { StatusTransport } from "./service.ts";
/** User-scoped request client. Audited read/change only, no raw table access. */
export function createStatusTransport(
  client: SupabaseClient,
  identity: () => Promise<IdentityState>,
): StatusTransport {
  return {
    identity,
    ready: async () => client.rpc("shopthie_customer_status_ready"),
    read: async ({ targetSubject, reason }) =>
      client.rpc("shopthie_customer_status_read", { p_target: targetSubject, p_reason: reason }),
    change: async ({ targetSubject, reason, desiredStatus, revision }) =>
      client.rpc("shopthie_customer_status_change", {
        p_target: targetSubject,
        p_status: desiredStatus,
        p_revision: revision,
        p_reason: reason,
      }),
  };
}
