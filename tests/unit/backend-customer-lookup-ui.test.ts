import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
type Tree = { type: unknown; props: Record<string, unknown>; key?: string };
const logout = async () => {};
const subject = "11111111-1111-4111-8111-111111111111";
function compile(path: string) {
  const url = new URL(path, root);
  assert.ok(existsSync(url), `${path} must exist`);
  return ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
function route(
  state: unknown,
  statusState: unknown = { status: "denied", message: "Unavailable" },
) {
  let calls = 0;
  let statusCalls = 0;
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
    "@/modules/customer-status/server": {
      getCustomerStatusPageState: async () => {
        statusCalls++;
        if (statusState instanceof Error) throw statusState;
        return statusState;
      },
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
    statusCalls: () => statusCalls,
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
  renderLookup: (mode: "visible" | "hidden", actor?: string) => void;
  sessionCalls: number;
  finishSession: (value: unknown) => void;
  statusCalls: { kind: string; fields: [string, string][] }[];
  finishStatus: (value: unknown) => void;
  rejectStatus: () => void;
  statusSessionCalls: number;
  finishStatusSession: (value: unknown, index?: number) => void;
  rejectStatusSession: (index?: number) => void;
  renderStatus: (mode: "visible" | "hidden", actor?: string, target?: string) => void;
};
export async function renderedManager(
  statusEnabled = false,
  developmentStrict = false,
  deferStatusSession = false,
) {
  const component = compile("src/modules/customer-lookup/components/customer-lookup-manager.tsx");
  const { chromium } = require("@playwright/test") as typeof import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  const modules: Record<string, string> = {};
  const environment = developmentStrict ? "development" : "production";
  for (const [name, file] of [
    ["react", `react/cjs/react.${environment}.js`],
    ["react/jsx-runtime", `react/cjs/react-jsx-runtime.${environment}.js`],
    ["react-dom", `react-dom/cjs/react-dom.${environment}.js`],
    ["react-dom/client", `react-dom/cjs/react-dom-client.${environment}.js`],
    ["scheduler", `scheduler/cjs/scheduler.${environment}.js`],
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
  const statusPath = "src/modules/customer-status/components/customer-status-manager.tsx";
  modules.status = compile(statusPath);
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
    window.sessionCalls = 0;
    window.statusCalls = [];
    window.statusSessionCalls = 0;
    const statusSessions = [];
    window.finishStatusSession = (value, index = statusSessions.length - 1) => statusSessions[index]?.resolve(value);
    window.rejectStatusSession = (index = statusSessions.length - 1) => statusSessions[index]?.reject(new Error('RAW PROVIDER SECRET'));
    const checkStatusSession = async (...args) => {
      if (args.length) throw new Error('Self-readiness takes no target arguments');
      window.statusSessionCalls++;
      if (!${JSON.stringify(deferStatusSession)}) return {status: 'ready', subject: ${JSON.stringify(subject)}};
      return new Promise((resolve, reject) => statusSessions.push({resolve, reject}));
    };
    const checkSession = async () => {
      window.sessionCalls++;
      return new Promise(resolve => { window.finishSession = resolve; });
    };
    const statusAction = kind => async data => {
      window.statusCalls.push({kind, fields: Array.from(data.entries())});
      return new Promise((resolve, reject) => { window.finishStatus = resolve; window.rejectStatus = () => reject(new Error('RAW PROVIDER SECRET')); });
    };
    const action = async data => {
      window.lookupCalls.push(Array.from(data.entries()));
      return new Promise((resolve, reject) => { window.finishLookup = resolve; window.rejectLookup = () => reject(new Error('RAW PROVIDER SECRET')); });
    };
    function require(id) {
      if (id === '../actions') return { lookupCustomerAction: action, checkCustomerLookupSessionAction: checkSession,
        checkCustomerStatusSessionAction: checkStatusSession,
        loadCustomerStatusAction: statusAction('read'), changeCustomerStatusAction: statusAction('change') };
      if (id.includes('customer-status-manager')) return require('status');
      if (cache[id]) return cache[id].exports;
      if (!sources[id]) throw new Error('Unmapped fixture dependency: ' + id);
      const module = { exports: {} }; cache[id] = module;
      new Function('module', 'exports', 'require', 'process', sources[id])(
        module, module.exports, require, { env: { NODE_ENV: ${JSON.stringify(environment)} } });
      return module.exports;
    }
    const React = require('react');
    const root = require('react-dom/client').createRoot(document.getElementById('fixture'));
    const render = child => root.render(${JSON.stringify(developmentStrict)} ? React.createElement(React.StrictMode, null, child) : child);
    window.renderLookup = (mode, actor = ${JSON.stringify(subject)}) => render(
      React.createElement(React.Activity, {mode}, React.createElement(require('manager').CustomerLookupManager,
        { subject: actor, statusEnabled: ${JSON.stringify(statusEnabled)} })));
    window.renderLookup('visible');
    window.renderStatus = (mode, actor = ${JSON.stringify(subject)}, target = '33333333-3333-4333-8333-333333333333') => render(
      React.createElement(React.Activity, {mode}, React.createElement(require('status').CustomerStatusManager,
        {actorSubject: actor, customerSubject: target})));
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
    assert.equal(
      await page.getByRole("button", { name: "Check current access", exact: true }).count(),
      0,
      "status capability defaults off",
    );
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

test("Activity restoration discards a retained DTO and waits for current-subject readiness", async () => {
  const { browser, page } = await renderedManager();
  try {
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("account_access");
    await page.getByRole("button", { name: "Look up customer", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishLookup(value), {
      status: "found",
      message: "Found",
      customer: { subject, username: "test_customer", status: "active" },
    });
    await page.locator(".customer-lookup-result").waitFor();
    await page.evaluate(() => (window as unknown as FixtureWindow).renderLookup("hidden"));
    await page.getByLabel("Exact username").waitFor({ state: "hidden" });
    await page.evaluate(() => {
      const samples: number[] = [];
      (window as unknown as { restoredFrames: number[] }).restoredFrames = samples;
      let remaining = 4;
      function sample() {
        samples.push(document.querySelectorAll(".customer-lookup-result").length);
        if (--remaining) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.evaluate(() => (window as unknown as FixtureWindow).renderLookup("visible"));
    await page.getByLabel("Exact username").waitFor();
    assert.equal(
      await page.locator(".customer-lookup-result").count(),
      0,
      "retained DTO must not return",
    );
    assert.equal(
      await page.getByRole("button", { name: "Look up customer", exact: true }).isDisabled(),
      true,
    );
    assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).sessionCalls), 1);
    await page.waitForFunction(
      () => (window as unknown as { restoredFrames: number[] }).restoredFrames.length === 4,
    );
    assert.deepEqual(
      await page.evaluate(() => (window as unknown as { restoredFrames: number[] }).restoredFrames),
      [0, 0, 0, 0],
      "no retained DTO can flash in a restored frame",
    );
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject,
    });
    await page.waitForFunction(
      () => !(document.querySelector("button[type=submit]") as HTMLButtonElement).disabled,
    );
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).lookupCalls.length),
      1,
    );
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("account_access");
    await page.getByRole("button", { name: "Look up customer", exact: true }).click();
    await page.evaluate(() => (window as unknown as FixtureWindow).renderLookup("hidden"));
    await page.getByLabel("Exact username").waitFor({ state: "hidden" });
    await page.evaluate(() => (window as unknown as FixtureWindow).renderLookup("visible"));
    await page.getByLabel("Exact username").waitFor();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishLookup(value), {
      status: "found",
      message: "Found",
      customer: { subject, username: "test_customer", status: "active" },
    });
    assert.equal(
      await page.locator(".customer-lookup-result").count(),
      0,
      "in-flight pre-hide response cannot restore a DTO",
    );
    assert.equal(
      await page.getByRole("button", { name: "Look up customer", exact: true }).isDisabled(),
      true,
    );
  } finally {
    await browser.close();
  }
});

