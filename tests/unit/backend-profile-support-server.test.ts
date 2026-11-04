import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const subject = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
const record = { subject: target, username: "Demo_Customer", phone: "+15550000001" };
function load(relative: string, mocks: Record<string, unknown>) {
  const url = new URL(relative, root);
  assert.ok(existsSync(url), `${relative} must exist`);
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  vm.runInNewContext(source, {
    exports,
    require: (id: string) => (id in mocks ? mocks[id] : require(id)),
  });
  return exports;
}
function form() {
  const data = new FormData();
  data.set("expected_subject", subject);
  data.set("target_subject", target);
  data.set("username", "demo_CUSTOMER");
  data.set("reason", "profile_help");
  return data;
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("profile support wrappers create request-local clients and self-only readiness; only explicit load traverses audited read", async () => {
  const adapter = await import("../../src/modules/profile-support/adapter.ts");
  const service = await import("../../src/modules/profile-support/service.ts");
  const writes: boolean[] = [];
  const calls: unknown[] = [];
  let identities = 0;
  const mocks = {
    "server-only": {},
    "./adapter": adapter,
    "./service": service,
    "@/modules/identity/server": {
      getIdentity: async () => {
        identities++;
        return {
          status: "active",
          email: "fixture@example.invalid",
          actor: {
            userId: subject,
            role: "admin",
            status: "active",
            aal: "aal2",
            hasVerifiedMfa: true,
          },
        };
      },
    },
    "@/platform/supabase/server": {
      createIdentityClient: async (write?: boolean) => {
        writes.push(Boolean(write));
        const request = writes.length;
        return {
          rpc: async (name: string, params: unknown) => {
            calls.push([request, name, params]);
            return { data: name.endsWith("_ready") ? true : record, error: null };
          },
        };
      },
    },
  };
  const server = load("src/modules/profile-support/server.ts", mocks);
  const actions = load("src/modules/profile-support/actions.ts", mocks);
  assert.deepEqual(Object.keys(server), ["getProfileSupportPageState"]);
  assert.deepEqual(Object.keys(actions).sort(), [
    "checkProfileSupportSessionAction",
    "loadProfileSupportAction",
  ]);
  assert.equal(server.getProfileSupportPageState.length, 0);
  assert.equal(actions.checkProfileSupportSessionAction.length, 0);
  assert.equal(actions.loadProfileSupportAction.length, 1);
  assert.deepEqual(plain(await server.getProfileSupportPageState()), { status: "ready", subject });
  // Extra JS arguments cannot select an actor/target or cause a data read.
  assert.deepEqual(
    plain(
      await actions.checkProfileSupportSessionAction({ actor: target, target_subject: target }),
    ),
    { status: "ready", subject },
  );
  assert.deepEqual(calls, [
    [1, "shopthie_profile_support_ready", undefined],
    [2, "shopthie_profile_support_ready", undefined],
  ]);
  const result = (await actions.loadProfileSupportAction(form())) as {
    status: string;
    profile: unknown;
  };
  assert.equal(result.status, "ready");
  assert.deepEqual(result.profile, record);
  assert.deepEqual(writes, [false, true, true]);
  assert.equal(identities, 3);
  assert.deepEqual(calls, [
    [1, "shopthie_profile_support_ready", undefined],
    [2, "shopthie_profile_support_ready", undefined],
    [3, "shopthie_profile_support_ready", undefined],
    [
      3,
      "shopthie_profile_support_read",
      { p_target: target, p_username: "demo_CUSTOMER", p_reason: "profile_help" },
    ],
  ]);
});

test("profile support wrappers sanitize construction failures, returning no data or raw provider diagnostics", async () => {
  const mocks = {
    "server-only": {},
    "./adapter": {},
    "./service": {},
    "@/modules/identity/server": {},
    "@/platform/supabase/server": {
      createIdentityClient: async () => {
        throw Error("PRIVATE_PROVIDER_DETAILS");
      },
    },
  };
  const server = load("src/modules/profile-support/server.ts", mocks);
  const actions = load("src/modules/profile-support/actions.ts", mocks);
  const page = (await server.getProfileSupportPageState()) as { status: string };
  const check = (await actions.checkProfileSupportSessionAction()) as { status: string };
  const result = (await actions.loadProfileSupportAction(form())) as {
    status: string;
    profile: unknown;
  };
  assert.equal(page.status, "unavailable");
  assert.equal(check.status, "unavailable");
  assert.equal(result.status, "error");
  assert.equal(result.profile, null);
  assert.doesNotMatch(
    JSON.stringify([page, check, result]),
    /PRIVATE_PROVIDER_DETAILS|15550000001/,
  );
});
