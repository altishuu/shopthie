import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const subject = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
type Tree = { type: unknown; props: Record<string, unknown>; key?: string };
const logout = async () => {};
function compile(path: string) {
  const url = new URL(path, root);
  assert.ok(existsSync(url), `${path} must exist`);
  return ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
function elements(node: unknown, type: unknown): Tree[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const tree = node as Tree;
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props.children, type)];
}
function route(state: unknown) {
  let calls = 0;
  const exports: Record<string, unknown> = {};
  const mocks: Record<string, unknown> = {
    "@/modules/identity/components/identity-shell": { IdentityShell: "shell" },
    "@/modules/identity/actions": { logoutAction: logout },
    "@/modules/audit-view/server": {
      getAuditViewPageState: async () => {
        calls++;
        return state;
      },
    },
    "@/modules/audit-view/components/audit-history-manager": { AuditHistoryManager: "audit" },
    "@/app/audit.css": {},
    "next/link": { default: "a" },
    "next/navigation": {
      redirect: (url: string) => {
        throw new Error(`redirect:${url}`);
      },
    },
  };
  vm.runInNewContext(compile("src/app/(staff)/admin/audit/page.tsx"), {
    exports,
    require: (id: string) => (id in mocks ? mocks[id] : require(id)),
  });
  return {
    page: exports.default as () => Tree,
    metadata: exports.metadata as { robots: { index: boolean; follow: boolean } },
    calls: () => calls,
  };
}
async function content(shell: Tree) {
  assert.equal(shell.type, "shell");
  const boundary = shell.props.children as Tree;
  assert.equal(boundary.type, Symbol.for("react.suspense"));
  const child = boundary.props.children as Tree;
  return (child.type as () => Promise<Tree>)();
}

// Explicit action fixtures only; installed React/ReactDOM and the real policy run
// in Chromium. These are not proof of native staff authorization.
type FixtureWindow = Window & {
  auditSessions: number;
  auditCalls: [string, string][][];
  finishSession: (value: unknown, index?: number) => void;
  rejectSession: () => void;
  finishPage: (value: unknown, index?: number) => void;
  rejectPage: () => void;
  renderAudit: (mode: "visible" | "hidden", actor?: string, scope?: "own" | "all") => void;
  unmountAudit: () => void;
};
async function renderedManager(developmentStrict = false) {
  const component = compile("src/modules/audit-view/components/audit-history-manager.tsx");
  const { chromium } = require("@playwright/test") as typeof import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const modules: Record<string, string> = {
    manager: component,
    "../policy": compile("src/modules/audit-view/policy.ts"),
  };
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
  await page.route("http://audit-fixture.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<main><h1>TEST fixture — not native staff proof</h1><section class="identity-panel" id="fixture"></section></main>',
    }),
  );
  await page.goto("http://audit-fixture.invalid/");
  await page.addStyleTag({
    content:
      "*{box-sizing:border-box}body{margin:16px}" +
      readFileSync(new URL("src/app/identity.css", root), "utf8"),
  });
  const css = new URL("src/app/audit.css", root);
  if (existsSync(css)) await page.addStyleTag({ content: readFileSync(css, "utf8") });
  await page.addScriptTag({
    content: `(() => {
    const sources = ${JSON.stringify(modules)}, cache = {}, sessions = [], pages = [];
    window.auditSessions = 0; window.auditCalls = [];
    window.finishSession = (value, index = sessions.length - 1) => sessions[index]?.resolve(value);
    window.rejectSession = () => sessions.at(-1)?.reject(new Error('RAW PROVIDER SECRET'));
    window.finishPage = (value, index = pages.length - 1) => pages[index]?.resolve(value);
    window.rejectPage = () => pages.at(-1)?.reject(new Error('RAW PROVIDER SECRET'));
    const checkAuditViewSessionAction = async (...args) => {
      if(args.length) throw new Error('Self-readiness takes no arguments');
      window.auditSessions++; return new Promise((resolve,reject) => sessions.push({resolve,reject}));
    };
    const loadAuditEventsAction = async data => {
      window.auditCalls.push(Array.from(data.entries()));
      return new Promise((resolve,reject) => pages.push({resolve,reject}));
    };
    function require(id) {
      if(id === '../actions') return {checkAuditViewSessionAction, loadAuditEventsAction};
      if(cache[id]) return cache[id].exports;
      if(!sources[id]) throw new Error('Unmapped real module: ' + id);
      const module = {exports:{}}; cache[id] = module;
      new Function('module','exports','require','process', sources[id])(module,module.exports,require,{env:{NODE_ENV:${JSON.stringify(environment)}}});
      return module.exports;
    }
    const React = require('react'), root = require('react-dom/client').createRoot(document.getElementById('fixture'));
    window.renderAudit = (mode, subject = ${JSON.stringify(subject)}, scope = 'own') => {
      const child = React.createElement(React.Activity,{mode},React.createElement(require('manager').AuditHistoryManager,{subject,scope}));
      root.render(${developmentStrict} ? React.createElement(React.StrictMode,null,child) : child);
    };
    window.unmountAudit = () => root.unmount();
    window.renderAudit('visible');
  })();`,
  });
  await page.getByRole("button", { name: "Load recent events", exact: true }).waitFor();
  return { browser, page, errors };
}