test("actor changes and page lifecycle invalidate outstanding lookup responses", async () => {
  const { browser, page } = await renderedManager();
  try {
    const button = page.getByRole("button", { name: "Look up customer", exact: true });
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("account_access");
    await button.click();
    await page.evaluate(() =>
      (window as unknown as FixtureWindow).renderLookup(
        "visible",
        "22222222-2222-4222-8222-222222222222",
      ),
    );
    await page.waitForFunction(() =>
      (document.querySelector("[name=expected_subject]") as HTMLInputElement).value.startsWith(
        "2222",
      ),
    );
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishLookup(value), {
      status: "found",
      message: "Found",
      customer: { subject, username: "test_customer", status: "active" },
    });
    assert.equal(await page.locator(".customer-lookup-result").count(), 0);
    assert.equal(await button.isDisabled(), true);
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject,
    });
    assert.equal(await button.isDisabled(), true, "wrong current subject cannot restore the form");
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
    );
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject: "22222222-2222-4222-8222-222222222222",
    });
    await page.waitForFunction(
      () => !(document.querySelector("button[type=submit]") as HTMLButtonElement).disabled,
    );
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("account_access");
    await button.click();
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide"));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishLookup(value), {
      status: "found",
      message: "Found",
      customer: { subject, username: "test_customer", status: "active" },
    });
    assert.equal(await page.locator(".customer-lookup-result").count(), 0);
    assert.equal(await button.isDisabled(), true);
    await page.evaluate(() => (window as unknown as FixtureWindow).unmountLookup());
    const calls = await page.evaluate(() => (window as unknown as FixtureWindow).sessionCalls);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new PageTransitionEvent("pageshow"));
    });
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).sessionCalls),
      calls,
      "listeners are scoped and cleaned up",
    );
  } finally {
    await browser.close();
  }
});

