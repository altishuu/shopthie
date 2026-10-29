import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMfaTransport } from "../../src/modules/identity/mfa/adapter.ts";
const subject = "11111111-1111-4111-8111-111111111111";

test("MFA adapter verifies claims/provider/current actor and never uses editable metadata authority", async () => {
  const calls: string[] = [];
  const client = {
    auth: {
      getClaims: async () => {
        calls.push("claims");
        return { data: { claims: { sub: subject, aal: "aal1" } }, error: null };
      },
      getUser: async () => {
        calls.push("user");
        return {
          data: {
            user: {
              id: subject,
              email: "synthetic@example.invalid",
              email_confirmed_at: "2026-10-29",
              user_metadata: { role: "owner" },
            },
          },
          error: null,
        };
      },
      mfa: {
        listFactors: async () => {
          calls.push("factors");
          return { data: { all: [] }, error: null };
        },
      },
    },
    rpc: async (name: string) => {
      assert.equal(name, "shopthie_actor_context");
      calls.push("actor");
      return {
        data: [
          {
            user_id: subject,
            role: "customer",
            status: "active",
            aal: "aal1",
            mfa_required: false,
          },
        ],
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  assert.deepEqual(await createMfaTransport(client).readContext(), {
    status: "ready",
    subject,
    role: "customer",
    aal: "aal1",
    factors: [],
    otherVerifiedFactor: false,
  });
  assert.deepEqual(calls, ["claims", "user", "factors", "actor"]);
});