for (const strict of [false, true]) {
  test(`${strict ? "development StrictMode" : "production"}: starts empty/disabled and renews only current exact self-readiness`, async () => {
    const { browser, page, errors } = await renderedManager(strict);
    try {
      const recent = page.getByRole("button", { name: "Load recent events", exact: true });
      assert.equal(await recent.isDisabled(), true);
      assert.equal(await page.locator("[data-audit-event]").count(), 0);
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).auditSessions),
        strict ? 2 : 1,
      );
      assert.deepEqual(
        await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls),
        [],
      );
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
        status: "ready",
        subject,
        scope: "own",
      });
      await page.waitForFunction(
        () =>
          !(document.querySelector(".audit-history-controls button") as HTMLButtonElement).disabled,
      );
      if (strict) {
        await page.evaluate(
          (value) => (window as unknown as FixtureWindow).finishSession(value, 0),
          { status: "ready", subject: other, scope: "all" },
        );
        assert.equal(await recent.isDisabled(), false, "discard the pre-replay response");
      }
      assert.deepEqual(
        await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls),
        [],
      );
      assert.equal(await page.locator("form").count(), 0, "event reads have no reusable form");
      assert.match(await page.locator("body").innerText(), /only your own/i);
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

function samplePage(count = 20) {
  const events = Array.from({ length: count }, (_, i) => ({
    id: `33333333-3333-4333-8333-${(100 - i).toString().padStart(12, "0")}`,
    actorSubject: subject,
    targetSubject: other,
    eventType: "customer.lookup",
    reason: "profile_help",
    outcome: "found",
    createdAt: "2026-10-29T12:30:00.123456Z",
  }));
  const last = events.at(-1);
  return {
    scope: "own",
    events,
    nextCursor: count === 20 && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

test("explicit recent/older reads submit only raw cursor fields once and replace the fixed page", async () => {
  const { browser, page, errors } = await renderedManager();
  try {
    const recent = page.getByRole("button", { name: "Load recent events", exact: true });
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject,
      scope: "own",
    });
    await recent.click();
    assert.equal(await recent.isDisabled(), true);
    await recent.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls), [
      [
        ["expected_subject", subject],
        ["cursor_created_at", ""],
        ["cursor_id", ""],
      ],
    ]);
    const first = samplePage();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
      status: "ready",
      message: "RAW PROVIDER SECRET",
      page: first,
    });
    await page.locator("[data-audit-event]").first().waitFor({ timeout: 2000 });
    assert.equal(await page.locator("[data-audit-event]").count(), 20);
    assert.equal(await page.locator(".audit-history-controls button").count(), 2);
    for (const control of await page.locator(".audit-history-controls button").all()) {
      assert.ok((await control.boundingBox())!.height >= 44);
      assert.ok(
        await control.evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 16),
      );
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.match(
      await page.locator("body").innerText(),
      /Customer lookup[\s\S]*Profile help[\s\S]*Found/,
    );
    assert.match(await page.locator("time").first().innerText(), /UTC/);
    assert.equal(
      await page.locator("time").first().getAttribute("datetime"),
      first.events[0].createdAt,
    );
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /RAW PROVIDER SECRET|customer\.lookup|profile_help/,
    );
    assert.equal(await page.locator("a,input,select,form").count(), 0);
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls.length),
      1,
      "no automatic pagination",
    );
    await page.getByRole("button", { name: "Older events", exact: true }).click();
    assert.equal(
      await page.locator("[data-audit-event]").count(),
      0,
      "clear immediately, never append",
    );
    assert.deepEqual(
      (await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls))[1],
      [
        ["expected_subject", subject],
        ["cursor_created_at", first.nextCursor!.createdAt],
        ["cursor_id", first.nextCursor!.id],
      ],
    );
    const older = {
      ...samplePage(1),
      events: [
        {
          ...samplePage(1).events[0],
          createdAt: "2026-10-29T12:30:00.123455Z",
          targetSubject: null,
          outcome: "not_found",
        },
      ],
    };
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
      status: "ready",
      message: "Done",
      page: older,
    });
    await page.getByText("No match", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-audit-event]").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Older events", exact: true }).count(), 0);
    await recent.click();
    assert.deepEqual(
      (await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls))[2],
      [
        ["expected_subject", subject],
        ["cursor_created_at", ""],
        ["cursor_id", ""],
      ],
    );
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
      status: "ready",
      message: "Done",
      page: { scope: "own", events: [], nextCursor: null },
    });
    await page.getByText("No supported events in this page.", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-audit-event]").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const strict of [false, true]) {
  test(`${strict ? "development StrictMode" : "production"}: Activity/browser restoration drops pages/cursors/pending responses and self-revalidates`, async () => {
    const { browser, page, errors } = await renderedManager(strict);
    const recent = page.getByRole("button", { name: "Load recent events", exact: true });
    const allow = async (actor = subject, scope: "own" | "all" = "own") => {
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
        status: "ready",
        subject: actor,
        scope,
      });
      await page.waitForFunction(
        () =>
          !(document.querySelector(".audit-history-controls button") as HTMLButtonElement).disabled,
      );
    };
    const read = async () => {
      await recent.click();
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
        status: "ready",
        message: "Done",
        page: samplePage(),
      });
      await page.locator("[data-audit-event]").first().waitFor();
    };
    const restore = async () => {
      await page.evaluate(() => (window as unknown as FixtureWindow).renderAudit("hidden"));
      await recent.waitFor({ state: "hidden" });
      await page.evaluate(() => {
        const frames: number[] = [];
        (window as unknown as { auditFrames: number[] }).auditFrames = frames;
        const sample = () => {
          frames.push(document.querySelectorAll("[data-audit-event]").length);
          if (frames.length < 4) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        (window as unknown as FixtureWindow).renderAudit("visible");
      });
      await recent.waitFor();
      assert.equal(await page.locator("[data-audit-event]").count(), 0);
      assert.equal(
        await page.getByRole("button", { name: "Older events", exact: true }).count(),
        0,
      );
      assert.equal(await recent.isDisabled(), true);
    };
    try {
      await allow();
      await read();
      await restore();
      await allow();
      await page.waitForFunction(
        () => (window as unknown as { auditFrames: number[] }).auditFrames.length === 4,
      );
      assert.deepEqual(
        await page.evaluate(() => (window as unknown as { auditFrames: number[] }).auditFrames),
        [0, 0, 0, 0],
      );
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls.length),
        1,
      );
      await recent.click();
      await restore();
      await allow();
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
        status: "ready",
        message: "Late",
        page: samplePage(),
      });
      assert.equal(await page.locator("[data-audit-event]").count(), 0);
      for (const event of ["focus", "storage", "visibilitychange", "pageshow", "pagehide"]) {
        await read();
        const sessions = await page.evaluate(
          () => (window as unknown as FixtureWindow).auditSessions,
        );
        await page.evaluate((name) => {
          if (name === "visibilitychange") document.dispatchEvent(new Event(name));
          else window.dispatchEvent(new Event(name));
        }, event);
        assert.equal(
          await page.locator("[data-audit-event]").count(),
          0,
          `${event} clears records immediately`,
        );
        assert.equal(await recent.isDisabled(), true);
        if (event === "pagehide") {
          assert.equal(
            await page.evaluate(() => (window as unknown as FixtureWindow).auditSessions),
            sessions,
            "pagehide must not renew",
          );
          await page.evaluate(() =>
            window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
          );
        }
        await page.waitForFunction(
          (count) => (window as unknown as FixtureWindow).auditSessions > count,
          sessions,
        );
        await allow();
        assert.equal(
          await page.locator("[data-audit-event]").count(),
          0,
          "self-readiness never reloads data",
        );
      }
      await recent.click();
      const sessions = await page.evaluate(
        () => (window as unknown as FixtureWindow).auditSessions,
      );
      await page.evaluate(
        (actor) => (window as unknown as FixtureWindow).renderAudit("visible", actor, "all"),
        other,
      );
      await page.waitForFunction(
        (count) => (window as unknown as FixtureWindow).auditSessions > count,
        sessions,
      );
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
        status: "ready",
        message: "Late",
        page: samplePage(),
      });
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
        status: "ready",
        subject,
        scope: "own",
      });
      assert.equal(await recent.isDisabled(), true);
      assert.equal(await page.locator("[data-audit-event]").count(), 0);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await allow(other, "all");
      assert.match(await page.locator("body").innerText(), /across all actors/);
      const beforeScope = await page.evaluate(
        () => (window as unknown as FixtureWindow).auditSessions,
      );
      await page.evaluate(
        (actor) => (window as unknown as FixtureWindow).renderAudit("visible", actor, "own"),
        other,
      );
      await page.waitForFunction(
        (count) => (window as unknown as FixtureWindow).auditSessions > count,
        beforeScope,
      );
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
        status: "ready",
        subject: other,
        scope: "all",
      });
      assert.equal(await recent.isDisabled(), true, "old scope readiness cannot enable new scope");
      const beforeUnmount = await page.evaluate(
        () => (window as unknown as FixtureWindow).auditSessions,
      );
      await page.evaluate(() => (window as unknown as FixtureWindow).unmountAudit());
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new Event("pageshow"));
      });
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).auditSessions),
        beforeUnmount,
      );
      assert.equal(await page.locator("#fixture").innerText(), "");
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