test("status controls are opt-in and require an explicit audited check before a confirmed opposite-status CAS", async () => {
  const { browser, page } = await renderedManager(true);
  const target = "33333333-3333-4333-8333-333333333333";
  try {
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("account_access");
    await page.getByRole("button", { name: "Look up customer", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishLookup(value), {
      status: "found",
      message: "Found",
      customer: { subject: target, username: "test_customer", status: "active" },
    });
    const check = page.getByRole("button", { name: "Check current access", exact: true });
    await check.waitFor({ timeout: 3000 });
    assert.match(await page.locator(".customer-lookup-result").innerText(), /Status at lookup/);
    assert.deepEqual(
      await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls),
      [],
    );
    assert.match(await page.locator(".customer-status-manager").innerText(), /application access/i);
    assert.match(await page.locator(".customer-status-manager").innerText(), /not.*(ban|revo)/i);
    await check.click();
    assert.deepEqual(
      await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls),
      [],
    );
    await page.getByLabel("Access change reason").selectOption("account_security");
    await check.click();
    await page
      .locator(".customer-status-form")
      .evaluate((form: HTMLFormElement) =>
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
    assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls), [
      {
        kind: "read",
        fields: [
          ["expected_subject", subject],
          ["target_subject", target],
          ["reason", "account_security"],
        ],
      },
    ]);
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
      status: "ready",
      message: "RAW PROVIDER SECRET",
      record: { subject: target, status: "active", revision: 7 },
    });
    const change = page.getByRole("button", { name: "Suspend application access", exact: true });
    await change.waitFor();
    assert.equal(await change.isDisabled(), true);
    for (const control of await page
      .locator(
        ".customer-status-manager button,.customer-status-manager input,.customer-status-manager select",
      )
      .all()) {
      assert.ok((await control.boundingBox())!.height >= 44, "status controls have 44px targets");
      assert.ok(
        await control.evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 16),
        "status controls use 16px type",
      );
    }
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "status review fits 320px",
    );
    await page.getByLabel("Confirm this application-access change").check();
    await change.click();
    assert.equal(await change.count(), 0);
    assert.equal(await check.isDisabled(), true);
    assert.deepEqual(
      (await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls))[1],
      {
        kind: "change",
        fields: [
          ["expected_subject", subject],
          ["target_subject", target],
          ["reason", "account_security"],
          ["revision", "7"],
          ["desired_status", "suspended"],
          ["confirm_change", "yes"],
        ],
      },
    );
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
      status: "success",
      message: "RAW PROVIDER SECRET",
      record: { subject: target, status: "suspended", revision: 8 },
    });
    await page
      .getByText("Application access updated. Check current access before another change.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".customer-status-record").count(), 0);
    assert.equal(await page.getByLabel("Confirm this application-access change").count(), 0);
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls.length),
      2,
    );
    assert.doesNotMatch(await page.locator("body").innerText(), /RAW PROVIDER SECRET/);
  } finally {
    await browser.close();
  }
});

