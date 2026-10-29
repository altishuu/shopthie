import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

// Actual installed SDK + synthetic fetch boundary. No native JWT/database proof.
test("lookup adapter uses only fixed readiness and audited RPC endpoints with bounded parameters", async () => {
  const { createLookupTransport } = await import("../../src/modules/customer-lookup/adapter.ts");
  const requests: { path: string; method: string; body: unknown }[] = [];
  const client = createClient("https://lookup-fixture.invalid", "fixture-public-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push({
          path: url.pathname,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        assert.ok(
          url.pathname === "/rest/v1/rpc/shopthie_customer_lookup_ready" ||
            url.pathname === "/rest/v1/rpc/shopthie_customer_lookup",
        );
        return new Response(JSON.stringify(url.pathname.endsWith("_ready") ? true : null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  const identity = async () => ({ status: "guest" as const });
  const port = createLookupTransport(client, identity);
  assert.equal(port.identity, identity);
  assert.equal((await port.ready()).data, true);
  assert.equal(
    (await port.lookup({ username: "Demo_Customer", reason: "profile_help" })).data,
    null,
  );
  assert.deepEqual(requests, [
    { path: "/rest/v1/rpc/shopthie_customer_lookup_ready", method: "POST", body: {} },
    {
      path: "/rest/v1/rpc/shopthie_customer_lookup",
      method: "POST",
      body: { p_username: "Demo_Customer", p_reason: "profile_help" },
    },
  ]);
});
