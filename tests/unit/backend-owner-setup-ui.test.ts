import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
// Fictional DTOs only; never native account, Auth, session or factor evidence.
const subject = "11111111-1111-4111-8111-111111111111";
const designation = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const intent = {
  id: "44444444-4444-4444-8444-444444444444",
  expiresAt: "2099-01-01T00:00:00.000001Z",
};
const mfa = { status: "ready", subject, designation, phase: "mfa_required" };
const ready = { ...mfa, phase: "ready" };
const consented = { ...ready, phase: "consented", intent };
const success = (state: unknown) => ({ status: "success", message: "RAW PROVIDER SECRET", state });
function compile(path: string) {
  const url = new URL(path, root);
  assert.ok(existsSync(url), `${path} must exist`);
  return ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
type FixtureWindow = Window & {
  checks: number;
  forms: FormData[];
  calls: { kind: string; entries: [string, string][] }[];
  finishCheck: (value: unknown, index?: number) => void;
  finishAction: (value: unknown, index?: number) => void;
  rejectAction: () => void;
  renderSetup: (mode: "visible" | "hidden", state?: unknown) => void;
  unmountSetup: () => void;
  setupFrames: number[];
};
async function renderedManager(strict = false, initial: unknown = mfa) {
  const modules: Record<string, string> = {
    manager: compile("src/modules/owner-setup/components/owner-setup-manager.tsx"),
    "../policy": compile("src/modules/owner-setup/policy.ts"),
  };
  const environment = strict ? "development" : "production";
  for (const [name, file] of [
    ["react", `react/cjs/react.${environment}.js`],
    ["react/jsx-runtime", `react/cjs/react-jsx-runtime.${environment}.js`],
    ["react-dom", `react-dom/cjs/react-dom.${environment}.js`],
    ["react-dom/client", `react-dom/cjs/react-dom-client.${environment}.js`],
    ["scheduler", `scheduler/cjs/scheduler.${environment}.js`],
  ]) {
    const pkg = file.split("/")[0];
    modules[name] = readFileSync(
      new URL(file.slice(pkg.length + 1), `file://${require.resolve(`${pkg}/package.json`)}`),
      "utf8",
    );
  }
  const { chromium } = require("@playwright/test") as typeof import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  page.setDefaultTimeout(2500);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("http://owner-setup-fixture.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<main><h1>TEST fixture — not native Owner proof</h1><section class="identity-panel" id="fixture"></section></main>',
    }),
  );
  await page.goto("http://owner-setup-fixture.invalid/");
  await page.addStyleTag({
    content:
      "*{box-sizing:border-box}body{margin:16px}" +
      readFileSync(new URL("src/app/identity.css", root), "utf8"),
  });
  if (existsSync(new URL("src/app/owner-setup.css", root)))
    await page.addStyleTag({
      content: readFileSync(new URL("src/app/owner-setup.css", root), "utf8"),
    });
  await page.addScriptTag({
    content: `(() => {
    const sources = ${JSON.stringify(modules)}, cache = {}, checks = [], actions = [];
    window.checks = 0; window.calls = []; window.forms = [];
    window.finishCheck = (value, index = checks.length - 1) => checks[index]?.resolve(value);
    window.finishAction = (value, index = actions.length - 1) => actions[index]?.resolve(value);
    window.rejectAction = () => actions.at(-1)?.reject(new Error('RAW PROVIDER SECRET'));
    const checkAction = async (...args) => {
      if (args.length) throw new Error('Self check must have no selectors');
      window.checks++; return new Promise((resolve,reject) => checks.push({resolve,reject}));
    };
    const action = kind => async data => {
      window.calls.push({kind,entries:Array.from(data.entries())}); window.forms.push(data);
      return new Promise((resolve,reject) => actions.push({resolve,reject}));
    };
    const verifyAction = action('verify'), consentAction = action('consent');
    function require(id) {
      if(cache[id]) return cache[id].exports;
      if(!sources[id]) throw new Error('Unmapped real module: ' + id);
      const module = {exports:{}}; cache[id] = module;
      new Function('module','exports','require','process',sources[id])(module,module.exports,require,{env:{NODE_ENV:${JSON.stringify(environment)}}});
      return module.exports;
    }
    const React = require('react'), root = require('react-dom/client').createRoot(document.getElementById('fixture'));
    window.renderSetup = (mode, initial = ${JSON.stringify(initial)}) => {
      const child = React.createElement(React.Activity,{mode},React.createElement(require('manager').OwnerSetupManager,{initial,checkAction,verifyAction,consentAction}));
      root.render(${strict} ? React.createElement(React.StrictMode,null,child) : child);
    };
    window.unmountSetup = () => root.unmount();
    window.renderSetup('visible');
  })();`,
  });
  await page.getByRole("button", { name: "Refresh setup status", exact: true }).waitFor();
  return { browser, page, errors };
}
type FixturePage = Awaited<ReturnType<typeof renderedManager>>["page"];
const settle = (page: FixturePage) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
async function allow(page: FixturePage, state: unknown = mfa) {
  await page.evaluate((value) => (window as unknown as FixtureWindow).finishCheck(value), state);
  await settle(page);
}
const calls = (page: FixturePage) =>
  page.evaluate(() => (window as unknown as FixtureWindow).calls);