test("status session action checks fresh status capability only with a writable user-scoped client", async () => {
  const adapter = await import("../../src/modules/customer-status/adapter.ts");
  const service = await import("../../src/modules/customer-status/service.ts");
  const active = (userId = subject, role = "admin") => ({
    status: "active",
    email: "fixture@example.invalid",
    actor: { userId, role, status: "active", aal: "aal2", hasVerifiedMfa: true },
  });
  let identity: unknown = active();
  let readiness: unknown = true;
  let clientFailure = false;
  let identityFailure = false;
  let rpcError: unknown = null;
  let identities = 0;
  const writes: boolean[] = [];
  const rpc: { name: string; args: unknown }[] = [];
  const exports: Record<string, () => Promise<unknown>> = {};
  const mocks: Record<string, unknown> = {
    "./adapter": adapter,
    "./service": service,
    "next/cache": { revalidatePath: () => assert.fail("self-readiness must not invalidate data") },
    "@/modules/identity/server": {
      getIdentity: async () => {
        identities++;
        if (identityFailure) throw new Error("RAW PROVIDER SECRET");
        return identity;
      },
    },
    "@/platform/supabase/server": {
      createIdentityClient: async (write: boolean) => {
        writes.push(write);
        if (clientFailure) throw new Error("RAW PROVIDER SECRET");
        return {
          rpc: async (name: string, args: unknown) => {
            rpc.push({ name, args });
            return { data: readiness, error: rpcError };
          },
        };
      },
    },
  };
  vm.runInNewContext(compile("src/modules/customer-status/actions.ts"), {
    exports,
    require: (id: string) => {
      assert.ok(id in mocks, `Unmapped status action dependency: ${id}`);
      return mocks[id];
    },
  });
  assert.equal(typeof exports.checkCustomerStatusSessionAction, "function");
  assert.equal(exports.checkCustomerStatusSessionAction.length, 0);
  const check = async () =>
    JSON.parse(JSON.stringify(await exports.checkCustomerStatusSessionAction()));
  assert.deepEqual(await check(), { status: "ready", subject });
  const changedSubject = "22222222-2222-4222-8222-222222222222";
  identity = active(changedSubject, "owner");
  assert.deepEqual(await check(), { status: "ready", subject: changedSubject });
  assert.equal(identities, 2, "identity is loaded per request, not retained from SSR");
  for (const [state, expected] of [
    [{ status: "guest" }, "guest"],
    [{ status: "mfa_required" }, "mfa_required"],
    [active(subject, "customer"), "denied"],
  ] as const) {
    identity = state;
    const count = rpc.length;
    assert.equal((await check()).status, expected);
    assert.equal(rpc.length, count, "unverified/non-staff callers cannot reach readiness RPC");
  }
  identity = active();
  for (const value of [false, null, { ready: true }]) {
    readiness = value;
    const result = await check();
    assert.equal(result.status, value === false ? "denied" : "unavailable");
  }
  readiness = true;
  rpcError = { message: "RAW PROVIDER SECRET" };
  assert.equal((await check()).status, "unavailable");
  rpcError = null;
  identityFailure = true;
  assert.equal((await check()).status, "unavailable");
  clientFailure = true;
  const failure = await check();
  assert.equal(failure.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(failure), /RAW PROVIDER SECRET/);
  assert.ok(writes.every((write) => write === true));
  assert.ok(rpc.length > 0);
  assert.ok(
    rpc.every((call) => call.name === "shopthie_customer_status_ready" && call.args === undefined),
    "no lookup capability, Customer read, audit, change or target arguments",
  );
});

