import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
type Tree = { type: unknown; props: Record<string, unknown> };
const logout = async () => {};

// Only session resolution/navigation are fixtures. Render the real server page in place.
function load(relative: string, mocks: Record<string, unknown>) {
  const url = new URL(relative, root);
  assert.ok(existsSync(url), `${relative} must exist`);
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(source, {
    exports,
    require: (id: string) => (id in mocks ? mocks[id] : require(id)),
  });
  return exports as {
    default: () => Tree;
    metadata: { robots: { index: boolean; follow: boolean } };
  };
}
const commonMocks = {
  "@/modules/identity/components/identity-shell": { IdentityShell: "shell" },
  "@/modules/identity/actions": { logoutAction: logout },
  "next/link": { default: "a" },
  "next/navigation": {
    redirect: (url: string) => {
      throw new Error(`redirect:${url}`);
    },
  },
};
function staff(
  state: unknown,
  lookupState: unknown = { status: "unavailable", message: "Unavailable" },
  auditState: unknown = { status: "unavailable", message: "Unavailable" },
) {
  let calls = 0;
  let lookupCalls = 0;
  let auditCalls = 0;
  const route = load("src/app/(staff)/admin/page.tsx", {
    ...commonMocks,
    "@/modules/audit-view/server": {
      getAuditViewPageState: async () => {
        auditCalls++;
        if (auditState instanceof Error) throw auditState;
        return auditState;
      },
    },
    "@/modules/customer-lookup/server": {
      getCustomerLookupPageState: async () => {
        lookupCalls++;
        return lookupState;
      },
    },
    "@/modules/staff/server": {
      getStaffPageState: async () => {
        calls++;
        return state;
      },
    },
  });
  return {
    route,
    calls: () => calls,
    lookupCalls: () => lookupCalls,
    auditCalls: () => auditCalls,
  };
}
async function content(shell: Tree) {
  const boundary = shell.props.children as Tree;
  assert.equal(shell.type, "shell");
  assert.equal(boundary.type, Symbol.for("react.suspense"));
  const child = boundary.props.children as Tree;
  return (child.type as () => Promise<Tree>)();
}
function elements(node: unknown, type: string): Tree[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const tree = node as Tree;
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props.children, type)];
}
function html(tree: Tree): string {
  function renderable(node: unknown): unknown {
    if (Array.isArray(node)) return require("react").Children.toArray(node).map(renderable);
    if (!node || typeof node !== "object" || !("props" in node)) return node;
    const element = node as Tree;
    return require("react").cloneElement(element, {
      ...(element.type === "a" ? { prefetch: undefined } : {}),
      children: renderable(element.props.children),
    });
  }
  return require("react-dom/server").renderToStaticMarkup(renderable(tree));
}

test("ready staff entry shows only the own role, honest tools notice and direct session exits", async () => {
  for (const role of ["owner", "admin"]) {
    const { route } = staff({ status: "ready", entry: { subject: "fixture-self-staff", role } });
    const tree = await content(route.default());
    const rendered = html(tree);
    assert.match(rendered, /Staff entry\./);
    assert.match(rendered, new RegExp(`<dd>${role}</dd>`));
    assert.match(rendered, /Customer application-access controls/);
    assert.match(rendered, /private support and staff-role tools remain unavailable/i);
    assert.doesNotMatch(
      rendered,
      /fixture-self-staff|customer directory|revenue|total orders|audit log/i,
    );
    const links = elements(tree, "a");
    assert.deepEqual(links.map((node) => node.props.href).sort(), [
      "/account",
      "/account/security",
    ]);
    assert.ok(links.every((node) => node.props.prefetch === false));
    const forms = elements(tree, "form");
    assert.equal(forms.length, 1);
    assert.equal(forms[0].props.action, logout);
    assert.equal(elements(forms[0], "button")[0].props.children, "Sign out");
  }
});