test("cleanup drops pending transient code/confirmation payloads before transport settles and defeats late verification", async () => {
  const { browser, page, errors } = await renderedManager(true);
  try {
    await allow(page);
    await page.getByLabel("Six-digit authenticator code").fill("123456");
    await page.getByRole("button", { name: "Verify authenticator", exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).forms.at(-1)?.has("code")),
      false,
    );
    await page.evaluate(
      (value) => (window as unknown as FixtureWindow).finishAction(value),
      success(ready),
    );
    await settle(page);
    assert.equal(await page.locator("input").count(), 0);
    await page.getByRole("button", { name: "Refresh setup status", exact: true }).click();
    await allow(page, ready);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Record my consent", exact: true }).click();
    await page.evaluate(() => (window as unknown as FixtureWindow).unmountSetup());
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).forms.at(-1)?.has("confirm")),
      false,
    );
    await page.evaluate(
      (value) => (window as unknown as FixtureWindow).finishAction(value),
      success(consented),
    );
    await settle(page);
    assert.equal(await page.locator("#fixture").innerText(), "");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("native MFA then fresh explicit unchecked consent; exact self-only action payloads, no activation or automatic writes", async () => {
  const { browser, page, errors } = await renderedManager(true);
  try {
    assert.deepEqual(await calls(page), []);
    assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).checks), 2);
    await allow(page);
    await page.getByLabel("Six-digit authenticator code").fill("123456");
    assert.equal(
      await page.getByRole("link", { name: /account security/i }).getAttribute("href"),
      "/account/security",
    );
    await page.getByRole("button", { name: "Verify authenticator", exact: true }).click();
    assert.deepEqual(await calls(page), [
      {
        kind: "verify",
        entries: [
          ["subject", subject],
          ["code", "123456"],
        ],
      },
    ]);
    assert.equal(await page.getByLabel("Six-digit authenticator code").inputValue(), "");
    await page.evaluate(
      (value) => (window as unknown as FixtureWindow).finishAction(value),
      success(ready),
    );
    const checkbox = page.getByRole("checkbox");
    await checkbox.waitFor();
    assert.equal(await checkbox.isChecked(), false);
    assert.equal(
      await page.getByRole("button", { name: "Record my consent", exact: true }).isDisabled(),
      true,
    );
    assert.equal((await calls(page)).length, 1);
    await checkbox.check();
    await page.getByRole("button", { name: "Record my consent", exact: true }).click();
    assert.deepEqual((await calls(page))[1], {
      kind: "consent",
      entries: [
        ["subject", subject],
        ["designation", designation],
        ["confirm", "yes"],
      ],
    });
    await page.evaluate(
      (value) => (window as unknown as FixtureWindow).finishAction(value),
      success(consented),
    );
    await page.locator("[data-owner-setup-intent]").waitFor();
    assert.match(
      await page.locator("body").innerText(),
      /does not activate Owner[\s\S]*operator approval/i,
    );
    assert.match(
      await page.locator("[data-owner-setup-intent]").innerText(),
      new RegExp(`${intent.id}[\\s\\S]*${intent.expiresAt}`),
    );
    assert.doesNotMatch(await page.locator("body").innerText(), /RAW PROVIDER SECRET/);
    assert.equal(await page.locator("select").count(), 0);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