test("development StrictMode replay makes a fresh status panel usable only after current self-readiness", async () => {
  const { browser, page } = await renderedManager(true, true, true);
  const target = "33333333-3333-4333-8333-333333333333";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject,
    });
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("account_access");
    await page.getByRole("button", { name: "Look up customer", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishLookup(value), {
      status: "found",
      message: "Found",
      customer: { subject: target, username: "test_customer", status: "active" },
    });
    const check = page.getByRole("button", { name: "Check current access", exact: true });
    await check.waitFor();
    assert.equal(await check.isDisabled(), true, "SSR props alone cannot renew the replay lease");
    assert.deepEqual(
      await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls),
      [],
    );
    await page.evaluate(
      (value) => (window as unknown as FixtureWindow).finishStatusSession(value),
      {
        status: "ready",
        subject,
      },
    );
    await page.waitForFunction(
      () => !(document.querySelector(".customer-status-form button") as HTMLButtonElement).disabled,
      undefined,
      { timeout: 1500 },
    );
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).statusSessionCalls),
      2,
      "installed development React must run setup, cleanup, setup",
    );
    // The pre-cleanup self-check may complete later, but must not replace current readiness.
    await page.evaluate(
      (value) => (window as unknown as FixtureWindow).finishStatusSession(value, 0),
      {
        status: "ready",
        subject: target,
      },
    );
    assert.equal(await check.isDisabled(), false);
    assert.equal(await page.getByLabel("Access change reason").inputValue(), "");
    await page.getByLabel("Access change reason").selectOption("account_security");
    await check.click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
      status: "ready",
      message: "Read",
      record: { subject: target, status: "active", revision: 4 },
    });
    await page.getByLabel("Confirm this application-access change").check();
    await page.getByRole("button", { name: "Suspend application access", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
      status: "success",
      message: "Updated",
      record: { subject: target, status: "suspended", revision: 5 },
    });
    await page
      .getByText("Application access updated. Check current access before another change.", {
        exact: true,
      })
      .waitFor();
    assert.deepEqual(
      (await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls)).map(
        (call) => call.kind,
      ),
      ["read", "change"],
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const developmentStrict of [false, true]) {
  const mode = developmentStrict ? "development StrictMode" : "production";
  test(`${mode}: preserved status panels renew only self-readiness, never retained context or late operations`, async () => {
    const { browser, page } = await renderedManager(false, developmentStrict, true);
    const target = "33333333-3333-4333-8333-333333333333";
    const otherActor = "22222222-2222-4222-8222-222222222222";
    const check = page.getByRole("button", { name: "Check current access", exact: true });
    const reason = page.getByLabel("Access change reason");
    const allow = async (actor = subject) => {
      await page.evaluate(
        (value) => (window as unknown as FixtureWindow).finishStatusSession(value),
        {
          status: "ready",
          subject: actor,
        },
      );
      await page.waitForFunction(
        () =>
          !(document.querySelector(".customer-status-form button") as HTMLButtonElement).disabled,
      );
    };
    const restore = async () => {
      await page.evaluate(() => (window as unknown as FixtureWindow).renderStatus("hidden"));
      await reason.waitFor({ state: "hidden" });
      await page.evaluate(() => {
        const frames: number[] = [];
        (window as unknown as { statusFrames: number[] }).statusFrames = frames;
        const sample = () => {
          frames.push(document.querySelectorAll(".customer-status-record").length);
          if (frames.length < 4) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        (window as unknown as FixtureWindow).renderStatus("visible");
      });
      await reason.waitFor();
    };
    const read = async () => {
      await reason.selectOption("account_review");
      await check.click();
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
        status: "ready",
        message: "Read",
        record: { subject: target, status: "active", revision: 2 },
      });
      await page.locator(".customer-status-record").waitFor();
    };
    try {
      await page.evaluate(() => (window as unknown as FixtureWindow).renderStatus("visible"));
      await reason.waitFor();
      await allow();
      await read();
      await page.getByLabel("Confirm this application-access change").check();
      await restore();
      assert.equal(await page.locator(".customer-status-record").count(), 0);
      assert.equal(await page.getByLabel("Confirm this application-access change").count(), 0);
      assert.equal(await reason.inputValue(), "");
      assert.equal(await check.isDisabled(), true, "restoration waits for a new self-check");
      await allow();
      await page.waitForFunction(
        () => (window as unknown as { statusFrames: number[] }).statusFrames.length === 4,
      );
      assert.deepEqual(
        await page.evaluate(() => (window as unknown as { statusFrames: number[] }).statusFrames),
        [0, 0, 0, 0],
      );
      assert.equal(await reason.inputValue(), "");
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls.length),
        1,
        "renewing self-readiness does not replay the target read",
      );

      await read();
      await page.getByLabel("Confirm this application-access change").check();
      await page.getByRole("button", { name: "Suspend application access", exact: true }).click();
      await restore();
      await allow();
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
        status: "success",
        message: "RAW PROVIDER SECRET",
        record: { subject: target, status: "suspended", revision: 3 },
      });
      assert.equal(await page.locator(".customer-status-record").count(), 0);
      assert.doesNotMatch(
        await page.locator(".customer-status-manager").innerText(),
        /Application access updated|RAW PROVIDER SECRET/,
      );
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls.length),
        3,
        "late writes are neither rendered nor retried after restoration",
      );

      await reason.selectOption("account_security");
      await check.click();
      const sessions = await page.evaluate(
        () => (window as unknown as FixtureWindow).statusSessionCalls,
      );
      await page.evaluate(
        (actor) => (window as unknown as FixtureWindow).renderStatus("visible", actor),
        otherActor,
      );
      await page.waitForFunction(
        (count) => (window as unknown as FixtureWindow).statusSessionCalls > count,
        sessions,
      );
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
        status: "ready",
        message: "Read",
        record: { subject: target, status: "active", revision: 2 },
      });
      await page.evaluate(
        (value) => (window as unknown as FixtureWindow).finishStatusSession(value),
        { status: "ready", subject },
      );
      assert.equal(
        await page.locator(".customer-status-record").count(),
        0,
        "old actor read is discarded",
      );
      assert.equal(await reason.inputValue(), "");
      assert.equal(await check.isDisabled(), true, "wrong current subject cannot renew the panel");
      const nextSessions = await page.evaluate(
        () => (window as unknown as FixtureWindow).statusSessionCalls,
      );
      await page.evaluate(
        (actor) =>
          (window as unknown as FixtureWindow).renderStatus(
            "visible",
            actor,
            "44444444-4444-4444-8444-444444444444",
          ),
        otherActor,
      );
      await page.waitForFunction(
        (count) => (window as unknown as FixtureWindow).statusSessionCalls > count,
        nextSessions,
      );
      await allow(otherActor);
      assert.equal(await reason.inputValue(), "");
      assert.equal(await page.locator(".customer-status-record").count(), 0);
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls.length),
        4,
      );
    } finally {
      await browser.close();
    }
  });
}

