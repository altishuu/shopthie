import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const ready = {
  status: "ready",
  subject: "fixture-customer",
  role: "customer",
  aal: "aal1",
  factors: [],
  otherVerifiedFactor: false,
};

function load(
  relative: string,
  mocks: Record<string, unknown> = {},
  globals: Record<string, unknown> = {},
) {
  const url = new URL(relative, root);
  assert.ok(existsSync(url), `${relative} must exist`);
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(source, {
    exports,
    ...globals,
    require: (id: string) => (id in mocks ? mocks[id] : require(id)),
  });
  return exports as {
    default: () => Tree;
    metadata: { robots: { index: boolean; follow: boolean } };
    SecurityManager: (props: { initialContext: unknown }) => Tree;
    confirmMfaResult: (...args: unknown[]) => boolean;
  };
}

function securityPage(state: unknown) {
  return load("src/app/(account)/account/security/page.tsx", {
    "@/modules/identity/mfa/server": { getMfaPageState: async () => state },
    "@/modules/identity/actions": { logoutAction: async () => {} },
    "@/modules/identity/mfa/components/security-manager": { SecurityManager: () => null },
    "@/modules/identity/components/identity-shell": { IdentityShell: "shell" },
    "next/navigation": {
      redirect: (url: string) => {
        throw new Error(`redirect:${url}`);
      },
    },
    "@/app/security.css": {},
  });
}

function ui() {
  return load("src/modules/identity/mfa/ui.ts");
}

const pendingContext = { ...ready, factors: [{ id: "fixture-factor", status: "unverified" }] };
const enrollmentResult = {
  status: "enrollment",
  message: "Setup ready",
  context: pendingContext,
  enrollment: {
    factorId: "fixture-factor",
    qrCode: "data:image/svg+xml;utf-8,%3Csvg/%3E",
    secret: "synthetic-fixture-only",
  },
};

test("enrollment response is accepted only for the expected subject and pending factor", () => {
  const { confirmMfaResult } = ui();
  assert.equal(confirmMfaResult(ready, "enroll", null, enrollmentResult), true);
  assert.equal(
    confirmMfaResult(ready, "enroll", null, {
      ...enrollmentResult,
      context: { ...pendingContext, subject: "switched-account" },
    }),
    false,
  );
  assert.equal(
    confirmMfaResult(ready, "enroll", null, {
      ...enrollmentResult,
      context: ready,
    }),
    false,
  );
});

test("staff enrollment responses preserve the same subject, factor and private-setup guards", () => {
  const { confirmMfaResult } = ui();
  for (const role of ["owner", "admin"]) {
    const before = { ...ready, role };
    const result = { ...enrollmentResult, context: { ...pendingContext, role } };
    assert.equal(confirmMfaResult(before, "enroll", null, result), true);
    assert.equal(
      confirmMfaResult(before, "enroll", null, {
        ...result,
        context: { ...result.context, subject: "switched-account" },
      }),
      false,
    );
    assert.equal(
      confirmMfaResult(before, "enroll", null, {
        ...result,
        enrollment: { ...result.enrollment, qrCode: "https://example.invalid/qr" },
      }),
      false,
    );
    assert.equal(
      confirmMfaResult({ ...before, otherVerifiedFactor: true }, "enroll", null, result),
      false,
    );
    assert.equal(confirmMfaResult({ ...pendingContext, role }, "enroll", null, result), false);
  }
});

test("server-normalized SVG data images are accepted for private setup delivery", () => {
  const { confirmMfaResult } = ui();
  assert.equal(
    confirmMfaResult(ready, "enroll", null, {
      ...enrollmentResult,
      enrollment: {
        ...enrollmentResult.enrollment,
        qrCode: "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E",
      },
    }),
    true,
  );
});

test("confirmed mutations require fresh AAL and the requested factor postcondition", () => {
  const { confirmMfaResult } = ui();
  const verified = {
    ...ready,
    aal: "aal2",
    factors: [{ id: "fixture-factor", status: "verified" }],
  };
  const success = (context: unknown) => ({ status: "success", message: "Confirmed", context });
  assert.equal(
    confirmMfaResult(pendingContext, "verify", "fixture-factor", success(verified)),
    true,
  );
  assert.equal(
    confirmMfaResult(pendingContext, "verify", "fixture-factor", success(pendingContext)),
    false,
  );
  assert.equal(
    confirmMfaResult(
      pendingContext,
      "verify",
      "fixture-factor",
      success({ ...verified, aal: "aal1" }),
    ),
    false,
  );
  assert.equal(confirmMfaResult(verified, "remove", "fixture-factor", success(ready)), true);
  assert.equal(confirmMfaResult(verified, "remove", "fixture-factor", success(verified)), false);
  assert.equal(
    confirmMfaResult(verified, "remove", "fixture-factor", success({ ...ready, aal: "aal2" })),
    false,
  );
  assert.equal(confirmMfaResult(pendingContext, "cancel", "fixture-factor", success(ready)), true);
  assert.equal(confirmMfaResult(verified, "cancel", "fixture-factor", success(ready)), false);
  assert.equal(confirmMfaResult(ready, "enroll", null, success(ready)), false);
});

