import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditTransport } from "./service.ts";
export function createAuditTransport(
  client: Pick<SupabaseClient, "rpc">,
  identity: AuditTransport["identity"],
): AuditTransport {
  return {
    identity,
    async ready() {
      const { data, error } = await client.rpc("shopthie_audit_view_ready");
      return { data, error };
    },
    async read(before) {
      const { data, error } = await client.rpc("shopthie_audit_events", {
        p_before_time: before?.createdAt ?? null,
        p_before_id: before?.id ?? null,
      });
      return { data, error };
    },
  };
}
