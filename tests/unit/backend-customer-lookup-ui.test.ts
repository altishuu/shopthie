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
const subject = "11111111-1111-4111-8111-111111111111";
function compile(path: string) {
  const url = new URL(path, root);
  assert.ok(existsSync(url), `${path} must exist`);
  return ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
function route(state: unknown) {
  let calls = 0;
  const exports: Record<string, unknown> = {};
  const mocks: Record<string, unknown> = {
    "@/modules/identity/components/identity-shell": { IdentityShell: "shell" },
    "@/modules/identity/actions": { logoutAction: logout },
    "@/modules/customer-lookup/server": {
      getCustomerLookupPageState: async () => {
        calls++;
        return state;
      },
    },
    "@/modules/customer-lookup/components/customer-lookup-manager": {
      CustomerLookupManager: "lookup",
    },
    "@/app/staff.css": {},
    "next/link": { default: "a" },
    "next/navigation": {
      redirect: (url: string) => {
        throw new Error(`redirect:${url}`);
      },
    },
  };
  vm.runInNewContext(compile("src/app/(staff)/admin/customers/page.tsx"), {
    exports,
    require: (id: string) => (id in mocks ? mocks[id] : require(id)),
  });
  return {
    page: exports.default as () => Tree,
    metadata: exports.metadata as { robots: { index: boolean; follow: boolean } },
    calls: () => calls,
  };
}
function elements(node: unknown, type: unknown): Tree[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const tree = node as Tree;
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props.children, type)];
}
async function content(shell: Tree) {
  assert.equal(shell.type, "shell");
  const boundary = shell.props.children as Tree;
  assert.equal(boundary.type, Symbol.for("react.suspense"));
  const child = boundary.props.children as Tree;
  return (child.type as () => Promise<Tree>)();
}

// Clearly labeled privileged UI fixtures: only the action is replaced. These run the
// real React component in Chromium, not a hook imitation or native authorization proof.
type FixtureWindow = Window & {
  lookupCalls: [string, string][][];
  finishLookup: (value: unknown) => void;
  rejectLookup: () => void;
  unmountLookup: () => void;
};
async function renderedManager() {
  const component = compile("src/modules/customer-lookup/components/customer-lookup-manager.tsx");
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  const modules: Record<string, string> = {};
  for (const [name, file] of [
    ["react", "react/cjs/react.production.js"],
    ["react/jsx-runtime", "react/cjs/react-jsx-runtime.production.js"],
    ["react-dom", "react-dom/cjs/react-dom.production.js"],
    ["react-dom/client", "react-dom/cjs/react-dom-client.production.js"],
    ["scheduler", "scheduler/cjs/scheduler.production.js"],
  ]) {
    const packageName = file.split("/")[0];
    modules[name] = readFileSync(
      new URL(
        file.slice(packageName.length + 1),
        `file://${require.resolve(`${packageName}/package.json`)}`,
      ),
      "utf8",
    );
  }
  modules.manager = component;
  await page.route("http://lookup-fixture.invalid/**", (route: import("@playwright/test").Route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<main><h1>TEST fixture — not native staff proof</h1><section class="identity-panel" id="fixture"></section></main>',
    }),
  );
  await page.goto("http://lookup-fixture.invalid/");
  // Minimal fixture reset, followed by the actual identity and staff stylesheets.
  await page.addStyleTag({
    content:
      "*{box-sizing:border-box}body{margin:16px}" +
      readFileSync(new URL("src/app/identity.css", root), "utf8"),
  });
  const staffCss = new URL("src/app/staff.css", root);
  if (existsSync(staffCss)) await page.addStyleTag({ content: readFileSync(staffCss, "utf8") });
  await page.addScriptTag({
    content: `(() => {
    const sources = ${JSON.stringify(modules)};
    const cache = {};
    window.lookupCalls = [];
    const action = async data => {
      window.lookupCalls.push(Array.from(data.entries()));
      return new Promise((resolve, reject) => { window.finishLookup = resolve; window.rejectLookup = () => reject(new Error('RAW PROVIDER SECRET')); });
    };
    function require(id) {
      if (id === '../actions') return { lookupCustomerAction: action };
      if (cache[id]) return cache[id].exports;
      if (!sources[id]) throw new Error('Unmapped fixture dependency: ' + id);
      const module = { exports: {} }; cache[id] = module;
      new Function('module', 'exports', 'require', 'process', sources[id])(
        module, module.exports, require, { env: { NODE_ENV: 'production' } });
      return module.exports;
    }
    const React = require('react');
    const root = require('react-dom/client').createRoot(document.getElementById('fixture'));
    root.render(React.createElement(require('manager').CustomerLookupManager, { subject: ${JSON.stringify(subject)} }));
    window.unmountLookup = () => root.unmount();
  })();`,
  });
  await page.getByLabel("Exact username").waitFor();
  return { browser, page };
}

