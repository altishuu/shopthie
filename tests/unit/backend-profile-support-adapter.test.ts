import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  readProfileSupport,
  readProfileSupportPage,
} from "../../src/modules/profile-support/service.ts";

const subject = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
const identity = async () => ({
  status: "active" as const,
  email: "fixture@example.invalid",
  actor: {
    userId: subject,
    role: "admin" as const,
    status: "active" as const,
    aal: "aal2" as const,
    hasVerifiedMfa: true,
  },
});
const profile = { subject: target, username: "Demo_Customer", phone: "+15550000001" };
function form() {
  const data = new FormData();
  data.set("expected_subject", subject);
  data.set("target_subject", target);
  data.set("username", "demo_CUSTOMER");
  data.set("reason", "profile_help");
  return data;
}

// Actual installed SDK + synthetic fetch. Not a native JWT/DB or privileged-read acceptance test.
test("profile support installed SDK traverses fixed self-readiness and atomic read RPCs with exactly three unnormalized parameters", async () => {
  assert.ok(
    existsSync(new URL("../../src/modules/profile-support/adapter.ts", import.meta.url)),
    "profile-support SDK adapter must exist",
  );
  const { createProfileSupportTransport } =
    await import("../../src/modules/profile-support/adapter.ts");
  const requests: { path: string; method: string; body: unknown }[] = [];
  const client = createClient("https://profile-support-fixture.invalid", "fixture-public-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname;
        requests.push({
          path,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        assert.ok(
          path === "/rest/v1/rpc/shopthie_profile_support_ready" ||
            path === "/rest/v1/rpc/shopthie_profile_support_read",
        );
        return new Response(JSON.stringify(path.endsWith("_ready") ? true : profile), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  const port = createProfileSupportTransport(client, identity);
  assert.equal(port.identity, identity);
  assert.deepEqual(await readProfileSupportPage(port), { status: "ready", subject });
  assert.deepEqual(requests, [
    { path: "/rest/v1/rpc/shopthie_profile_support_ready", method: "POST", body: {} },
  ]);
  assert.deepEqual((await readProfileSupport(port, form())).profile, profile);
  assert.deepEqual(requests, [
    { path: "/rest/v1/rpc/shopthie_profile_support_ready", method: "POST", body: {} },
    { path: "/rest/v1/rpc/shopthie_profile_support_ready", method: "POST", body: {} },
    {
      path: "/rest/v1/rpc/shopthie_profile_support_read",
      method: "POST",
      body: { p_target: target, p_username: "demo_CUSTOMER", p_reason: "profile_help" },
    },
  ]);
});

test("profile support SDK denials, malformed projections, and provider/network failures disclose no profile or raw errors", async () => {
  const { createProfileSupportTransport } =
    await import("../../src/modules/profile-support/adapter.ts");
  for (const scenario of [
    "denied",
    "expanded_ready",
    "ready_error",
    "read_error",
    "network",
    "expanded_profile",
    "renamed",
    "wrong_subject",
  ]) {
    const requests: string[] = [];
    const client = createClient("https://profile-support-fixture.invalid", "fixture-public-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input) => {
          const path = new URL(String(input)).pathname;
          requests.push(path);
          const ready = path.endsWith("_ready");
          if (scenario === "network" && !ready) throw Error("PRIVATE_NETWORK_DETAILS");
          const error =
            (scenario === "ready_error" && ready) || (scenario === "read_error" && !ready);
          const data = error
            ? { code: "42501", message: "PRIVATE_PROVIDER_DETAILS", details: profile }
            : ready
              ? scenario === "denied"
                ? false
                : scenario === "expanded_ready"
                  ? { ready: true, ...profile }
                  : true
              : scenario === "expanded_profile"
                ? { ...profile, email: "PRIVATE_EMAIL" }
                : scenario === "renamed"
                  ? { ...profile, username: "Renamed_Customer" }
                  : scenario === "wrong_subject"
                    ? { ...profile, subject }
                    : profile;
          return new Response(JSON.stringify(data), {
            status: error ? 403 : 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
    const result = await readProfileSupport(
      createProfileSupportTransport(client, identity),
      form(),
    );
    assert.equal(result.status, "error", scenario);
    assert.equal(result.profile, null);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|15550000001/);
    assert.deepEqual(
      requests,
      scenario === "denied" || scenario === "expanded_ready" || scenario === "ready_error"
        ? ["/rest/v1/rpc/shopthie_profile_support_ready"]
        : [
            "/rest/v1/rpc/shopthie_profile_support_ready",
            "/rest/v1/rpc/shopthie_profile_support_read",
          ],
    );
  }
});
