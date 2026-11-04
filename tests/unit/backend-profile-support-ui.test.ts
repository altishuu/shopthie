import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const subject = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const username = "Test_Customer";
const phone = "+12025550123"; // TEST-only fictional phone, never a native account read.
function compile(path: string) {
  const url = new URL(path, root);
  assert.ok(existsSync(url), `${path} must exist`);
  return ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
type FixtureWindow = Window & {
  sessions: number;
  calls: [string, string][][];
  finishSession: (value: unknown, index?: number) => void;
  rejectSession: () => void;
  finishRead: (value: unknown, index?: number) => void;
  rejectRead: () => void;
  renderProfile: (
    mode: "visible" | "hidden",
    actor?: string,
    customer?: string,
    name?: string,
  ) => void;
  unmountProfile: () => void;
  profileFrames: number[];
};
// Positive SDK/action UI fixtures only: real installed React/Chromium + real policy
// in memory. No application source copies, build, provider login or native staff proof.
async function renderedManager(strict = false) {
  const modules: Record<string, string> = {
    manager: compile("src/modules/profile-support/components/profile-support-manager.tsx"),
    "../policy": compile("src/modules/profile-support/policy.ts"),
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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("http://profile-fixture.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<main><h1>TEST UI fixture — not native staff proof</h1><section class="identity-panel" id="fixture"></section></main>',
    }),
  );
  await page.goto("http://profile-fixture.invalid/");
  await page.addStyleTag({
    content:
      "*{box-sizing:border-box}body{margin:16px}" +
      readFileSync(new URL("src/app/identity.css", root), "utf8"),
  });
  if (existsSync(new URL("src/app/profile-support.css", root)))
    await page.addStyleTag({
      content: readFileSync(new URL("src/app/profile-support.css", root), "utf8"),
    });
  await page.addScriptTag({
    content: `(() => {
    const sources = ${JSON.stringify(modules)}, cache = {}, sessions = [], reads = [];
    window.sessions = 0; window.calls = [];
    window.finishSession = (value, index = sessions.length - 1) => sessions[index]?.resolve(value);
    window.rejectSession = () => sessions.at(-1)?.reject(new Error('RAW PROVIDER SECRET'));
    window.finishRead = (value, index = reads.length - 1) => reads[index]?.resolve(value);
    window.rejectRead = () => reads.at(-1)?.reject(new Error('RAW PROVIDER SECRET'));
    const checkProfileSupportSessionAction = async (...args) => {
      if(args.length) throw new Error('Self-only readiness has zero arguments');
      window.sessions++; return new Promise((resolve,reject) => sessions.push({resolve,reject}));
    };
    const loadProfileSupportAction = async data => {
      window.calls.push(Array.from(data.entries()));
      return new Promise((resolve,reject) => reads.push({resolve,reject}));
    };
    function require(id) {
      if(id === '../actions') return {checkProfileSupportSessionAction,loadProfileSupportAction};
      if(cache[id]) return cache[id].exports;
      if(!sources[id]) throw new Error('Unmapped real module: ' + id);
      const module = {exports:{}}; cache[id] = module;
      new Function('module','exports','require','process',sources[id])(module,module.exports,require,{env:{NODE_ENV:${JSON.stringify(environment)}}});
      return module.exports;
    }
    const React = require('react'), root = require('react-dom/client').createRoot(document.getElementById('fixture'));
    window.renderProfile = (mode, subject = ${JSON.stringify(subject)}, customerSubject = ${JSON.stringify(target)}, username = ${JSON.stringify(username)}) => {
      const child = React.createElement(React.Activity,{mode},React.createElement(require('manager').ProfileSupportManager,{subject,customerSubject,username}));
      root.render(${strict} ? React.createElement(React.StrictMode,null,child) : child);
    };
    window.unmountProfile = () => root.unmount();
    window.renderProfile('visible');
  })();`,
  });
  await page
    .getByRole("button", { name: "View profile support", exact: true })
    .waitFor({ timeout: 2000 });
  return { browser, page, errors };
}
const ready = { status: "ready", subject };
const good = {
  status: "ready",
  message: "RAW PROVIDER SECRET",
  profile: { subject: target, username, phone },
};
type FixturePage = Awaited<ReturnType<typeof renderedManager>>["page"];
const settle = (page: FixturePage) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
async function allow(page: FixturePage, actor = subject) {
  await page.evaluate((value) => (window as unknown as FixtureWindow).finishSession(value), {
    status: "ready",
    subject: actor,
  });
  await page.waitForFunction(
    () =>
      !(document.querySelector(".profile-support-manager select") as HTMLSelectElement).disabled,
  );
}