test("staff cancellation responses are never accepted as confirmed state changes", () => {
  const { confirmMfaResult } = ui();
  for (const role of ["owner", "admin"]) {
    for (const aal of ["aal1", "aal2"]) {
      const after = { ...ready, role, aal };
      assert.equal(
        confirmMfaResult({ ...pendingContext, role, aal }, "cancel", "fixture-factor", {
          status: "success",
          message: "Cancelled",
          context: after,
        }),
        false,
      );
    }
  }
});

test("untrusted setup or malformed context cannot be shown as a confirmed result", () => {
  const { confirmMfaResult } = ui();
  assert.equal(
    confirmMfaResult(ready, "enroll", null, {
      ...enrollmentResult,
      enrollment: { ...enrollmentResult.enrollment, qrCode: "https://example.invalid/qr" },
    }),
    false,
  );
  assert.equal(
    confirmMfaResult(ready, "enroll", null, {
      ...enrollmentResult,
      context: { ...pendingContext, factors: [null] },
    }),
    false,
  );
  assert.equal(
    confirmMfaResult(ready, "enroll", null, {
      ...enrollmentResult,
      context: { ...pendingContext, role: "admin" },
    }),
    false,
  );
});

type Tree = { type: unknown; props: Record<string, unknown> };
function submit(form: Tree, event: unknown): Promise<void> {
  assert.equal(typeof form.props.onSubmit, "function");
  return (form.props.onSubmit as (event: unknown) => Promise<void>)(event);
}
function content(boundary: Tree): Promise<Tree> {
  const child = boundary.props.children as Tree;
  return (child.type as () => Promise<Tree>)();
}
function elements(node: unknown, type: string): Tree[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const tree = node as Tree;
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props.children, type)];
}

// Only the server action and React hook scheduler are substituted. Real component handlers,
// JSX and response validation run in place; no account/session or provider is contacted.
function mountManager(action: (data: FormData) => Promise<unknown>, context: unknown = ready) {
  const slots: unknown[] = [];
  let cursor = 0;
  class FixtureFormData extends FormData {
    constructor(form: { entries: Record<string, string> }) {
      super();
      for (const [key, value] of Object.entries(form.entries)) this.append(key, value);
    }
  }
  const { SecurityManager } = load(
    "src/modules/identity/mfa/components/security-manager.tsx",
    {
      "../actions": { mfaAction: action },
      "../ui": ui(),
      react: {
        ...require("react"),
        useState: (initial: unknown) => {
          const index = cursor++;
          if (!(index in slots)) slots[index] = initial;
          return [
            slots[index],
            (next: unknown) => {
              slots[index] = next;
            },
          ];
        },
        useRef: (initial: unknown) => {
          const index = cursor++;
          if (!(index in slots)) slots[index] = { current: initial };
          return slots[index];
        },
      },
    },
    { FormData: FixtureFormData },
  );
  return () => {
    cursor = 0;
    return SecurityManager({ initialContext: context }) as Tree;
  };
}

function formEvent(entries: Record<string, string>) {
  const input = { value: entries.code ?? "" };
  return {
    input,
    event: {
      preventDefault() {},
      currentTarget: {
        entries,
        elements: { namedItem: (name: string) => (name === "code" ? input : null) },
      },
    },
  };
}

