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

test("request-scoped lookup wrappers use verified identity and cookie-writable client only for actions", async () => {
  const adapter = await import("../../src/modules/customer-lookup/adapter.ts");
  const service = await import("../../src/modules/customer-lookup/service.ts");
  const writes: boolean[] = [];
  const calls: unknown[] = [];
  let identities = 0;
  const record = { subject: target, username: "Demo_Customer", status: "active" };
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
        return {
          rpc: async (name: string, params: unknown) => {
            calls.push([name, params]);
            return { data: name.endsWith("_ready") ? true : record, error: null };
          },
        };
      },
    },
  };
  const server = load("src/modules/customer-lookup/server.ts", mocks);
  const actions = load("src/modules/customer-lookup/actions.ts", mocks);
  assert.deepEqual(JSON.parse(JSON.stringify(await server.getCustomerLookupPageState())), {
    status: "ready",
    subject,
  });
  const data = new FormData();
  data.set("expected_subject", subject);
  data.set("username", "Demo_Customer");
  data.set("reason", "profile_help");
  const result = (await actions.lookupCustomerAction(data)) as {
    status: string;
    customer: unknown;
  };
  assert.equal(result.status, "found");
  assert.deepEqual(result.customer, record);
  assert.deepEqual(writes, [false, true]);
  assert.equal(identities, 2);
  assert.deepEqual(calls, [
    ["shopthie_customer_lookup_ready", undefined],
    ["shopthie_customer_lookup", { p_username: "Demo_Customer", p_reason: "profile_help" }],
  ]);
});

test("lookup wrappers sanitize client-construction failures without a fabricated result", async () => {
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
  const server = load("src/modules/customer-lookup/server.ts", mocks);
  const actions = load("src/modules/customer-lookup/actions.ts", mocks);
  const page = (await server.getCustomerLookupPageState()) as { status: string };
  const result = (await actions.lookupCustomerAction(new FormData())) as {
    status: string;
    customer: unknown;
  };
  assert.equal(page.status, "unavailable");
  assert.equal(result.status, "error");
  assert.equal(result.customer, null);
  assert.doesNotMatch(JSON.stringify([page, result]), /PRIVATE_PROVIDER_DETAILS/);
});
