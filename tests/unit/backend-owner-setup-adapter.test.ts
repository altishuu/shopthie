import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

const subject = "00000000-0000-4000-8000-000000000001";
const designation = "00000000-0000-4000-8000-000000000002";
const factorId = "00000000-0000-4000-8000-000000000003";
// Explicit SDK-shaped boundary fixtures, NOT native JWT/OTP or provider acceptance.
test("owner adapter uses official self MFA and only two narrow consent/read RPCs, never operator functions", async () => {
  assert.ok(existsSync(new URL("../../src/modules/owner-setup/adapter.ts", import.meta.url)));
  const { createOwnerSetupTransport } = await import("../../src/modules/owner-setup/adapter.ts");
  const calls: { name: string; params?: unknown }[] = [];
  const factors = [{ id: factorId, status: "verified", factor_type: "totp" }];
  const client = {
    rpc: async (name: string, params?: unknown) => {
      calls.push({ name, ...(params ? { params } : {}) });
      if (name === "shopthie_actor_context")
        return {
          data: [
            {
              user_id: subject,
              status: "active",
              role: "customer",
              aal: "aal2",
              mfa_required: true,
            },
          ],
          error: null,
        };
      return { data: { subject, status: "ready", designation }, error: null };
    },
    auth: {
      getClaims: async () => ({ data: { claims: { sub: subject, aal: "aal2" } }, error: null }),
      getUser: async () => ({
        data: {
          user: {
            id: subject,
            email: "fixture@example.invalid",
            email_confirmed_at: "2026-01-01T00:00:00Z",
            factors,
          },
        },
        error: null,
      }),
      mfa: {
        listFactors: async () => ({ data: { all: factors }, error: null }),
        challengeAndVerify: async (input: { factorId: string; code: string }) => {
          assert.deepEqual(input, { factorId, code: "123456" });
          calls.push({ name: "self.verify" });
          return { data: { access_token: "TEST_ONLY_NOT_A_TOKEN" }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;
  const port = createOwnerSetupTransport(client);
  assert.equal((await port.readSession()).status, "ready");
  assert.equal((await port.readState()).ok, true);
  assert.equal((await port.consent(designation)).ok, true);
  assert.equal((await port.verify(subject, "123456")).status, "success");
  assert.deepEqual(
    calls.filter((x) => x.name !== "shopthie_actor_context"),
    [
      { name: "shopthie_owner_bootstrap_state" },
      { name: "shopthie_owner_bootstrap_consent", params: { p_designation: designation } },
      { name: "self.verify" },
    ],
  );
});
