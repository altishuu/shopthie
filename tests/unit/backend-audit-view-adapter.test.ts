import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
// Actual installed SDK with synthetic fetch; no native JWT or privileged-read proof.
test("audit transport sends fixed RPCs and exact raw microseconds, never an actor/scope selector", async () => {
  const { createAuditTransport } = await import("../../src/modules/audit-view/adapter.ts");
  const calls: unknown[] = [];
  const client = createClient("https://audit-fixture.invalid", "fixture-public-key", {
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
  const port = createAuditTransport(client, identity);
  assert.equal(port.identity, identity);
  const before = {
    createdAt: "2026-10-29T16:55:55.123456Z",
    id: "00000000-0000-4000-8000-000000000003",
  };
  await port.ready();
  await port.read(null);
  await port.read(before);
  assert.deepEqual(calls, [
    ["/rest/v1/rpc/shopthie_audit_view_ready", {}],
    ["/rest/v1/rpc/shopthie_audit_events", { p_before_time: null, p_before_id: null }],
    [
      "/rest/v1/rpc/shopthie_audit_events",
      { p_before_time: before.createdAt, p_before_id: before.id },
    ],
  ]);
});