test("rendered fixture submits only exact fields once and renders a validated minimal result", async () => {
  const { browser, page } = await renderedManager();
  try {
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).lookupCalls.length),
      0,
    );
    assert.equal(await page.locator("form").getAttribute("method"), "post");
    await page.getByLabel("Exact username").fill("Test_Customer");
    await page.getByLabel("Lookup reason").selectOption("profile_help");
    await page.getByRole("button", { name: "Look up customer", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: /looking up/i }).isDisabled(), true);
    await page
      .locator("form")
      .evaluate((form: HTMLFormElement) =>
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
    assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).lookupCalls), [
      [
        ["expected_subject", subject],
        ["username", "Test_Customer"],
        ["reason", "profile_help"],
      ],
    ]);
    await page.evaluate(
      (value: unknown) => (window as unknown as FixtureWindow).finishLookup(value),
      {
        status: "found",
        message: "Found",
        customer: { subject, username: "test_customer", status: "active" },
      },
    );
    await page.getByText("test_customer", { exact: true }).waitFor();
    assert.equal(await page.getByText(subject, { exact: true }).count(), 1);
    assert.equal(await page.getByText("active", { exact: true }).count(), 1);
  } finally {
    await browser.close();
  }
});

test("rendered fixture clears previous DTOs on edits and ignores late edited/unmounted results", async () => {
  const { browser, page } = await renderedManager();
  try {
    const found = {
      status: "found",
      message: "Found",
      customer: { subject, username: "test_customer", status: "active" },
    };
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("account_access");
    const submit = () =>
      page.getByRole("button", { name: "Look up customer", exact: true }).click();
    const finish = () =>
      page.evaluate(
        (value: unknown) => (window as unknown as FixtureWindow).finishLookup(value),
        found,
      );
    await submit();
    await finish();
    await page.getByText(subject, { exact: true }).waitFor();
    await page.getByLabel("Exact username").fill("other_customer");
    assert.equal(await page.getByText(subject, { exact: true }).count(), 0);
    await page.getByLabel("Exact username").fill("test_customer");
    await submit();
    await finish();
    await page.getByText(subject, { exact: true }).waitFor();
    await page.getByLabel("Lookup reason").selectOption("address_help");
    assert.equal(await page.getByText(subject, { exact: true }).count(), 0);
    for (const edit of ["username", "reason"]) {
      await page.getByLabel("Exact username").fill("test_customer");
      await submit();
      if (edit === "username") await page.getByLabel("Exact username").fill("changed_customer");
      else await page.getByLabel("Lookup reason").selectOption("profile_help");
      await finish();
      await page.getByRole("button", { name: "Look up customer", exact: true }).waitFor();
      assert.equal(await page.locator(".customer-lookup-result").count(), 0);
      assert.equal(await page.getByRole("status").innerText(), "");
    }
    await submit();
    await page.evaluate(() => (window as unknown as FixtureWindow).unmountLookup());
    await finish();
    assert.equal(await page.locator("#fixture").innerText(), "");
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally {
    await browser.close();
  }
});

test("rendered fixture rejects malformed, mismatched or overbroad DTOs and never displays provider details", async () => {
  const { browser, page } = await renderedManager();
  try {
    const customer = { subject, username: "test_customer", status: "active" };
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("profile_help");
    const button = page.getByRole("button", { name: "Look up customer", exact: true });
    const invalid = [
      null,
      {
        status: "found",
        message: "RAW PROVIDER SECRET",
        customer: { ...customer, username: "other_customer" },
      },
      {
        status: "found",
        message: "RAW PROVIDER SECRET",
        customer: { ...customer, subject: "not-a-uuid" },
      },
      {
        status: "found",
        message: "RAW PROVIDER SECRET",
        customer: { ...customer, subject: `${subject}\n` },
      },
      {
        status: "found",
        message: "RAW PROVIDER SECRET",
        customer: { ...customer, status: "deleted" },
      },
      {
        status: "found",
        message: "RAW PROVIDER SECRET",
        customer: { ...customer, email: "private@example.invalid" },
      },
      { status: "found", message: "RAW PROVIDER SECRET", customer, extra: "private" },
      { status: "found", message: "RAW PROVIDER SECRET", customer: null },
      { status: "error", message: "RAW PROVIDER SECRET", customer },
      { status: "not_found", message: "RAW PROVIDER SECRET", customer },
      { status: "success", message: "RAW PROVIDER SECRET", customer },
      { status: "found", message: 123, customer },
    ];
    for (const result of invalid) {
      await button.click();
      await page.evaluate(
        (value: unknown) => (window as unknown as FixtureWindow).finishLookup(value),
        result,
      );
      await button.waitFor();
      assert.equal(
        await page.locator(".customer-lookup-result").count(),
        0,
        JSON.stringify(result),
      );
      assert.match(await page.getByRole("status").innerText(), /unavailable/i);
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /RAW PROVIDER SECRET|private@example/,
      );
    }
    for (const status of ["not_found", "error"]) {
      await button.click();
      await page.evaluate(
        (value: unknown) => (window as unknown as FixtureWindow).finishLookup(value),
        { status, message: "RAW PROVIDER SECRET", customer: null },
      );
      await button.waitFor();
      assert.equal(await page.locator(".customer-lookup-result").count(), 0);
      assert.match(
        await page.getByRole("status").innerText(),
        status === "not_found" ? /no customer match/i : /unavailable/i,
      );
      assert.doesNotMatch(await page.locator("body").innerText(), /RAW PROVIDER SECRET/);
    }
    await button.click();
    await page.evaluate(() => (window as unknown as FixtureWindow).rejectLookup());
    await button.waitFor();
    assert.match(await page.getByRole("status").innerText(), /unavailable/i);
    assert.doesNotMatch(await page.locator("body").innerText(), /RAW PROVIDER SECRET/);
  } finally {
    await browser.close();
  }
});