for (const developmentStrict of [false, true]) {
  const mode = developmentStrict ? "development StrictMode" : "production";
  test(`${mode}: status self-readiness fails closed and lifecycle invalidation defeats late self and target responses`, async () => {
    const { browser, page } = await renderedManager(false, developmentStrict, true);
    const reason = page.getByLabel("Access change reason");
    const check = page.getByRole("button", { name: "Check current access", exact: true });
    const settle = () =>
      page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    const restore = async () => {
      await page.evaluate(() => (window as unknown as FixtureWindow).renderStatus("hidden"));
      await reason.waitFor({ state: "hidden" });
      await page.evaluate(() => (window as unknown as FixtureWindow).renderStatus("visible"));
      await reason.waitFor();
    };
    try {
      await page.evaluate(() => (window as unknown as FixtureWindow).renderStatus("visible"));
      await reason.waitFor();
      for (const state of [
        null,
        { status: "guest" },
        { status: "mfa_required" },
        { status: "denied", message: "RAW PROVIDER SECRET" },
        { status: "unavailable", message: "RAW PROVIDER SECRET" },
        { status: "ready", subject: "22222222-2222-4222-8222-222222222222" },
        { status: "ready", subject, extra: "RAW PROVIDER SECRET" },
      ]) {
        await page.evaluate(
          (value) => (window as unknown as FixtureWindow).finishStatusSession(value),
          state,
        );
        await settle();
        assert.equal(await check.isDisabled(), true, JSON.stringify(state));
        assert.equal(await reason.inputValue(), "");
        await restore();
      }
      await page.evaluate(() =>
        (window as unknown as FixtureWindow).finishStatusSession(
          Object.assign(
            Object.create({ status: "ready", subject: "11111111-1111-4111-8111-111111111111" }),
            { a: true, b: true },
          ),
        ),
      );
      await settle();
      assert.equal(await check.isDisabled(), true, "inherited readiness is not an exact DTO");
      await restore();
      await page.evaluate(() => (window as unknown as FixtureWindow).rejectStatusSession());
      await settle();
      assert.equal(await check.isDisabled(), true, "rejected self-check remains closed");
      await restore();
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent("pagehide"));
        (window as unknown as FixtureWindow).finishStatusSession({
          status: "ready",
          subject: "11111111-1111-4111-8111-111111111111",
        });
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new StorageEvent("storage"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await settle();
      assert.equal(
        await check.isDisabled(),
        true,
        "pre-pagehide self-check cannot renew the lease",
      );
      assert.deepEqual(
        await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls),
        [],
      );
      assert.doesNotMatch(await page.locator("body").innerText(), /RAW PROVIDER SECRET/);

      await restore();
      await page.evaluate(
        (value) => (window as unknown as FixtureWindow).finishStatusSession(value),
        { status: "ready", subject },
      );
      await reason.selectOption("account_review");
      await check.click();
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
        status: "ready",
        message: "Read",
        record: { subject: "33333333-3333-4333-8333-333333333333", status: "active", revision: 0 },
      });
      await settle();
      assert.equal(await page.locator(".customer-status-record").count(), 0);
      assert.equal(await reason.inputValue(), "");
      assert.equal(await check.isDisabled(), true);
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls.length),
        1,
      );
      await restore();
      const sessions = await page.evaluate(
        () => (window as unknown as FixtureWindow).statusSessionCalls,
      );
      await page.evaluate(() => (window as unknown as FixtureWindow).unmountLookup());
      await page.evaluate(
        (value) => {
          (window as unknown as FixtureWindow).finishStatusSession(value);
          window.dispatchEvent(new Event("focus"));
          window.dispatchEvent(new PageTransitionEvent("pageshow"));
        },
        { status: "ready", subject },
      );
      await settle();
      assert.equal(await page.locator("#fixture").innerText(), "");
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).statusSessionCalls),
        sessions,
        "unmounted listeners cannot initiate another self-check",
      );
    } finally {
      await browser.close();
    }
  });
}

