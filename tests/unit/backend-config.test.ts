import assert from "node:assert/strict";
import test from "node:test";

test("missing backend configuration keeps the storefront independent and signup closed", async () => {
  const { readBackendConfig } = await import("../../src/platform/config/backend.ts");
  assert.deepEqual(readBackendConfig({}), {
    status: "unconfigured",
    issue: "missing_configuration",
    publicSignupEnabled: false,
  });
});

test("backend configuration rejects insecure URLs and accidental secret keys without echoing them", async () => {
  const { readBackendConfig } = await import("../../src/platform/config/backend.ts");
  const key = "sb_publishable_unit_fixture_not_a_real_key";
  const configured = {
    NEXT_PUBLIC_SUPABASE_URL: "https://unit.example",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  };
  assert.equal(readBackendConfig(configured).status, "configured");
  assert.equal(readBackendConfig(configured).publicSignupEnabled, false);
  for (const url of [
    "http://remote.example",
    "https://user:password@unit.example",
    "https://unit.example/path",
    "https://unit.example?key=secret",
    " https://unit.example",
  ]) {
    assert.equal(
      readBackendConfig({ ...configured, NEXT_PUBLIC_SUPABASE_URL: url }).status,
      "invalid",
    );
  }
  assert.equal(
    readBackendConfig({ NEXT_PUBLIC_SUPABASE_URL: configured.NEXT_PUBLIC_SUPABASE_URL }).status,
    "invalid",
  );
  const leaked = "sb_secret_do_not_echo_this_fixture";
  const result = readBackendConfig({ ...configured, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: leaked });
  assert.equal(result.status, "invalid");
  assert.equal(JSON.stringify(result).includes(leaked), false);
  assert.equal(
    readBackendConfig({
      ...configured,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NODE_ENV: "production",
    }).status,
    "invalid",
  );
  assert.equal(
    readBackendConfig({
      ...configured,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NODE_ENV: "test",
    }).status,
    "configured",
  );
});