test("setup submits once, retains QR only locally and renders it as an image", async () => {
  let calls = 0;
  let finish!: (result: unknown) => void;
  const render = mountManager(async (data) => {
    calls++;
    assert.deepEqual([...data.keys()].sort(), [
      "acknowledge_backup",
      "expected_subject",
      "operation",
    ]);
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const form = elements(render(), "form")[0];
  assert.equal(typeof form.props.onSubmit, "function");
  const { event } = formEvent({
    operation: "enroll",
    expected_subject: ready.subject,
    acknowledge_backup: "yes",
  });
  const request = submit(form, event);
  await submit(form, event);
  assert.equal(calls, 1);
  assert.equal(elements(render(), "fieldset")[0].props.disabled, true);
  finish(enrollmentResult);
  await request;
  const result = render();
  const image = elements(result, "img")[0];
  assert.ok(image);
  assert.equal(image.props.alt, "Authenticator setup QR code");
  assert.equal(image.props.src, enrollmentResult.enrollment.qrCode);
  assert.equal(image.props.dangerouslySetInnerHTML, undefined);
  assert.doesNotMatch(renderManager(pendingContext), /<img|synthetic-fixture-only/);
});

test("verification erases the OTP field before the action and uses only confirmed AAL2 state", async () => {
  const verified = { ...ready, factors: [{ id: "fixture-factor", status: "verified" }] };
  const { input, event } = formEvent({
    operation: "verify",
    expected_subject: ready.subject,
    factor_id: "fixture-factor",
    code: "000000",
  });
  let calls = 0;
  const render = mountManager(async (data) => {
    calls++;
    assert.equal(input.value, "");
    assert.equal(data.get("code") === "000000", true);
    assert.equal(data.get("expected_subject"), ready.subject);
    return {
      status: "success",
      message: "Session verified",
      context: { ...verified, aal: "aal2" },
    };
  }, verified);
  const form = elements(render(), "form").find(
    (node) => node.props["aria-label"] === "Verify authenticator 1",
  );
  assert.ok(form, "verified factors need a current-code challenge");
  const code = elements(form, "input").find((node) => node.props.name === "code");
  assert.equal(code?.props.pattern, "[0-9]{6}");
  assert.equal(code?.props.inputMode, "numeric");
  assert.equal(code?.props.autoComplete, "one-time-code");
  await submit(form, event);
  assert.equal(calls, 1);
  const html = require("react-dom/server").renderToStaticMarkup(render());
  assert.match(html, /Session verified/);
  assert.match(html, /Remove authenticator/);
  assert.doesNotMatch(html, /aria-label="Verify authenticator 1"/);
});

test("customer reload permits pending cancellation; staff reload requires operator help without cancel or restart", () => {
  const pending = renderManager(pendingContext);
  assert.match(pending, /cancel.*begin again/i);
  assert.match(pending, /Cancel pending setup/);
  assert.doesNotMatch(pending, /name="code"|Set up authenticator/);
  const staff = renderManager({
    ...ready,
    role: "admin",
    factors: [{ id: "fixture-factor", status: "verified" }],
  });
  assert.match(staff, /Verify authenticator/);
  assert.doesNotMatch(staff, /Set up authenticator|Remove authenticator|Cancel pending setup/);
  for (const role of ["owner", "admin"]) {
    for (const aal of ["aal1", "aal2"]) {
      const pendingStaff = renderManager({ ...pendingContext, role, aal });
      assert.match(pendingStaff, /no in-app cancellation or restart/i);
      assert.match(pendingStaff, /setup details are unavailable after reload/i);
      assert.match(pendingStaff, /contact the project operator/i);
      assert.doesNotMatch(
        pendingStaff,
        /Cancel pending setup|cancel.*begin again|Set up authenticator|Remove authenticator|name="code"|<img/i,
      );
    }
  }
  assert.doesNotMatch(
    renderManager({ ...ready, otherVerifiedFactor: true }),
    /Set up authenticator/,
  );
});

test("staff pending setup retains transient verification but never offers cancellation or enabled removal", async () => {
  for (const role of ["owner", "admin"]) {
    const before = { ...ready, role };
    const pending = { ...pendingContext, role };
    const enrolled = { ...enrollmentResult, context: pending };
    const enabled = {
      ...pending,
      aal: "aal2",
      factors: [{ id: "fixture-factor", status: "verified" }],
    };
    const render = mountManager(async (data) => {
      assert.equal(data.get("expected_subject"), before.subject);
      return data.get("operation") === "enroll"
        ? enrolled
        : {
            status: "success",
            message: "Staff session verified",
            context: enabled,
          };
    }, before);
    await submit(
      elements(render(), "form")[0],
      formEvent({
        operation: "enroll",
        expected_subject: before.subject,
        acknowledge_backup: "yes",
      }).event,
    );
    const verify = elements(render(), "form").find(
      (node) => node.props["aria-label"] === "Verify authenticator 1",
    );
    assert.ok(verify, "newly enrolled staff factor must accept a current code");
    assert.equal(elements(render(), "img").length, 1, "transient private setup remains available");
    assert.equal(
      elements(render(), "form").some(
        (node) => node.props["aria-label"] === "Cancel pending setup 1",
      ),
      false,
    );
    const { event, input } = formEvent({
      operation: "verify",
      expected_subject: before.subject,
      factor_id: "fixture-factor",
      code: "000000",
    });
    await submit(verify, event);
    assert.equal(input.value, "");
    assert.equal(elements(render(), "img").length, 0);
    assert.equal(elements(render(), "form").length, 0, "enabled staff factor has no removal form");
    assert.equal(
      ui().confirmMfaResult(enabled, "remove", "fixture-factor", {
        status: "success",
        message: "Removed",
        context: before,
      }),
      false,
    );
  }
});

test("customer pending cancellation still permits starting setup again", async () => {
  const cancel = mountManager(async (data) => {
    assert.equal(data.get("operation"), "cancel");
    assert.equal(data.get("expected_subject"), ready.subject);
    assert.equal(data.get("factor_id"), "fixture-factor");
    assert.equal(data.has("code"), false);
    return { status: "success", message: "Pending setup cancelled", context: ready };
  }, pendingContext);
  const form = elements(cancel(), "form").find(
    (node) => node.props["aria-label"] === "Cancel pending setup 1",
  );
  assert.ok(form);
  await submit(
    form,
    formEvent({
      operation: "cancel",
      expected_subject: ready.subject,
      factor_id: "fixture-factor",
    }).event,
  );
  assert.ok(
    elements(cancel(), "form").some((node) => node.props["aria-label"] === "Set up authenticator"),
  );
});

test("uncertain or stale responses lock all submissions until a hard security reload", async () => {
  for (const response of [
    { status: "error", message: "Session changed", reloadRequired: true },
    { ...enrollmentResult, context: { ...pendingContext, subject: "switched-account" } },
    { status: "success", message: "Unproven", context: ready },
    null,
  ]) {
    let calls = 0;
    const render = mountManager(async () => {
      calls++;
      if (response === null) throw new Error("provider detail must not be shown");
      return response;
    });
    const form = elements(render(), "form")[0];
    const { event } = formEvent({
      operation: "enroll",
      expected_subject: ready.subject,
      acknowledge_backup: "yes",
    });
    await submit(form, event);
    const tree = render();
    assert.ok(elements(tree, "fieldset").every((node) => node.props.disabled === true));
    const reload = elements(tree, "a").find((node) => node.props.href === "/account/security");
    assert.ok(reload, "uncertain state requires a document reload link");
    assert.equal(elements(tree, "img").length, 0);
    await submit(form, event);
    assert.equal(calls, 1, "even stale handlers remain locked");
  }
});

test("a safe rejected verification keeps transient setup available for another current code", async () => {
  let calls = 0;
  const render = mountManager(async () =>
    ++calls === 1
      ? enrollmentResult
      : { status: "error", message: "Code was not accepted. Try a current code." },
  );
  await submit(
    elements(render(), "form")[0],
    formEvent({ operation: "enroll", expected_subject: ready.subject, acknowledge_backup: "yes" })
      .event,
  );
  const verify = elements(render(), "form").find(
    (node) => node.props["aria-label"] === "Verify authenticator 1",
  );
  assert.ok(verify);
  await submit(
    verify,
    formEvent({
      operation: "verify",
      expected_subject: ready.subject,
      factor_id: "fixture-factor",
      code: "000000",
    }).event,
  );
  const tree = render();
  assert.equal(elements(tree, "img").length, 1);
  assert.ok(elements(tree, "fieldset").every((node) => !node.props.disabled));
  const alerts = elements(tree, "p").filter((node) => node.props.role === "alert");
  assert.ok(
    alerts.some((node) => node.props.children === "Code was not accepted. Try a current code."),
  );
});

function renderManager(context: unknown = ready) {
  const { SecurityManager } = load("src/modules/identity/mfa/components/security-manager.tsx", {
    "../actions": {
      mfaAction: async () => {
        throw new Error("No real auth in unit tests");
      },
    },
    "../ui": ui(),
  });
  return require("react-dom/server").renderToStaticMarkup(
    require("react").createElement(SecurityManager, { initialContext: context }),
  ) as string;
}

test("staff enrollment explains required MFA and retains explicit backup acknowledgment", () => {
  for (const role of ["owner", "admin"]) {
    const html = renderManager({ ...ready, role });
    assert.match(html, /Set up authenticator/);
    assert.match(html, /staff access requires.*verified authenticator.*verified session/i);
    assert.match(html, /<input(?=[^>]*name="acknowledge_backup")(?=[^>]*required)[^>]*>/);
    assert.match(html, /no recovery codes/i);
    assert.doesNotMatch(html, /management is not available|<img|Remove authenticator/);
  }
});

test("customer enrollment explains lockout risk and requires explicit backup acknowledgment", () => {
  const html = renderManager();
  assert.match(html, /authenticator/i);
  assert.match(html, /lose access/i);
  assert.match(html, /no recovery codes/i);
  assert.match(html, /<input(?=[^>]*name="acknowledge_backup")(?=[^>]*required)[^>]*>/);
  assert.match(html, /Set up authenticator/);
  assert.doesNotMatch(html, /<img|synthetic-fixture-only/);
});

test("account navigation exposes security and MFA-required state redirects without private details", async () => {
  function account(state: unknown) {
    return load("src/app/(account)/account/page.tsx", {
      "@/modules/identity/server": { getIdentity: async () => state },
      "@/modules/identity/actions": { logoutAction: async () => {} },
      "@/modules/identity/components/identity-shell": { IdentityShell: "shell" },
      "next/navigation": {
        redirect: (url: string) => {
          throw new Error(`redirect:${url}`);
        },
      },
      "next/link": { default: "a" },
    });
  }
  const restricted = account({ status: "mfa_required" }).default().props.children as Tree;
  await assert.rejects(content(restricted), /redirect:\/account\/security/);
  const active = account({
    status: "active",
    email: "synthetic@example.invalid",
    actor: { role: "customer" },
  }).default().props.children as Tree;
  const rendered = await content(active);
  assert.ok(
    elements(rendered, "a").some(
      (link) => link.props.href === "/account/security" && link.props.prefetch === false,
    ),
  );
});

test("security controls stay readable and reachable at narrow mobile width", async () => {
  const css = new URL("src/app/security.css", root);
  assert.ok(existsSync(css), "security stylesheet must exist");
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 320, height: 740 },
      reducedMotion: "reduce",
    });
    const identityCss = readFileSync(new URL("src/app/identity.css", root), "utf8");
    const verified = {
      ...ready,
      aal: "aal2",
      factors: [{ id: "fixture-factor", status: "verified" }],
    };
    await page.setContent(
      `<style>${identityCss}\n${readFileSync(css, "utf8")}</style><main>${renderManager()}${renderManager(verified)}</main>`,
    );
    for (const control of await page.locator('button,.security-check,input[name="code"]').all()) {
      assert.ok(
        (await control.boundingBox())!.height >= 44,
        "interactive target must be at least 44px high",
      );
    }
    assert.ok(
      await page
        .locator('input[name="code"]')
        .evaluate((node: Element) => parseFloat(getComputedStyle(node).fontSize) >= 16),
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await browser.close();
  }
});

