import assert from "node:assert/strict";
import test from "node:test";
import { readBackendConfig } from "../../src/platform/config/backend.ts";

test("auth cookies are HttpOnly, host-only and secure except for an explicit loopback app origin", async () => {
  const { getAuthCookiePolicy } = await import("../../src/platform/supabase/client.ts");
  assert.deepEqual(getAuthCookiePolicy(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  assert.equal(getAuthCookiePolicy("http://127.0.0.1:3100").secure, false);
  assert.equal(getAuthCookiePolicy("https://example.com").secure, true);
  for (const value of [
    "http://example.com",
    "https://user:unit-only@example.com",
    "https://example.com/path",
    "https://example.com?x=1",
    "invalid",
  ]) {
    assert.throws(() => getAuthCookiePolicy(value), { message: "Invalid account app origin." });
  }
});

test("real SDK clients are request-isolated and empty sessions make no network call", async (t) => {
  const fetchSpy = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request in empty-session test.");
  });
  const { createRequestClient } = await import("../../src/platform/supabase/client.ts");
  const config = readBackendConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://unit.example.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit_only_not_a_real_key",
  });
  const store = { getAll: () => [], setAll: () => undefined };
  const first = createRequestClient(config, store);
  const second = createRequestClient(config, store);
  assert.notEqual(first, second);
  const [a, b] = await Promise.all([first.auth.getClaims(), second.auth.getClaims()]);
  assert.equal(a.data, null);
  assert.equal(b.data, null);
  assert.equal(fetchSpy.mock.callCount(), 0);
  assert.throws(() => createRequestClient(readBackendConfig({}), store), {
    message: "Account backend configuration is unavailable.",
  });
});

test("logout cookie cleanup is scoped to Shopthie and cannot delete unrelated application cookies", async () => {
  const { isIdentityCookieName } = await import("../../src/platform/supabase/client.ts");
  for (const name of [
    "shopthie-auth",
    "shopthie-auth.0",
    "shopthie-auth-code-verifier",
    "shopthie-auth-code-verifier.1",
  ])
    assert.equal(isIdentityCookieName(name), true);
  for (const name of [
    "sb-another-project-auth-token",
    "other-session",
    "shopthie-authentication",
    "shopthie-auth.bad",
  ])
    assert.equal(isIdentityCookieName(name), false);
});
