import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file: string, mocks: Record<string, unknown>) {
  const url = new URL("../../src/modules/owner-setup/" + file, import.meta.url);
  assert.ok(existsSync(url));
  const code = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => (id in mocks ? mocks[id] : require(id)),
  });
  return exports;
}
test("owner setup wrappers construct request-local clients and expose no operator activation action", async () => {
  const writes: boolean[] = [],
    calls: string[] = [];
  const port = {};
  const state = { status: "unavailable" };
  const action = { status: "error", message: "fixture" };
  const mocks = {
    "server-only": {},
    "@/platform/supabase/server": {
      createIdentityClient: async (write = false) => {
        writes.push(write);
        return {};
      },
    },
    "./adapter": { createOwnerSetupTransport: () => port },
    "./service": {
      readOwnerSetupPage: async (p: unknown) => {
        assert.equal(p, port);
        calls.push("read");
        return state;
      },
      prepareOwnerSetupConsent: async (p: unknown) => {
        assert.equal(p, port);
        calls.push("consent");
        return action;
      },
      verifyOwnerSetupCode: async (p: unknown) => {
        assert.equal(p, port);
        calls.push("verify");
        return action;
      },
      ownerSetupUnavailable: () => state,
    },
  };
  const server = load("server.ts", mocks),
    actions = load("actions.ts", mocks);
  assert.deepEqual(Object.keys(server), ["getOwnerSetupPageState"]);
  assert.deepEqual(Object.keys(actions).sort(), [
    "checkOwnerSetupSessionAction",
    "consentOwnerSetupAction",
    "verifyOwnerSetupMfaAction",
  ]);
  await server.getOwnerSetupPageState();
  await actions.checkOwnerSetupSessionAction({ actor: "ignored" });
  await actions.verifyOwnerSetupMfaAction(new FormData());
  await actions.consentOwnerSetupAction(new FormData());
  assert.deepEqual(writes, [false, true, true, true]);
  assert.deepEqual(calls, ["read", "read", "verify", "consent"]);
});
