import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url),
  root = new URL("../../", import.meta.url);
function load(path: string, mocks: Record<string, unknown>) {
  const file = new URL(path, root);
  assert.ok(existsSync(file), path);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => (id in mocks ? mocks[id] : require(id)),
  });
  return exports;
}

test("audit wrappers sanitize client/identity failures and never return a partial page", async () => {
  const adapter = await import("../../src/modules/audit-view/adapter.ts"),
    service = await import("../../src/modules/audit-view/service.ts");
  const marker = "provider-private-value@invalid";
  for (const breakClient of [true, false]) {
    const mocks = {
      "server-only": {},
      "./adapter": adapter,
      "./service": service,
      "@/modules/identity/server": {
        getIdentity: async () => {
          throw new Error(marker);
        },
      },
      "@/platform/supabase/server": {
        createIdentityClient: async () => {
          if (breakClient) throw new Error(marker);
          return {
            rpc: async () => {
              throw new Error("must not read");
            },
          };
        },
      },
    };
    const server = load("src/modules/audit-view/server.ts", mocks),
      actions = load("src/modules/audit-view/actions.ts", mocks);
    assert.equal(actions.checkAuditViewSessionAction.length, 0);
    for (const result of [
      await server.getAuditViewPageState(),
      await actions.checkAuditViewSessionAction(),
      await actions.loadAuditEventsAction(form()),
    ]) {
      assert.equal(JSON.stringify(result).includes(marker), false);
      assert.notEqual((result as { status: string }).status, "ready");
      if ("page" in (result as object)) assert.equal((result as { page: unknown }).page, null);
    }
  }
});

const subject = "00000000-0000-4000-8000-000000000001";
function form() {
  const data = new FormData();
  data.set("expected_subject", subject);
  data.set("cursor_created_at", "");
  data.set("cursor_id", "");
  return data;
}
test("audit server/action wrappers use request-scoped clients; session action accepts no actor and reads no events", async () => {
  const writes: boolean[] = [],
    calls: unknown[] = [];
  const adapter = await import("../../src/modules/audit-view/adapter.ts"),
    service = await import("../../src/modules/audit-view/service.ts");
  const mocks = {
    "server-only": {},
    "./adapter": adapter,
    "./service": service,
    "@/modules/identity/server": {
      getIdentity: async () => ({
        status: "active",
        email: "fixture@example.invalid",
        actor: {
          userId: subject,
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
          rpc: async (name: string, args?: unknown) => {
            calls.push([name, args ?? null]);
            return {
              data: name.endsWith("_ready") ? true : { scope: "own", events: [], nextCursor: null },
              error: null,
            };
          },
        };
      },
    },
  };
  const server = load("src/modules/audit-view/server.ts", mocks),
    actions = load("src/modules/audit-view/actions.ts", mocks);
  for (const state of [
    await server.getAuditViewPageState(),
    await actions.checkAuditViewSessionAction(),
  ])
    assert.deepEqual(JSON.parse(JSON.stringify(state)), { status: "ready", subject, scope: "own" });
  assert.equal(
    ((await actions.loadAuditEventsAction(form())) as { status: string }).status,
    "ready",
  );
  assert.deepEqual(writes, [false, true, true]);
  assert.deepEqual(calls, [
    ["shopthie_audit_view_ready", null],
    ["shopthie_audit_view_ready", null],
    ["shopthie_audit_view_ready", null],
    ["shopthie_audit_events", { p_before_time: null, p_before_id: null }],
  ]);
});