function loadRoute(path: string, state: unknown, identity?: unknown) {
  const React = require("react") as typeof import("react");
  const actions = {
    checkOwnerSetupSessionAction() {},
    verifyOwnerSetupMfaAction() {},
    consentOwnerSetupAction() {},
    logoutAction() {},
  };
  const routeModule = { exports: {} as Record<string, unknown> };
  const routeRequire = (id: string) => {
    if (id.endsWith(".css")) return {};
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return require(id);
    if (id === "next/link") return { default: "a" };
    if (id === "next/navigation")
      return {
        redirect: (url: string) => {
          throw new Error(`REDIRECT:${url}`);
        },
      };
    if (id.endsWith("/identity-shell")) return { IdentityShell: "identity-shell" };
    if (id.endsWith("/owner-setup-manager")) return { OwnerSetupManager: "owner-manager" };
    if (id === "@/modules/owner-setup/server") return { getOwnerSetupPageState: async () => state };
    if (id === "@/modules/identity/server") return { getIdentity: async () => identity };
    if (id.endsWith("/actions")) return actions;
    throw new Error(`Unexpected route dependency ${id}`);
  };
  new Function("module", "exports", "require", compile(path))(
    routeModule,
    routeModule.exports,
    routeRequire,
  );
  const shell = (routeModule.exports.default as () => import("react").ReactElement)();
  const suspense = (shell.props as { children: import("react").ReactElement }).children;
  assert.equal(suspense.type, React.Suspense);
  const child = (suspense.props as { children: import("react").ReactElement }).children;
  return {
    module: routeModule,
    actions,
    content: () => (child.type as () => Promise<import("react").ReactNode>)(),
  };
}
function elements(node: import("react").ReactNode): import("react").ReactElement[] {
  const React = require("react") as typeof import("react");
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements((node.props as { children?: import("react").ReactNode }).children)];
}
test("private Owner route preserves native MFA phase, guest login, exact typed actions and neutral active Customer navigation", async () => {
  const path = "src/app/(account)/account/owner-setup/page.tsx";
  const route = loadRoute(path, mfa);
  assert.deepEqual((route.module.exports.metadata as { robots: unknown }).robots, {
    index: false,
    follow: false,
  });
  const manager = elements(await route.content()).find((node) => node.type === "owner-manager")!;
  assert.ok(manager);
  const props = manager.props as Record<string, unknown>;
  assert.equal(props.initial, mfa);
  assert.equal(props.checkAction, route.actions.checkOwnerSetupSessionAction);
  assert.equal(props.verifyAction, route.actions.verifyOwnerSetupMfaAction);
  assert.equal(props.consentAction, route.actions.consentOwnerSetupAction);
  await assert.rejects(loadRoute(path, { status: "guest" }).content, /REDIRECT:\/login/);
  const unavailableRoute = loadRoute(path, {
    status: "unavailable",
    message: "RAW PROVIDER SECRET",
  });
  assert.doesNotMatch(JSON.stringify(await unavailableRoute.content()), /RAW PROVIDER SECRET/);
  for (const status of ["suspended", "unverified", "unprovisioned", "unavailable"]) {
    const account = loadRoute("src/app/(account)/account/page.tsx", null, {
      status,
      actor: { role: "customer" },
      message: "Account unavailable",
    });
    assert.equal(
      elements(await account.content()).filter(
        (node) => (node.props as Record<string, unknown>).href === "/account/owner-setup",
      ).length,
      0,
    );
  }
  for (const role of ["customer", "admin", "owner"]) {
    const account = loadRoute("src/app/(account)/account/page.tsx", null, {
      status: "active",
      email: "fictional@example.invalid",
      actor: { role, aal: "aal1", hasVerifiedMfa: false },
    });
    const links = elements(await account.content()).filter(
      (node) => (node.props as Record<string, unknown>).href === "/account/owner-setup",
    );
    assert.equal(links.length, role === "customer" ? 1 : 0);
    if (links[0]) assert.equal((links[0].props as { children: string }).children, "Owner setup");
  }
});