test("status errors, conflicts, ambiguous writes and malformed records require a deliberate fresh check without retries", async () => {
  const { browser, page } = await renderedManager();
  const target = "33333333-3333-4333-8333-333333333333";
  try {
    await page.evaluate(() => (window as unknown as FixtureWindow).renderStatus("visible"));
    const panel = page.locator(".customer-status-manager");
    const check = page.getByRole("button", { name: "Check current access", exact: true });
    await page.getByLabel("Access change reason").selectOption("customer_request");
    const record = { subject: target, status: "suspended", revision: 9 };
    for (const invalid of [
      {
        status: "ready",
        message: "RAW PROVIDER SECRET",
        record: { ...record, email: "private@example.invalid" },
      },
      { status: "ready", message: "RAW PROVIDER SECRET", record: { ...record, subject } },
      { status: "ready", message: "RAW PROVIDER SECRET", record: { ...record, revision: -1 } },
      { status: "conflict", message: "RAW PROVIDER SECRET", record },
    ]) {
      await check.click();
      await page.evaluate(
        (value) => (window as unknown as FixtureWindow).finishStatus(value),
        invalid,
      );
      await page.waitForFunction(
        () =>
          document.querySelector(".customer-status-form")?.getAttribute("aria-busy") === "false",
      );
      assert.equal(await page.locator(".customer-status-record").count(), 0);
      assert.match(await panel.innerText(), /could not be confirmed[\s\S]*Check current access/);
    }
    // A valid audited read is still mandatory before every retry of an ambiguous mutation.
    for (const response of [
      { status: "conflict", message: "RAW PROVIDER SECRET", record: null },
      {
        status: "success",
        message: "RAW PROVIDER SECRET",
        record: { ...record, status: "active" },
      },
      { status: "success", message: "RAW PROVIDER SECRET", record: { ...record, revision: 10 } },
      null,
    ]) {
      await check.click();
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
        status: "ready",
        message: "Read",
        record,
      });
      const change = page.getByRole("button", {
        name: "Reactivate application access",
        exact: true,
      });
      await change.waitFor();
      await page.getByLabel("Confirm this application-access change").check();
      await change.click();
      const calls = await page.evaluate(
        () => (window as unknown as FixtureWindow).statusCalls.length,
      );
      if (response === null)
        await page.evaluate(() => (window as unknown as FixtureWindow).rejectStatus());
      else
        await page.evaluate(
          (value) => (window as unknown as FixtureWindow).finishStatus(value),
          response,
        );
      await page.waitForFunction(
        () =>
          document.querySelector(".customer-status-form")?.getAttribute("aria-busy") === "false",
      );
      assert.equal(await page.locator(".customer-status-record").count(), 0);
      assert.equal(await page.getByLabel("Confirm this application-access change").count(), 0);
      assert.match(await panel.innerText(), /could not be confirmed[\s\S]*Check current access/);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls.length),
        calls,
        "no automatic reads or mutation retries",
      );
    }
    assert.doesNotMatch(await panel.innerText(), /RAW PROVIDER SECRET|private@example/);
    // A reason edit invalidates an outstanding response, without opening a duplicate-request window.
    await check.click();
    await page.getByLabel("Access change reason").selectOption("account_security");
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
      status: "ready",
      message: "Read",
      record,
    });
    assert.equal(await page.locator(".customer-status-record").count(), 0);
    await check.click();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
      status: "ready",
      message: "Read",
      record,
    });
    assert.equal(await page.locator(".customer-status-record").count(), 0);
    assert.equal(await check.isDisabled(), true);
  } finally {
    await browser.close();
  }
});

