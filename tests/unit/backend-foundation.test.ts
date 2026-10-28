import assert from "node:assert/strict";
import test from "node:test";

test("backend starts with only its required security modules enabled", async () => {
  const { resolveBackendModules } = await import("../../src/modules/registry.ts");
  assert.deepEqual(resolveBackendModules(), ["identity", "access", "audit"]);
});

test("optional backend features require their declared dependencies", async () => {
  const { resolveBackendModules } = await import("../../src/modules/registry.ts");
  const resolve = resolveBackendModules as (ids?: readonly string[]) => readonly string[];
  assert.throws(() => resolve(["addresses"]), /requires/);
  assert.deepEqual(resolve(["addresses", "profiles", "geography"]), [
    "identity",
    "access",
    "audit",
    "profiles",
    "geography",
    "addresses",
  ]);
  assert.throws(() => resolve(["payments"]), /Unknown backend module/);
});