test("real 320px and desktop geometry keeps 44px/16px controls and UUID intent references within the panel", async () => {
  const { browser, page, errors } = await renderedManager();
  try {
    await allow(page);
    for (const width of [320, 1024]) {
      await page.setViewportSize({ width, height: 740 });
      for (const state of [mfa, ready, consented]) {
        await page.getByRole("button", { name: "Refresh setup status", exact: true }).click();
        await allow(page, state);
        for (const control of await page
          .locator(".owner-setup-manager button,.owner-setup-manager input,.owner-setup-manager a")
          .all()) {
          const box = (await control.boundingBox())!;
          assert.ok(box.height >= 44, `${width}: control height ${box.height}`);
          assert.ok(
            await control.evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 16),
            `${width}: control font size`,
          );
        }
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${width}: no horizontal scroll`,
        );
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const strict of [false, true]) {
  test(`${strict ? "development StrictMode" : "production"}: Activity, pagehide, account/designation changes and unmount erase sensitive state and invalidate late work`, async () => {
    const { browser, page, errors } = await renderedManager(strict, ready);
    const refresh = page.getByRole("button", { name: "Refresh setup status", exact: true });
    const empty = async () => {
      assert.equal(await page.locator("[data-owner-setup-intent]").count(), 0);
      assert.equal(await page.getByRole("checkbox").count(), 0);
      assert.equal(await page.getByLabel("Six-digit authenticator code").count(), 0);
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /Consent recorded\.|RAW PROVIDER SECRET/,
      );
    };
    const consent = async () => {
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record my consent", exact: true }).click();
    };
    const showIntent = async () => {
      await consent();
      await page.evaluate(
        (value) => (window as unknown as FixtureWindow).finishAction(value),
        success(consented),
      );
      await page.locator("[data-owner-setup-intent]").waitFor();
    };
    try {
      await allow(page, ready);
      if (strict) {
        await page.evaluate((value) => (window as unknown as FixtureWindow).finishCheck(value, 0), {
          ...ready,
          subject: other,
        });
        await settle(page);
        assert.equal(await page.getByRole("checkbox").isDisabled(), false);
      }
      await showIntent();
      await page.evaluate(() => (window as unknown as FixtureWindow).renderSetup("hidden"));
      await refresh.waitFor({ state: "hidden" });
      await page.evaluate(() => {
        const fixture = window as unknown as FixtureWindow;
        fixture.setupFrames = [];
        const sample = () => {
          fixture.setupFrames.push(document.querySelectorAll("[data-owner-setup-intent]").length);
          if (fixture.setupFrames.length < 4) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        fixture.renderSetup("visible");
      });
      await refresh.waitFor();
      await empty();
      await page.waitForFunction(
        () => (window as unknown as FixtureWindow).setupFrames.length === 4,
      );
      assert.deepEqual(
        await page.evaluate(() => (window as unknown as FixtureWindow).setupFrames),
        [0, 0, 0, 0],
      );
      await allow(page, ready);
      assert.equal(await page.getByRole("checkbox").isChecked(), false);
      await consent();
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      await page.evaluate(
        (value) => (window as unknown as FixtureWindow).finishAction(value),
        success(consented),
      );
      await empty();
      assert.equal(await page.locator(".owner-setup-manager").getAttribute("aria-busy"), "false");
      const checks = await page.evaluate(() => (window as unknown as FixtureWindow).checks);
      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
      );
      await settle(page);
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).checks),
        checks,
        "browser restore never automatically refreshes or retries",
      );
      for (const event of ["focus", "storage", "pagehide"]) {
        await refresh.click();
        await allow(page, ready);
        await showIntent();
        const before = await page.evaluate(() => (window as unknown as FixtureWindow).checks);
        const immediate = await page.evaluate((name) => {
          window.dispatchEvent(new Event(name));
          return document.querySelectorAll("[data-owner-setup-intent]").length;
        }, event);
        assert.equal(immediate, 0, `${event}: synchronous clearing`);
        await empty();
        assert.equal(
          await page.evaluate(() => (window as unknown as FixtureWindow).checks),
          before,
        );
      }
      for (const updated of [
        { ...ready, designation: other },
        { ...ready, subject: other },
      ]) {
        await refresh.click();
        await allow(page, ready);
        await consent();
        await page.evaluate(
          (value) => (window as unknown as FixtureWindow).renderSetup("visible", value),
          updated,
        );
        await settle(page);
        await page.evaluate(
          (value) => (window as unknown as FixtureWindow).finishAction(value),
          success(consented),
        );
        await empty();
        await allow(page, updated);
        assert.equal(await page.getByRole("checkbox").isChecked(), false);
        await page.evaluate(() => (window as unknown as FixtureWindow).renderSetup("visible"));
        await settle(page);
        await allow(page, ready);
      }
      await allow(page, ready);
      await consent();
      const before = await page.evaluate(() => (window as unknown as FixtureWindow).checks);
      await page.evaluate(() => (window as unknown as FixtureWindow).unmountSetup());
      await page.evaluate((value) => {
        (window as unknown as FixtureWindow).finishAction(value);
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new Event("pageshow"));
      }, success(consented));
      await settle(page);
      assert.equal(await page.locator("#fixture").innerText(), "");
      assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).checks), before);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

test("foreign/malformed/uncertain results wipe consent and intent, suppress raw diagnostics and never retry mutations", async () => {
  const { browser, page, errors } = await renderedManager(true, ready);
  try {
    const invalid = [
      null,
      { status: "error", message: "RAW PROVIDER SECRET", reloadRequired: true },
      { status: "success", message: "RAW PROVIDER SECRET" },
      { ...success(consented), reloadRequired: true },
      { ...success(consented), extra: "private@example.invalid" },
      success(ready),
      success(mfa),
      success({ ...consented, subject: other }),
      success({ ...consented, designation: other }),
      success({ ...consented, intent: { ...intent, expiresAt: "not-a-date" } }),
      success({ ...consented, intent: { ...intent, factor: "PRIVATE" } }),
      success({ ...ready, intent }),
      success({ ...consented, extra: "private@example.invalid" }),
    ];
    await allow(page, ready);
    for (const value of invalid) {
      const before = (await calls(page)).length;
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record my consent", exact: true }).click();
      await page
        .locator("form")
        .evaluate((form: HTMLFormElement) =>
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
        );
      assert.equal(await page.getByRole("checkbox").isChecked(), false);
      assert.equal((await calls(page)).length, before + 1);
      await page.evaluate(
        (result) => (window as unknown as FixtureWindow).finishAction(result),
        value,
      );
      await settle(page);
      assert.equal(await page.getByRole("checkbox").count(), 0);
      assert.equal(await page.locator("[data-owner-setup-intent]").count(), 0);
      assert.match(await page.getByRole("status").innerText(), /unavailable/);
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /RAW PROVIDER SECRET|private@example|PRIVATE/,
      );
      assert.equal((await calls(page)).length, before + 1);
      await page.getByRole("button", { name: "Refresh setup status", exact: true }).click();
      await allow(page, ready);
    }
    for (const kind of ["rejected", "inherited", "getter", "symbol"]) {
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Record my consent", exact: true }).click();
      await page.evaluate(
        ({ kind, state }) => {
          const fixture = window as unknown as FixtureWindow;
          if (kind === "rejected") {
            fixture.rejectAction();
            return;
          }
          let result: object = { status: "success", message: "RAW PROVIDER SECRET", state };
          if (kind === "inherited") result = Object.create(result);
          if (kind === "getter")
            Object.defineProperty(result, "state", {
              get() {
                throw new Error("RAW PROVIDER SECRET");
              },
            });
          if (kind === "symbol")
            Object.defineProperty(result, Symbol("private"), { value: "PRIVATE" });
          fixture.finishAction(result);
        },
        { kind, state: consented },
      );
      await settle(page);
      assert.equal(await page.locator("[data-owner-setup-intent]").count(), 0);
      assert.equal(await page.getByRole("checkbox").count(), 0);
      assert.doesNotMatch(await page.locator("body").innerText(), /RAW PROVIDER SECRET|PRIVATE/);
      await page.getByRole("button", { name: "Refresh setup status", exact: true }).click();
      await allow(page, ready);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const strict of [false, true]) {
  test(`${strict ? "development StrictMode" : "production"}: readiness is self-bound, unavailable stays generic, completed is self-only and no phase writes automatically`, async () => {
    const { browser, page, errors } = await renderedManager(strict);
    const refresh = page.getByRole("button", { name: "Refresh setup status", exact: true });
    try {
      for (const state of [
        null,
        { status: "unavailable", message: "RAW PROVIDER SECRET", designation },
        { status: "guest" },
        { ...mfa, subject: other },
        { ...mfa, designation: other },
        { ...mfa, phase: "other" },
        { ...mfa, subject: `${subject}\n` },
        { ...mfa, designation: null },
        { ...mfa, private: "PRIVATE" },
        { ...consented, intent: { ...intent, expiresAt: "invalid" } },
      ]) {
        await allow(page, state);
        assert.equal(await page.locator("form,input,[data-owner-setup-intent]").count(), 0);
        assert.doesNotMatch(
          await page.locator("body").innerText(),
          new RegExp(`RAW PROVIDER SECRET|PRIVATE|${designation}|${intent.id}`),
        );
        await refresh.click();
      }
      await allow(page, mfa);
      await page.getByLabel("Six-digit authenticator code").fill("12345");
      await page
        .locator("form")
        .evaluate((form: HTMLFormElement) =>
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
        );
      assert.deepEqual(await calls(page), []);
      await page.getByLabel("Six-digit authenticator code").fill("123456");
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      assert.equal(await page.locator("input").count(), 0);
      await refresh.click();
      await allow(page, mfa);
      assert.equal(await page.getByLabel("Six-digit authenticator code").inputValue(), "");
      await refresh.click();
      // Clear pending readiness too; a late same-self response must not renew it.
      await page.evaluate((value) => {
        window.dispatchEvent(new Event("pagehide"));
        (window as unknown as FixtureWindow).finishCheck(value);
      }, mfa);
      await settle(page);
      assert.equal(await page.locator("input").count(), 0);
      assert.equal(await page.locator(".owner-setup-manager").getAttribute("aria-busy"), "false");
      await refresh.click();
      await allow(page, { ...ready, phase: "completed" });
      assert.match(await page.locator("body").innerText(), /completed for your account/);
      assert.equal(await page.locator("form,input,[data-owner-setup-intent]").count(), 0);
      assert.deepEqual(await calls(page), []);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