test("focus and session-change rechecks discard results, deny changed subjects and never requery Customer data", async () => {
  const { browser, page } = await renderedManager(true);
  const target = "33333333-3333-4333-8333-333333333333";
  try {
    await page.getByLabel("Exact username").fill("test_customer");
    await page.getByLabel("Lookup reason").selectOption("account_access");
    await page.getByRole("button", { name: "Look up customer", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishLookup(value), {
      status: "found",
      message: "Found",
      customer: { subject: target, username: "test_customer", status: "active" },
    });
    await page.getByLabel("Access change reason").selectOption("account_review");
    await page.getByRole("button", { name: "Check current access", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
      status: "ready",
      message: "Read",
      record: { subject: target, status: "active", revision: 0 },
    });
    await page.getByLabel("Confirm this application-access change").check();
    await page.getByRole("button", { name: "Suspend application access", exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishStatus(value), {
      status: "success",
      message: "RAW PROVIDER SECRET",
      record: { subject: target, status: "suspended", revision: 1 },
    });
    assert.equal(await page.locator(".customer-lookup-result,.customer-status-manager").count(), 0);
    const lookup = page.getByRole("button", { name: "Look up customer", exact: true });
    assert.equal(await lookup.isDisabled(), true);
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject: target,
    });
    assert.equal(await lookup.isDisabled(), true);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage")));
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject,
      extra: "RAW PROVIDER SECRET",
    });
    assert.equal(await lookup.isDisabled(), true, "overbroad session state fails closed");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "guest",
    });
    assert.equal(await lookup.isDisabled(), true);
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).lookupCalls.length),
      1,
    );
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).statusCalls.length),
      2,
    );
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally {
    await browser.close();
  }
});

test("RSC enables status only after lookup readiness for the same actor and subject-keys the manager", async () => {
  for (const statusState of [
    { status: "ready", subject },
    { status: "ready", subject: "22222222-2222-4222-8222-222222222222" },
    { status: "denied", message: "RAW PROVIDER SECRET" },
    new Error("RAW PROVIDER SECRET"),
  ]) {
    const loaded = route({ status: "ready", subject }, statusState);
    assert.equal(loaded.statusCalls(), 0);
    const tree = await content(loaded.page());
    const manager = elements(tree, "lookup")[0];
    assert.equal(
      manager.props.statusEnabled,
      "status" in statusState && statusState.status === "ready" && statusState.subject === subject,
    );
    assert.equal(manager.key, subject);
    assert.equal(loaded.statusCalls(), 1);
    assert.doesNotMatch(JSON.stringify(tree), /RAW PROVIDER SECRET/);
  }
  for (const state of [
    { status: "denied", message: "Unavailable" },
    { status: "guest" },
    { status: "mfa_required" },
  ]) {
    const loaded = route(state, { status: "ready", subject });
    try {
      await content(loaded.page());
    } catch (error) {
      assert.match(String(error), /redirect:/);
    }
    assert.equal(
      loaded.statusCalls(),
      0,
      "status readiness is never called before lookup readiness",
    );
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
