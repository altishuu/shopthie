import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url),
  root = new URL("../../", import.meta.url);
const actor = "00000000-0000-4000-8000-000000000001",
  target = "00000000-0000-4000-8000-000000000002";
function load(path: string, mocks: Record<string, unknown>) {
  const url = new URL(path, root);
  assert.ok(existsSync(url), path);
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
function form(change = false) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    expected_subject: actor,
    target_subject: target,
    reason: "account_security",
    ...(change ? { revision: "0", desired_status: "suspended", confirm_change: "yes" } : {}),
  }))
    data.set(key, value);
  return data;
}
test("status wrappers and restored-session check use fresh identity and writable action clients", async () => {
  const adapter = await import("../../src/modules/customer-status/adapter.ts"),
    service = await import("../../src/modules/customer-status/service.ts");
  const writes: boolean[] = [],
    rpc: string[] = [];
  const mocks = {
    "server-only": {},
    "next/cache": { revalidatePath: () => {} },
    "./adapter": adapter,
    "./service": service,
    "@/modules/identity/server": {
      getIdentity: async () => ({
        status: "active",
        email: "fixture@example.invalid",
        actor: {
          userId: actor,
          role: "admin",
          status: "active",
          aal: "aal2",
          hasVerifiedMfa: true,
        },
      }),
    },
    "@/platform/supabase/server": {
      createIdentityClient: async (write?: boolean) => {
        writes.push(!!write);
        return {
          rpc: async (name: string) => {
            rpc.push(name);
            return {
              data: name.endsWith("_ready")
                ? true
                : {
                    subject: target,
                    status: name.endsWith("_change") ? "suspended" : "active",
                    revision: name.endsWith("_change") ? 1 : 0,
                  },
              error: null,
            };
          },
        };
      },
    },
  };
  const server = load("src/modules/customer-status/server.ts", mocks),
    actions = load("src/modules/customer-status/actions.ts", mocks);
  assert.deepEqual(JSON.parse(JSON.stringify(await server.getCustomerStatusPageState())), {
    status: "ready",
    subject: actor,
  });
  assert.equal(
    ((await actions.loadCustomerStatusAction(form())) as { status: string }).status,
    "ready",
  );
  assert.equal(
    ((await actions.changeCustomerStatusAction(form(true))) as { status: string }).status,
    "success",
  );
  const lookup = load("src/modules/customer-lookup/actions.ts", {
    ...mocks,
    "./adapter": await import("../../src/modules/customer-lookup/adapter.ts"),
    "./service": await import("../../src/modules/customer-lookup/service.ts"),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await lookup.checkCustomerLookupSessionAction())), {
    status: "ready",
    subject: actor,
  });
  assert.deepEqual(writes, [false, true, true, true]);
  assert.deepEqual(rpc, [
    "shopthie_customer_status_ready",
    "shopthie_customer_status_ready",
    "shopthie_customer_status_read",
    "shopthie_customer_status_ready",
    "shopthie_customer_status_read",
    "shopthie_customer_status_change",
    "shopthie_customer_lookup_ready",
  ]);
});
