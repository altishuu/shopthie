import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

// Installed SDK, synthetic fetch transport; not native JWT or status-write proof.
test("status adapter calls only fixed readiness/read/change RPCs and never sends an actor selector", async () => {
  const { createStatusTransport } = await import("../../src/modules/customer-status/adapter.ts");
  const calls: unknown[] = [];
  const client = createClient("https://status-fixture.invalid", "fixture-public-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (url, init) => {
        calls.push([new URL(String(url)).pathname, JSON.parse(String(init?.body ?? "{}"))]);
        return new Response("null", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  const identity = async () => ({ status: "guest" as const });
  const port = createStatusTransport(client, identity);
  assert.equal(port.identity, identity);
  const targetSubject = "00000000-0000-4000-8000-000000000002";
  await port.ready();
  await port.read({ targetSubject, reason: "account_review" });
  await port.change({
    targetSubject,
    reason: "account_security",
    desiredStatus: "suspended",
    revision: 0,
  });
  assert.deepEqual(calls, [
    ["/rest/v1/rpc/shopthie_customer_status_ready", {}],
    [
      "/rest/v1/rpc/shopthie_customer_status_read",
      { p_target: targetSubject, p_reason: "account_review" },
    ],
    [
      "/rest/v1/rpc/shopthie_customer_status_change",
      {
        p_target: targetSubject,
        p_status: "suspended",
        p_revision: 0,
        p_reason: "account_security",
      },
    ],
  ]);
});