test("320px rendered fixture has usable controls, explicit reason validation and no automatic lookup", async () => {
  assert.ok(existsSync(new URL("src/app/staff.css", root)), "scoped staff styles must exist");
  const { browser, page } = await renderedManager();
  try {
    for (const control of await page.locator("button,input:not([type=hidden]),select").all()) {
      assert.ok((await control.boundingBox())!.height >= 44);
    }
    for (const control of await page.locator("input:not([type=hidden]),select").all()) {
      assert.ok(
        await control.evaluate(
          (node: Element) => parseFloat(getComputedStyle(node).fontSize) >= 16,
        ),
      );
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const button = page.getByRole("button", { name: "Look up customer", exact: true });
    await page.getByLabel("Exact username").fill("test_customer");
    await button.click();
    assert.equal(
      await page
        .getByLabel("Lookup reason")
        .evaluate((select: HTMLSelectElement) => select.validity.valueMissing),
      true,
    );
    await page.getByLabel("Lookup reason").selectOption("address_help");
    for (const username of ["a", "partial%", "person@example.invalid", " test_customer", "élève"]) {
      await page.getByLabel("Exact username").fill(username);
      await button.click();
      // Even a synthetic submit that skips native validation cannot trigger an audited read.
      await page
        .locator("form")
        .evaluate((form: HTMLFormElement) =>
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
        );
    }
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).lookupCalls.length),
      0,
    );
    assert.deepEqual(
      await page
        .locator("select option")
        .evaluateAll((options: HTMLOptionElement[]) => options.map((option) => option.value)),
      ["", "account_access", "profile_help", "address_help"],
    );
    const longUsername = "a".repeat(32);
    await page.getByLabel("Exact username").fill(longUsername);
    await button.click();
    await page.evaluate(
      (value: unknown) => (window as unknown as FixtureWindow).finishLookup(value),
      {
        status: "found",
        message: "Found",
        customer: { subject, username: longUsername, status: "suspended" },
      },
    );
    await page.getByText("suspended", { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally {
    await browser.close();
  }
});

test("lookup route is request-scoped/noindex, gates its form and keeps direct exits", async () => {
  for (const state of [
    { status: "ready", subject },
    { status: "denied", message: "Lookup access unavailable." },
    { status: "unavailable", message: "Lookup access unavailable." },
  ]) {
    const loaded = route(state);
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.metadata.robots)), {
      index: false,
      follow: false,
    });
    const shell = loaded.page();
    assert.equal(loaded.calls(), 0);
    const tree = await content(shell);
    assert.equal(loaded.calls(), 1);
    const managers = elements(tree, "lookup");
    assert.equal(managers.length, state.status === "ready" ? 1 : 0);
    if (state.status === "ready") assert.equal(managers[0].props.subject, subject);
    assert.deepEqual(
      elements(tree, "a")
        .map((link) => link.props.href)
        .sort(),
      ["/account", "/account/security", "/admin"],
    );
    assert.ok(elements(tree, "a").every((link) => link.props.prefetch === false));
    assert.ok(elements(tree, "form").some((form) => form.props.action === logout));
  }
  for (const [status, path] of [
    ["guest", "/login"],
    ["mfa_required", "/account/security"],
  ]) {
    const loaded = route({ status });
    await assert.rejects(content(loaded.page()), new RegExp(`redirect:${path}`));
    await assert.rejects(content(loaded.page()), new RegExp(`redirect:${path}`));
    assert.equal(loaded.calls(), 2);
  }
});
