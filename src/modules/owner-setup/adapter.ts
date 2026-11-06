import type { SupabaseClient } from "@supabase/supabase-js";
import { createMfaTransport } from "../identity/mfa/adapter.ts";
import { performMfaOperation } from "../identity/mfa/service.ts";
import type { OwnerSetupTransport } from "./service.ts";
import type { OwnerSetupRpcResult } from "./types.ts";

export function createOwnerSetupTransport(client: SupabaseClient): OwnerSetupTransport {
  const mfa = createMfaTransport(client);
  const rpc = async (
    name: "shopthie_owner_bootstrap_state" | "shopthie_owner_bootstrap_consent",
    params?: { p_designation: string },
  ): Promise<OwnerSetupRpcResult> => {
    try {
      const result = await client.rpc(name, params);
      return result.error
        ? { ok: false, reason: name.endsWith("consent") ? "uncertain" : "unavailable" }
        : { ok: true, data: result.data };
    } catch {
      return { ok: false, reason: name.endsWith("consent") ? "uncertain" : "unavailable" };
    }
  };
  return {
    readSession: () => mfa.readContext(),
    readState: () => rpc("shopthie_owner_bootstrap_state"),
    consent: (designation) =>
      rpc("shopthie_owner_bootstrap_consent", { p_designation: designation }),
    verify: async (subject, code) => {
      const current = await mfa.readContext();
      if (current.status !== "ready" || current.subject !== subject || current.role !== "customer")
        return {
          status: "error",
          message: "Reload Owner setup before verifying.",
          reloadRequired: true,
        };
      const verified = current.factors.filter((factor) => factor.status === "verified");
      if (verified.length !== 1)
        return {
          status: "error",
          message: "Review your enrolled authenticator in account security.",
          reloadRequired: true,
        };
      const form = new FormData();
      form.set("operation", "verify");
      form.set("expected_subject", subject);
      form.set("factor_id", verified[0].id);
      form.set("code", code);
      return performMfaOperation(mfa, form);
    },
  };
}