test("guest security content redirects before returning private controls inside Suspense", async () => {
  const route = securityPage({ status: "guest" });
  assert.equal(route.metadata.robots.index, false);
  assert.equal(route.metadata.robots.follow, false);
  const shell = route.default();
  assert.equal(shell.type, "shell");
  const boundary = shell.props.children as Tree;
  assert.equal(boundary.type, Symbol.for("react.suspense"));
  await assert.rejects(content(boundary), /redirect:\/login/);
});

test("MFA-restricted and unavailable security pages always offer direct sign out", async () => {
  for (const state of [
    { ...ready, factors: [{ id: "fixture-factor", status: "verified" }] },
    { status: "unavailable", message: "Reload security" },
  ]) {
    const boundary = securityPage(state).default().props.children as Tree;
    const rendered = await content(boundary);
    const signout = elements(rendered, "form").find(
      (form) => typeof form.props.action === "function",
    );
    assert.ok(
      signout,
      "signout cannot depend on the account page that redirects MFA-required sessions",
    );
    assert.ok(elements(signout, "button").some((button) => button.props.children === "Sign out"));
  }
});

test("removing one of multiple factors can safely return a downgraded session requiring another challenge", () => {
  const { confirmMfaResult } = ui();
  const before = {
    ...ready,
    aal: "aal2",
    factors: [
      { id: "one", status: "verified" },
      { id: "two", status: "verified" },
    ],
  };
  const after = { ...before, aal: "aal1", factors: [{ id: "two", status: "verified" }] };
  assert.equal(
    confirmMfaResult(before, "remove", "one", {
      status: "success",
      message: "Removed",
      context: after,
    }),
    true,
  );
});