test("self-readiness denial/malformed states fail closed with safe exits messaging, not an endless check", async () => {
  const { browser, page, errors } = await renderedManager(true);
  const settle = () =>
    page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  try {
    for (const state of [
      null,
      { status: "guest" },
      { status: "mfa_required" },
      { status: "denied", message: "RAW PROVIDER SECRET" },
      { status: "unavailable", message: "RAW PROVIDER SECRET" },
      { status: "ready", subject: other, scope: "own" },
      { status: "ready", subject, scope: "all" },
      { status: "ready", subject, scope: "own", extra: "private@example.invalid" },
      { status: "ready", subject: `${subject}\n`, scope: "own" },
    ]) {
      await page.evaluate(
        (value) => (window as unknown as FixtureWindow).finishSession(value),
        state,
      );
      await settle();
      assert.equal(
        await page.getByRole("button", { name: "Load recent events", exact: true }).isDisabled(),
        true,
      );
      assert.match(await page.getByRole("status").innerText(), /could not be confirmed/i);
      assert.equal(await page.locator("[data-audit-event],form").count(), 0);
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /RAW PROVIDER SECRET|private@example/,
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    }
    await page.evaluate(() =>
      (window as unknown as FixtureWindow).finishSession(
        Object.assign(
          Object.create({
            status: "ready",
            subject: "11111111-1111-4111-8111-111111111111",
            scope: "own",
          }),
          { a: 1, b: 2, c: 3 },
        ),
      ),
    );
    await settle();
    assert.equal(
      await page.getByRole("button", { name: "Load recent events", exact: true }).isDisabled(),
      true,
    );
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      (window as unknown as FixtureWindow).rejectSession();
    });
    await settle();
    assert.match(await page.getByRole("status").innerText(), /could not be confirmed/i);
    assert.deepEqual(
      await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls),
      [],
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("runtime action/page/event validation rejects expanded, foreign, unordered and malformed payloads without PII or retry", async () => {
  const { browser, page, errors } = await renderedManager();
  const first = samplePage(1),
    event = first.events[0];
  const good = { status: "ready", message: "RAW PROVIDER SECRET", page: first };
  const badEvents = [
    { ...event, email: "private@example.invalid" },
    { ...event, actorSubject: other },
    { ...event, actorSubject: null },
    { ...event, id: `${event.id}\n` },
    { ...event, eventType: "future.secret" },
    { ...event, reason: "free text private@example.invalid" },
    { ...event, outcome: "deleted" },
    { ...event, targetSubject: null },
    { ...event, outcome: "not_found" },
    {
      ...event,
      eventType: "customer.status.read",
      reason: "account_security",
      outcome: "read",
      targetSubject: null,
    },
    { ...event, createdAt: "2026-02-30T12:30:00.123456Z" },
    { ...event, createdAt: "2026-10-29T12:30:00.123Z" },
    { ...event, createdAt: "2026-10-29T12:30:00.123456Z\n" },
  ];
  const invalid: unknown[] = [
    null,
    { ...good, extra: "private@example.invalid" },
    { ...good, message: 123 },
    { ...good, status: "error" },
    { ...good, status: "error", page: null },
    { ...good, status: "success" },
    { ...good, page: { ...first, scope: "all" } },
    { ...good, page: { ...first, private: "private@example.invalid" } },
    { ...good, page: { ...first, events: [...samplePage().events, event] } },
    { ...good, page: { ...first, events: [event, event] } },
    { ...good, page: { ...first, events: samplePage(2).events.toReversed() } },
    { ...good, page: { ...first, nextCursor: { id: event.id, createdAt: event.createdAt } } },
    {
      ...good,
      page: { ...samplePage(), nextCursor: { id: event.id, createdAt: event.createdAt } },
    },
    ...badEvents.map((row) => ({ ...good, page: { ...first, events: [row] } })),
  ];
  try {
    for (const value of invalid) {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.evaluate((state) => (window as unknown as FixtureWindow).finishSession(state), {
        status: "ready",
        subject,
        scope: "own",
      });
      await page.getByRole("button", { name: "Load recent events", exact: true }).click();
      await page.evaluate(
        (result) => (window as unknown as FixtureWindow).finishPage(result),
        value,
      );
      await page
        .getByText(
          "Audit history could not be loaded. Return to staff entry to check current access.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await page.locator("[data-audit-event],form").count(), 0, JSON.stringify(value));
      assert.equal(
        await page.getByRole("button", { name: "Older events", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "Load recent events", exact: true }).isDisabled(),
        true,
      );
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /RAW PROVIDER SECRET|private@example/,
      );
    }
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.evaluate((state) => (window as unknown as FixtureWindow).finishSession(state), {
      status: "ready",
      subject,
      scope: "own",
    });
    await page.getByRole("button", { name: "Load recent events", exact: true }).click();
    await page.evaluate(() => (window as unknown as FixtureWindow).rejectPage());
    await page
      .getByText(
        "Audit history could not be loaded. Return to staff entry to check current access.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls.length),
      invalid.length + 1,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("320px opaque IDs, all supported labels and controls fit without contact links or flexible page inputs", async () => {
  assert.ok(
    existsSync(new URL("src/app/audit.css", root)),
    "audit-only responsive styles must exist",
  );
  const { browser, page, errors } = await renderedManager();
  try {
    await page.evaluate(() =>
      (window as unknown as FixtureWindow).renderAudit("visible", undefined, "all"),
    );
    await page.evaluate((state) => (window as unknown as FixtureWindow).finishSession(state), {
      status: "ready",
      subject,
      scope: "all",
    });
    await page.getByRole("button", { name: "Load recent events", exact: true }).click();
    const source = samplePage(5);
    const events = source.events.map((event, index) => ({
      ...event,
      actorSubject: other,
      ...[
        { eventType: "customer.lookup", reason: "account_access", outcome: "found" },
        { eventType: "customer.status.read", reason: "account_security", outcome: "read" },
        { eventType: "customer.status.change", reason: "customer_request", outcome: "active" },
        { eventType: "customer.status.change", reason: "account_review", outcome: "suspended" },
        {
          eventType: "customer.lookup",
          reason: "address_help",
          outcome: "not_found",
          targetSubject: null,
        },
      ][index],
    }));
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
      status: "ready",
      message: "Done",
      page: { scope: "all", events, nextCursor: null },
    });
    await page.locator("[data-audit-event]").first().waitFor();
    assert.equal(await page.locator("[data-audit-event]").count(), 5);
    const body = await page.locator("body").innerText();
    for (const label of [
      "Customer lookup",
      "Account access",
      "Application access check",
      "Application access change",
      "Account security",
      "Customer request",
      "Account review",
      "Address help",
      "Read",
      "Active",
      "Suspended",
      "Not found",
      "No match",
    ])
      assert.ok(body.includes(label), label);
    for (const control of await page.locator("button").all()) {
      assert.ok((await control.boundingBox())!.height >= 44);
      assert.ok(
        await control.evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 16),
      );
    }
    assert.equal(await page.locator("input,select,form,a").count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("pagehide defeats late self-readiness and visibility-hidden cannot renew a capability", async () => {
  const { browser, page, errors } = await renderedManager(true);
  try {
    await page.evaluate(
      (value) => {
        window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
        (window as unknown as FixtureWindow).finishSession(value);
      },
      { status: "ready", subject, scope: "own" },
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(
      await page.getByRole("button", { name: "Load recent events", exact: true }).isDisabled(),
      true,
    );
    const calls = await page.evaluate(() => (window as unknown as FixtureWindow).auditSessions);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    assert.equal(
      await page.evaluate(() => (window as unknown as FixtureWindow).auditSessions),
      calls,
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject,
      scope: "own",
    });
    await page.waitForFunction(
      () =>
        !(document.querySelector(".audit-history-controls button") as HTMLButtonElement).disabled,
    );
    assert.equal(await page.locator("[data-audit-event]").count(), 0);
    assert.deepEqual(
      await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls),
      [],
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("older response must respect its submitted exclusive boundary, never normalize microseconds", async () => {
  const { browser, page, errors } = await renderedManager();
  try {
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
      status: "ready",
      subject,
      scope: "own",
    });
    await page.getByRole("button", { name: "Load recent events", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
      status: "ready",
      message: "Done",
      page: samplePage(),
    });
    await page.getByRole("button", { name: "Older events", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishPage(value), {
      status: "ready",
      message: "RAW PROVIDER SECRET",
      page: samplePage(1),
    });
    await page
      .getByText(
        "Audit history could not be loaded. Return to staff entry to check current access.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.locator("[data-audit-event],form").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Older events", exact: true }).count(), 0);
    const calls = await page.evaluate(() => (window as unknown as FixtureWindow).auditCalls);
    assert.equal(calls.length, 2);
    assert.equal(calls[1][1][1], "2026-10-29T12:30:00.123456Z");
    assert.doesNotMatch(await page.locator("body").innerText(), /RAW PROVIDER SECRET/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("audit route is request-scoped/noindex with subject+scope keyed manager and direct exits", async () => {
  for (const scope of ["own", "all"]) {
    const loaded = route({ status: "ready", subject, scope });
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.metadata.robots)), {
      index: false,
      follow: false,
    });
    const shell = loaded.page();
    assert.equal(loaded.calls(), 0);
    const tree = await content(shell);
    assert.equal(loaded.calls(), 1);
    const manager = elements(tree, "audit")[0];
    assert.equal(manager.props.subject, subject);
    assert.equal(manager.props.scope, scope);
    assert.equal(manager.key, `${subject}:${scope}`);
    assert.deepEqual(
      elements(tree, "a")
        .map((link) => link.props.href)
        .sort(),
      ["/account", "/account/security", "/admin"],
    );
    assert.ok(elements(tree, "a").every((link) => link.props.prefetch === false));
    assert.ok(elements(tree, "form").some((form) => form.props.action === logout));
    assert.match(JSON.stringify(tree), /not a complete security or compliance log/i);
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
  for (const status of ["denied", "unavailable"]) {
    const loaded = route({ status, message: "RAW PROVIDER SECRET" });
    const tree = await content(loaded.page());
    assert.equal(elements(tree, "audit").length, 0);
    assert.equal(elements(tree, "form").filter((form) => form.props.action !== logout).length, 0);
    assert.equal(elements(tree, "[data-audit-event]").length, 0);
    assert.doesNotMatch(JSON.stringify(tree), /RAW PROVIDER SECRET/);
  }
});