test("explicit THIS-panel reason and click disclose only a bound phone, including null, without raw diagnostics or automatic reads", async () => {
  const { browser, page, errors } = await renderedManager();
  try {
    await allow(page);
    const button = page.getByRole("button", { name: "View profile support", exact: true });
    await button.click();
    await page
      .locator("form")
      .evaluate((form: HTMLFormElement) =>
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
    assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).calls), []);
    await page.getByLabel("Profile support reason").selectOption("profile_help");
    assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).calls), []);
    await button.click();
    assert.equal(await button.isDisabled(), true);
    await page
      .locator("form")
      .evaluate((form: HTMLFormElement) =>
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
    assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).calls), [
      [
        ["expected_subject", subject],
        ["target_subject", target],
        ["username", username],
        ["reason", "profile_help"],
      ],
    ]);
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishRead(value), good);
    await page.locator("[data-profile-support-record]").waitFor({ timeout: 1500 });
    assert.match(
      await page.locator("[data-profile-support-record]").innerText(),
      /Phone[\s\S]*\+12025550123/,
    );
    assert.match(
      await page.locator("body").innerText(),
      /customer-supplied[\s\S]*unverified[\s\S]*not identity proof/i,
    );
    assert.doesNotMatch(await page.locator("body").innerText(), /RAW PROVIDER SECRET/);
    assert.equal(await page.locator("a,input,textarea").count(), 0);
    assert.equal(await page.getByRole("button").count(), 1, "no copy/export/contact action");
    await page.getByLabel("Profile support reason").selectOption("");
    assert.equal(await page.locator("[data-profile-support-record]").count(), 0);
    await page.getByLabel("Profile support reason").selectOption("profile_help");
    await button.click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishRead(value), {
      ...good,
      profile: { ...good.profile, phone: null },
    });
    await page.getByText("Not provided", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).calls.length), 2);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const strict of [false, true]) {
  test(`${strict ? "development StrictMode" : "production"}: Activity and browser restoration clear all disclosure state and defeat late reads/self-checks`, async () => {
    const { browser, page, errors } = await renderedManager(strict);
    const button = page.getByRole("button", { name: "View profile support", exact: true });
    const reason = page.getByLabel("Profile support reason");
    const read = async () => {
      await reason.selectOption("profile_help");
      await button.click();
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishRead(value), good);
      await page.locator("[data-profile-support-record]").waitFor();
    };
    const empty = async () => {
      assert.equal(await page.locator("[data-profile-support-record]").count(), 0);
      assert.equal(await reason.inputValue(), "");
      assert.equal(await button.isDisabled(), true);
      assert.equal(await page.locator("form").getAttribute("aria-busy"), "false");
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /\+12025550123|Profile support loaded/,
      );
    };
    const restore = async () => {
      await page.evaluate(() => (window as unknown as FixtureWindow).renderProfile("hidden"));
      await reason.waitFor({ state: "hidden" });
      await page.evaluate(() => {
        const fixture = window as unknown as FixtureWindow;
        fixture.profileFrames = [];
        const sample = () => {
          fixture.profileFrames.push(
            document.querySelectorAll("[data-profile-support-record]").length,
          );
          if (fixture.profileFrames.length < 4) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        fixture.renderProfile("visible");
      });
      await reason.waitFor();
      await empty();
    };
    try {
      await allow(page);
      await read();
      await restore();
      await page.waitForFunction(
        () => (window as unknown as FixtureWindow).profileFrames.length === 4,
      );
      assert.deepEqual(
        await page.evaluate(() => (window as unknown as FixtureWindow).profileFrames),
        [0, 0, 0, 0],
      );
      await allow(page);
      assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).calls.length), 1);
      await reason.selectOption("profile_help");
      await button.click();
      await restore();
      await allow(page);
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishRead(value), good);
      assert.equal(await page.locator("[data-profile-support-record]").count(), 0);
      for (const event of ["focus", "storage", "visibilitychange", "pageshow", "pagehide"]) {
        await read();
        const before = await page.evaluate(() => (window as unknown as FixtureWindow).sessions);
        const immediate = await page.evaluate((name) => {
          (name === "visibilitychange" ? document : window).dispatchEvent(new Event(name));
          return document.querySelectorAll("[data-profile-support-record]").length;
        }, event);
        assert.equal(immediate, 0, `${event}: clear before returning to browser`);
        await empty();
        if (event === "pagehide") {
          assert.equal(
            await page.evaluate(() => (window as unknown as FixtureWindow).sessions),
            before,
          );
          await page.evaluate(() =>
            window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
          );
        }
        await allow(page);
        assert.equal(await page.locator("[data-profile-support-record]").count(), 0);
      }
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
        (window as unknown as FixtureWindow).finishSession({
          status: "ready",
          subject: "11111111-1111-4111-8111-111111111111",
        });
      });
      await settle(page);
      await empty();
      const beforeHidden = await page.evaluate(() => (window as unknown as FixtureWindow).sessions);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).sessions),
        beforeHidden,
      );
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await allow(page);
      await reason.selectOption("profile_help");
      await button.click();
      await page.evaluate(() => window.dispatchEvent(new Event("storage")));
      await page.evaluate((value) => (window as unknown as FixtureWindow).finishRead(value), good);
      await empty();
      await allow(page);
      for (const [actor, customer, name] of [
        [subject, other, username],
        [subject, other, "Different_Name"],
        [other, target, username],
      ]) {
        await reason.selectOption("profile_help");
        await button.click();
        const sessions = await page.evaluate(() => (window as unknown as FixtureWindow).sessions);
        await page.evaluate(
          ([a, t, n]) => (window as unknown as FixtureWindow).renderProfile("visible", a, t, n),
          [actor, customer, name],
        );
        await page.waitForFunction(
          (count) => (window as unknown as FixtureWindow).sessions > count,
          sessions,
        );
        await page.evaluate(
          (value) => (window as unknown as FixtureWindow).finishRead(value),
          good,
        );
        await empty();
        await allow(page, actor);
      }
      const beforeUnmount = await page.evaluate(
        () => (window as unknown as FixtureWindow).sessions,
      );
      await page.evaluate(() => (window as unknown as FixtureWindow).unmountProfile());
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new Event("pageshow"));
      });
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).sessions),
        beforeUnmount,
      );
      assert.equal(await page.locator("#fixture").innerText(), "");
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