test("staff entry checks current lookup readiness only after ready staff and links only ready lookup", async () => {
  for (const status of ["ready", "guest", "mfa_required", "denied", "unavailable"]) {
    const { route, lookupCalls } = staff(
      { status: "ready", entry: { subject: "fixture-self-staff", role: "admin" } },
      { status, subject: "fixture-self-staff", message: "Unavailable" },
    );
    assert.equal(lookupCalls(), 0);
    const tree = await content(route.default());
    assert.equal(lookupCalls(), 1);
    assert.equal(
      elements(tree, "a").some(
        (link) => link.props.href === "/admin/customers" && link.props.prefetch === false,
      ),
      status === "ready",
    );
  }
  for (const status of ["guest", "mfa_required", "denied", "unavailable"]) {
    const { route, lookupCalls } = staff({ status, message: "Unavailable" });
    if (status === "guest" || status === "mfa_required")
      await assert.rejects(content(route.default()), /redirect:/);
    else await content(route.default());
    assert.equal(lookupCalls(), 0);
  }
});

test("staff entry links audit only after current same-subject readiness and safely ignores failures", async () => {
  for (const auditState of [
    { status: "ready", subject: "fixture-self-staff", scope: "own" },
    { status: "ready", subject: "fixture-self-staff", scope: "all" },
    { status: "ready", subject: "different-staff", scope: "all" },
    ...["guest", "mfa_required", "denied", "unavailable"].map((status) => ({
      status,
      message: "RAW PROVIDER SECRET",
    })),
    new Error("RAW PROVIDER SECRET"),
  ]) {
    const loaded = staff(
      { status: "ready", entry: { subject: "fixture-self-staff", role: "admin" } },
      undefined,
      auditState,
    );
    assert.equal(loaded.auditCalls(), 0);
    const tree = await content(loaded.route.default());
    assert.equal(loaded.auditCalls(), 1);
    assert.equal(
      elements(tree, "a").some(
        (link) => link.props.href === "/admin/audit" && link.props.prefetch === false,
      ),
      "status" in auditState &&
        auditState.status === "ready" &&
        "subject" in auditState &&
        auditState.subject === "fixture-self-staff",
    );
    assert.doesNotMatch(html(tree), /RAW PROVIDER SECRET/);
  }
  for (const status of ["guest", "mfa_required", "denied", "unavailable"]) {
    const loaded = staff({ status, message: "Unavailable" });
    try {
      await content(loaded.route.default());
    } catch (error) {
      assert.match(String(error), /redirect:/);
    }
    assert.equal(loaded.auditCalls(), 0);
  }
});

test("staff entry sends MFA-required sessions straight to their own security page", async () => {
  const { route } = staff({ status: "mfa_required" });
  await assert.rejects(content(route.default()), /redirect:\/account\/security/);
});

test("staff entry is noindex and resolves each guest request only inside Suspense", async () => {
  const { route, calls } = staff({ status: "guest" });
  assert.equal(route.metadata.robots.index, false);
  assert.equal(route.metadata.robots.follow, false);
  const shell = route.default();
  assert.equal(calls(), 0, "session work must not run in the static shell");
  await assert.rejects(content(shell), /redirect:\/login/);
  await assert.rejects(content(route.default()), /redirect:\/login/);
  assert.equal(calls(), 2, "do not share session state between requests");
});

test("denied and unavailable staff entry show a safe message and signout without role data", async () => {
  for (const status of ["denied", "unavailable"]) {
    const { route } = staff({ status, message: "Staff access is unavailable." });
    const tree = await content(route.default());
    assert.match(html(tree), /Staff access is unavailable/);
    assert.equal(elements(tree, "dd").length, 0);
    assert.ok(elements(tree, "form").some((form) => form.props.action === logout));
  }
});

test("account navigation links staff entry only for active staff with verified AAL2", async () => {
  for (const [role, aal, hasVerifiedMfa, expected] of [
    ["owner", "aal2", true, true],
    ["admin", "aal2", true, true],
    ["customer", "aal2", true, false],
    ["owner", "aal1", true, false],
    ["owner", "aal2", false, false],
  ]) {
    const route = load("src/app/(account)/account/page.tsx", {
      ...commonMocks,
      "@/modules/identity/server": {
        getIdentity: async () => ({
          status: "active",
          email: "fixture@example.invalid",
          actor: { role, aal, hasVerifiedMfa },
        }),
      },
    });
    const tree = await content(route.default());
    assert.equal(
      elements(tree, "a").some(
        (link) => link.props.href === "/admin" && link.props.prefetch === false,
      ),
      expected,
    );
  }
});