test("runtime exact action and real record policy reject expanded, inherited, foreign and malformed values without retry", async () => {
  const { browser, page, errors } = await renderedManager(true);
  const invalid = [
    null,
    { ...good, extra: "private@example.invalid" },
    { ...good, status: "error" },
    { status: "error", message: "RAW PROVIDER SECRET", profile: null },
    { ...good, status: "success" },
    { ...good, message: 12 },
    { ...good, profile: null },
    ...[
      { ...good.profile, subject: other },
      { ...good.profile, subject: `${target}\n` },
      { ...good.profile, username: "Other_Customer" },
      { ...good.profile, username: `${username}\n` },
      { ...good.profile, username: ` ${username}` },
      { ...good.profile, phone: "202-555-0123" },
      { ...good.profile, phone: `${phone}\n` },
      { ...good.profile, email: "private@example.invalid" },
    ].map((profile) => ({ ...good, profile })),
  ];
  const button = page.getByRole("button", { name: "View profile support", exact: true });
  try {
    for (const value of invalid) {
      await allow(page);
      await page.getByLabel("Profile support reason").selectOption("profile_help");
      await button.click();
      const calls = await page.evaluate(() => (window as unknown as FixtureWindow).calls.length);
      await page.evaluate(
        (result) => (window as unknown as FixtureWindow).finishRead(result),
        value,
      );
      await page
        .getByText(
          "Profile support could not be loaded. Look up the customer again before another request.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await page.locator("[data-profile-support-record]").count(), 0);
      assert.equal(await button.isDisabled(), true, "bad read closes the capability lease");
      assert.equal(await page.getByLabel("Profile support reason").inputValue(), "");
      await settle(page);
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).calls.length),
        calls,
      );
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /RAW PROVIDER SECRET|private@example|\+12025550123/,
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    }
    for (const kind of [
      "inherited",
      "symbol",
      "nonenumerable",
      "getter",
      "inherited-record",
      "rejected",
    ]) {
      await allow(page);
      await page.getByLabel("Profile support reason").selectOption("profile_help");
      await button.click();
      await page.evaluate((kind) => {
        const fixture = window as unknown as FixtureWindow;
        const profile = {
          subject: "22222222-2222-4222-8222-222222222222",
          username: "Test_Customer",
          phone: "+12025550123",
        };
        let result: object = { status: "ready", message: "RAW PROVIDER SECRET", profile };
        if (kind === "inherited")
          result = Object.assign(Object.create(result), { a: 1, b: 2, c: 3 });
        if (kind === "symbol")
          Object.defineProperty(result, Symbol("private"), { value: "SECRET" });
        if (kind === "nonenumerable") Object.defineProperty(result, "private", { value: "SECRET" });
        if (kind === "getter")
          Object.defineProperty(result, "profile", {
            get: () => {
              throw new Error("UNSAFE GETTER");
            },
          });
        if (kind === "inherited-record")
          result = {
            status: "ready",
            message: "SECRET",
            profile: Object.assign(Object.create(profile), { a: 1, b: 2, c: 3 }),
          };
        if (kind === "rejected") fixture.rejectRead();
        else fixture.finishRead(result);
      }, kind);
      await page
        .getByText(
          "Profile support could not be loaded. Look up the customer again before another request.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await button.isDisabled(), true);
      assert.equal(await page.locator("[data-profile-support-record]").count(), 0);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("320px selected context and scoped controls remain usable without overflow or contact actions", async () => {
  const { browser, page, errors } = await renderedManager();
  try {
    assert.ok(
      existsSync(new URL("src/app/profile-support.css", root)),
      "profile-only styles required",
    );
    const sessions = await page.evaluate(() => (window as unknown as FixtureWindow).sessions);
    await page.evaluate(() =>
      (window as unknown as FixtureWindow).renderProfile(
        "visible",
        undefined,
        undefined,
        "a".repeat(32),
      ),
    );
    await page.waitForFunction(
      (count) => (window as unknown as FixtureWindow).sessions > count,
      sessions,
    );
    await allow(page);
    assert.match(
      await page.locator(".profile-support-manager").innerText(),
      new RegExp(`Selected Customer[\\s\\S]*${"a".repeat(32)}[\\s\\S]*${target}`),
    );
    await page.getByLabel("Profile support reason").selectOption("profile_help");
    await page.getByRole("button", { name: "View profile support", exact: true }).click();
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishRead(value), {
      ...good,
      profile: { ...good.profile, username: "a".repeat(32) },
    });
    await page.locator("[data-profile-support-record]").waitFor();
    for (const control of await page.locator("button,select").all()) {
      assert.ok((await control.boundingBox())!.height >= 44);
      assert.ok(
        await control.evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 16),
      );
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.locator("a,input,textarea").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const strict of [false, true]) {
  test(`${strict ? "development StrictMode" : "production"}: malformed/denied readiness and invalid selected context cannot enable private reads`, async () => {
    const { browser, page, errors } = await renderedManager(strict);
    const button = page.getByRole("button", { name: "View profile support", exact: true });
    try {
      for (const value of [
        null,
        { status: "guest" },
        { status: "mfa_required" },
        { status: "denied", message: "RAW PROVIDER SECRET" },
        { status: "unavailable", message: "RAW PROVIDER SECRET" },
        { status: "ready", subject: other },
        { status: "ready", subject: `${subject}\n` },
        { ...ready, extra: "private@example.invalid" },
        { status: "ready" },
      ]) {
        await page.evaluate(
          (state) => (window as unknown as FixtureWindow).finishSession(state),
          value,
        );
        await settle(page);
        assert.equal(await button.isDisabled(), true);
        assert.match(await page.getByRole("status").innerText(), /could not be confirmed/);
        assert.equal(await page.getByLabel("Profile support reason").inputValue(), "");
        assert.doesNotMatch(
          await page.locator("body").innerText(),
          /RAW PROVIDER SECRET|private@example/,
        );
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      }
      await page.evaluate(() =>
        (window as unknown as FixtureWindow).finishSession(
          Object.assign(
            Object.create({ status: "ready", subject: "11111111-1111-4111-8111-111111111111" }),
            { a: 1, b: 2 },
          ),
        ),
      );
      await settle(page);
      assert.equal(await button.isDisabled(), true);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        (window as unknown as FixtureWindow).rejectSession();
      });
      await settle(page);
      assert.equal(await button.isDisabled(), true);
      for (const [actor, customer, name] of [
        [subject, subject, username],
        [`${subject}\n`, target, username],
        [subject, target, `${username}\n`],
        [subject, `${target}\n`, username],
        [subject, target, " customer"],
      ]) {
        const sessions = await page.evaluate(() => (window as unknown as FixtureWindow).sessions);
        await page.evaluate(
          ([a, t, n]) => (window as unknown as FixtureWindow).renderProfile("visible", a, t, n),
          [actor, customer, name],
        );
        await page.waitForFunction(
          (count) => (window as unknown as FixtureWindow).sessions > count,
          sessions,
        );
        await page.evaluate((state) => (window as unknown as FixtureWindow).finishSession(state), {
          status: "ready",
          subject: actor,
        });
        await settle(page);
        assert.equal(await button.isDisabled(), true);
      }
      assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).calls), []);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

test("reason edits clear displayed/pending disclosure context and reject late edited or unmounted results without duplicate reads", async () => {
  const { browser, page, errors } = await renderedManager();
  try {
    await allow(page);
    const reason = page.getByLabel("Profile support reason");
    const button = page.getByRole("button", { name: "View profile support", exact: true });
    await reason.selectOption("profile_help");
    await button.click();
    await reason.selectOption("");
    await reason.selectOption("profile_help");
    await page
      .locator("form")
      .evaluate((form: HTMLFormElement) =>
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
    assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).calls.length), 1);
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishRead(value), good);
    await page.waitForFunction(
      () => document.querySelector("form")?.getAttribute("aria-busy") === "false",
    );
    assert.equal(await page.locator("[data-profile-support-record]").count(), 0);
    assert.doesNotMatch(await page.getByRole("status").innerText(), /loaded for this Customer/);
    await button.click();
    await page.evaluate(() => (window as unknown as FixtureWindow).unmountProfile());
    await page.evaluate((value) => (window as unknown as FixtureWindow).finishRead(value), good);
    await settle(page);
    assert.equal(await page.locator("#fixture").innerText(), "");
    assert.equal(await page.evaluate(() => (window as unknown as FixtureWindow).calls.length), 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const strict of [false, true]) {
  test(`${strict ? "development StrictMode" : "production"}: starts empty/disabled and renews exact current self-capability only`, async () => {
    const { browser, page, errors } = await renderedManager(strict);
    try {
      const button = page.getByRole("button", { name: "View profile support", exact: true });
      assert.equal(await button.isDisabled(), true);
      assert.equal(await page.getByLabel("Profile support reason").inputValue(), "");
      assert.equal(await page.locator("[data-profile-support-record]").count(), 0);
      assert.equal(
        await page.evaluate(() => (window as unknown as FixtureWindow).sessions),
        strict ? 2 : 1,
      );
      assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).calls), []);
      await allow(page);
      if (strict) {
        await page.evaluate(
          (value) => (window as unknown as FixtureWindow).finishSession(value, 0),
          { status: "ready", subject: other },
        );
        await settle(page);
        assert.equal(await page.getByLabel("Profile support reason").isDisabled(), false);
      }
      assert.deepEqual(await page.evaluate(() => (window as unknown as FixtureWindow).calls), []);
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
