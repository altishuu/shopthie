// Run against an already-started production server:
// SHOPTHIE_URL=http://127.0.0.1:3100 node scripts/verify-phase5-browsers.mjs
// Exit codes: 0 = complete pass; 1 = acceptance/harness failure; 2 = blocked coverage.
// Does not build, start a server, install engines, submit checkout, or change app data.
import assert from "node:assert/strict";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { writeFileSync, renameSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const reportPath = join(root, "docs/phase-5-browser-results.json");
const screenshotDirectory = join(root, "docs/screenshots/phase-5");
const baseURL = (process.env.SHOPTHIE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const engineNames = ["chromium", "firefox", "webkit"];
const desktop = { width: 1440, height: 1000 };
const scenarios = [
  "desktop-home-intro",
  "desktop-shop-filters",
  "desktop-product-bag-keyboard",
  "desktop-about-history-skip",
  "mobile-navigation",
  "reduced-motion",
  "no-javascript",
];
const responsiveViews = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 834, height: 1112 },
  desktop,
  { width: 1920, height: 1080 },
];
const axeScenes = ["home", "shop", "product", "about"];
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  baseURL,
  status: "running",
  execution: "Sequential engines and scenarios; isolated contexts; no retries.",
  limitations: [
    "Target must already be serving a production build; this script does not prove build provenance.",
    "Viewport/touch emulation is not a real mobile device, Safari application, or assistive-technology test.",
    "Intro completion and repeat mode are checked; precise readability/frame timing belongs to motion-regressions.spec.ts.",
    "Screenshots are evidence, not pixel-baseline comparisons. Axe scans do not establish complete accessibility conformance.",
    "No checkout, real order, backend, payment, or deployment is exercised. Non-read requests and cross-origin network requests are blocked and fail the scenario.",
    "No intentional 404 navigation is performed; runtime and console errors have no blanket 404 exclusions.",
    "A new invocation replaces the JSON report; filenames are deterministic and only screenshots listed in this run are current evidence.",
  ],
  engines: engineNames.map((name) => ({ name, status: "pending", version: null })),
  results: engineNames.flatMap((engine) =>
    [...scenarios, ...(engine === "chromium" ? ["responsive-spotchecks"] : [])].map((scenario) => ({
      id: `${engine}:${scenario}`,
      engine,
      scenario,
      status: "pending",
      screenshots: [],
      errors: [],
      observations: {},
    })),
  ),
  accessibility: engineNames.flatMap((engine) =>
    axeScenes.map((scene) => ({ id: `${engine}:${scene}`, engine, scene, status: "pending" })),
  ),
  harnessErrors: [],
  statistics: {},
};
const plannedIds = report.results.map(({ id }) => id);
const plannedAxeIds = report.accessibility.map(({ id }) => id);
let playwright;
let AxeBuilder;
let expect;
let activeBrowser;
let interrupted = false;

function statistics() {
  const counts = (entries) =>
    entries.reduce((out, item) => {
      out[item.status] = (out[item.status] || 0) + 1;
      return out;
    }, {});
  return {
    expectedScenarios: plannedIds.length,
    recordedScenarios: report.results.length,
    scenarios: counts(report.results),
    expectedAccessibilityScans: plannedAxeIds.length,
    completedAccessibilityScans: report.accessibility.filter((scan) => scan.analyzed).length,
    accessibility: counts(report.accessibility),
    engines: counts(report.engines),
    screenshots: new Set(report.results.flatMap((result) => result.screenshots)).size,
    runtimeAndConsoleErrors: report.results.reduce(
      (count, result) =>
        count +
        result.errors.filter((error) => ["pageerror", "console"].includes(error.type)).length,
      0,
    ),
  };
}
async function persist() {
  report.statistics = statistics();
  await writeFile(`${reportPath}.tmp`, JSON.stringify(report, null, 2) + "\n");
  await rename(`${reportPath}.tmp`, reportPath);
}
function errorText(error) {
  return String(error?.stack || error);
}
function assertInventory() {
  for (const [actual, expected] of [
    [report.results.map(({ id }) => id), plannedIds],
    [report.accessibility.map(({ id }) => id), plannedAxeIds],
  ]) {
    assert.equal(new Set(actual).size, actual.length, "Duplicate report ID");
    assert.deepEqual([...actual].sort(), [...expected].sort(), "Coverage inventory changed");
  }
}
function stop(signal) {
  interrupted = true;
  report.status = "interrupted";
  report.finishedAt = new Date().toISOString();
  report.harnessErrors.push(`Interrupted by ${signal}; pending scenarios did not pass.`);
  for (const entry of [...report.results, ...report.accessibility]) {
    if (["pending", "running"].includes(entry.status)) entry.status = "interrupted";
  }
  report.statistics = statistics();
  // Separate temporary name avoids racing an in-flight asynchronous persist.
  writeFileSync(`${reportPath}.interrupted.tmp`, JSON.stringify(report, null, 2) + "\n");
  renameSync(`${reportPath}.interrupted.tmp`, reportPath);
  process.exit(signal === "SIGINT" ? 130 : 143);
}

// getByRole omits RetainedAppRouter's hidden copies, unlike broad main CSS selectors.
function main(page) {
  return page.getByRole("main");
}
async function ready(page, javaScriptEnabled = true) {
  await expect(main(page)).toHaveCount(1);
  await expect(main(page)).toBeVisible();
  if (javaScriptEnabled) {
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
    await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
    await expect(main(page)).toHaveAttribute("data-motion-ready", "true");
  }
  // Firefox disables page-world Promise jobs with scripting disabled. Poll a
  // synchronous font status instead of awaiting a never-delivered callback.
  if (javaScriptEnabled) await page.evaluate(() => document.fonts.ready);
  else await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
  await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
  await expect(main(page)).toHaveCSS("opacity", "1");
  if (javaScriptEnabled) {
    await expect(main(page)).toHaveCSS("transform", "none");
    // Intro/route idle precedes the page-owned entrance; inspect settled frames,
    // not an accidentally empty hero or a partly masked heading/gallery.
    await expect
      .poll(() =>
        main(page).evaluate((element) => {
          const targets = element.querySelectorAll(
            "h1, .hero h1 > span, .hero-visual, .hero-description, .hero-topline, .hero-copy .pill-link, .hero-secondary, .product-note, .hero-bottom, .gallery-stage img",
          );
          return [...targets].every((target) => {
            const clip = getComputedStyle(target).clipPath;
            return (
              clip === "none" ||
              (clip.match(/[-\d.]+/g) || []).every((value) => Math.abs(Number(value)) < 0.01)
            );
          });
        }),
      )
      .toBe(true);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  }
}
async function open(page, path, javaScriptEnabled = true) {
  const response = await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
  assert.ok(response?.ok(), `Navigation ${path}: HTTP ${response?.status() ?? "no response"}`);
  await ready(page, javaScriptEnabled);
}
async function noOverflow(page) {
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.documentWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.width);
  return geometry;
}
async function loadedImage(image) {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
    .toBe(true);
}
async function capture(page, result, name) {
  const path = join(screenshotDirectory, `${result.engine}-${result.scenario}-${name}.png`);
  await page.screenshot({ path, animations: "disabled", timeout: 20000 });
  const artifact = relative(root, path);
  if (!result.screenshots.includes(artifact)) result.screenshots.push(artifact);
}
async function axe(page, result, scene) {
  const record = report.accessibility.find((item) => item.id === `${result.engine}:${scene}`);
  record.status = "running";
  await persist();
  try {
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    Object.assign(record, {
      analyzed: true,
      status: scan.violations.length ? "failed" : "passed",
      url: page.url(),
      violations: scan.violations,
      passes: scan.passes.length,
      incomplete: scan.incomplete,
    });
    await persist();
    expect(scan.violations, `${result.engine} ${scene} axe violations`).toEqual([]);
  } catch (error) {
    record.status = "failed";
    record.error = errorText(error);
    await persist();
    throw error;
  }
}
async function trapFocus(page, dialog) {
  // Walk past every focusable control in both directions, not just a fixed short prefix.
  const count = await dialog
    .locator(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    )
    .count();
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < count + 2; i++) {
      await page.keyboard.press(key);
      expect(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
        `${key} escaped dialog`,
      ).toBe(true);
    }
  }
}

const checks = {
  async "desktop-home-intro"({ page, result }) {
    await open(page, "/");
    await expect(page.locator("html")).toHaveAttribute("data-intro-kind", "full");
    await expect(page.locator("html")).toHaveAttribute("data-motion-mode", "full");
    await expect(main(page).getByRole("heading", { level: 1 })).toContainText("Good sound.");
    await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
    await expect(page.locator("#intro-screen")).toBeHidden();
    await loadedImage(main(page).locator(".hero-product img").first());
    result.observations.geometry = await noOverflow(page);
    await capture(page, result, "first-visit");
    await axe(page, result, "home");
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("data-intro-kind", "abbreviated");
    await expect(page.locator("#intro-screen")).toBeHidden();
    result.observations.intro = {
      first: "full",
      repeat: "abbreviated",
      preciseTiming: "not duplicated; see existing motion-regressions tests",
    };
    await capture(page, result, "repeat-visit");
  },

  async "desktop-shop-filters"({ page, result }) {
    await open(page, "/shop");
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("The considered edit.");
    const cards = () => main(page).locator("[data-product-card]");
    await expect(cards()).toHaveCount(7);
    await noOverflow(page);
    await capture(page, result, "all-products");
    await axe(page, result, "shop");
    const selections = [
      { label: "Headphones", slug: "headphones", count: 2 },
      { label: "Earbuds", slug: "earbuds", count: 1 },
      { label: "Speakers", slug: "speakers", count: 2 },
      { label: "Smartphones", slug: "smartphones", count: 2 },
    ];
    let previous = [];
    result.observations.categories = [];
    for (const selection of selections) {
      await main(page).getByRole("button", { name: selection.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`category=${selection.slug}`));
      await ready(page);
      await expect(cards()).toHaveCount(selection.count);
      await expect(main(page).locator(".catalog")).toHaveAttribute("aria-busy", "false");
      const ids = await cards().evaluateAll((elements) =>
        elements.map((element) => element.dataset.productCard),
      );
      expect(
        ids.filter((id) => previous.includes(id)),
        "Category products should be disjoint",
      ).toEqual([]);
      await expect(cards().first()).toHaveCSS("transform", "none");
      result.observations.categories.push({ category: selection.slug, ids });
      previous = ids;
    }
    await main(page).getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(cards()).toHaveCount(7);
    await main(page)
      .getByRole("combobox", { name: "Sort products", exact: true })
      .selectOption("price-asc");
    await expect(page).toHaveURL(/sort=price-asc/);
    const prices = () =>
      main(page)
        .locator("[data-product-card] [data-price-minor]")
        .evaluateAll((items) => items.map((item) => Number(item.dataset.priceMinor)));
    await expect
      .poll(async () => {
        const values = await prices();
        return (
          values.length === 7 &&
          values.every(
            (value, index) => Number.isFinite(value) && (index === 0 || value >= values[index - 1]),
          )
        );
      })
      .toBe(true);
    result.observations.ascendingPrices = await prices();
    await main(page)
      .getByRole("combobox", { name: "Filter by brand", exact: true })
      .selectOption("Bose");
    await expect(page).toHaveURL(/brand=Bose/);
    await expect(cards()).toHaveCount(1);
    await expect(cards()).toHaveAttribute("data-product-card", "bose-quietcomfort-25");
    await expect(
      main(page).getByRole("combobox", { name: "Sort products", exact: true }),
    ).toHaveValue("price-asc");
    await capture(page, result, "brand-and-sort");
  },

  async "desktop-product-bag-keyboard"({ page, result }) {
    // AirPods Max has two actual photos; Pixel 8 intentionally has only one.
    await open(page, "/products/apple-airpods-max");
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("AirPods Max");
    await loadedImage(main(page).locator(".gallery-stage img"));
    const gallery = main(page).locator(".product-gallery");
    const firstImage = await gallery.locator(".gallery-stage img").getAttribute("src");
    await gallery.getByRole("button", { name: "Next photograph", exact: true }).click();
    await expect(gallery.getByRole("status")).toContainText("Photograph 2 of 2");
    await loadedImage(gallery.locator(".gallery-stage img"));
    await expect(gallery.locator(".gallery-stage img")).not.toHaveAttribute("src", firstImage);
    await gallery.getByRole("button", { name: "Previous photograph", exact: true }).click();
    await expect(gallery.getByRole("status")).toContainText("Photograph 1 of 2");
    await loadedImage(gallery.locator(".gallery-stage img"));
    await noOverflow(page);
    await capture(page, result, "gallery");
    await open(page, "/products/google-pixel-8");
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("Pixel 8");
    await loadedImage(main(page).locator(".gallery-stage img"));
    await axe(page, result, "product");
    await main(page)
      .getByRole("combobox", { name: "Product option", exact: true })
      .selectOption({ label: "256 GB" });
    await main(page).getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
    const trigger = main(page).getByRole("button", { name: "Add to bag", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Your bag", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-cart-line]")).toHaveCount(1);
    await expect(dialog).toContainText("256 GB");
    await expect(dialog.getByRole("spinbutton")).toHaveValue("2");
    await trapFocus(page, dialog);
    await capture(page, result, "bag-quantity-two");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.getByRole("button", { name: "Open bag", exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close your bag", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    result.observations.purchase = {
      option: "256 GB",
      quantity: 2,
      dialogFocusTrap: "both directions",
      closedBy: ["Escape", "Close your bag"],
    };
  },

  async "desktop-about-history-skip"({ page, result }) {
    await open(page, "/about");
    await expect(main(page).getByRole("heading", { level: 1 })).toContainText("look closer");
    await expect(
      main(page)
        .getByRole("region", { name: "The way we look at things", exact: true })
        .getByRole("heading", { level: 3 }),
    ).toHaveCount(3);
    await noOverflow(page);
    await capture(page, result, "about");
    await axe(page, result, "about");
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: "Shop", exact: true })
      .click();
    await expect(page).toHaveURL(/\/shop$/);
    await ready(page);
    await main(page).getByRole("link", { name: "View AirPods Max", exact: true }).click();
    await expect(page).toHaveURL(/\/products\/apple-airpods-max$/);
    await ready(page);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/shop$/);
    await ready(page);
    await expect(main(page).locator("[data-product-card]")).toHaveCount(7);
    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/products\/apple-airpods-max$/);
    await ready(page);
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("AirPods Max");
    // Native skip anchors may add a hash history entry; test after back/forward.
    const skip = page.getByRole("link", { name: "Skip to content", exact: true });
    await skip.focus();
    await page.keyboard.press("Enter");
    await expect(main(page)).toBeFocused();
    await capture(page, result, "forward-restored");
    result.observations.history = ["about", "shop", "product", "back:shop", "forward:product"];
  },

  async "mobile-navigation"({ page, result }) {
    result.observations.views = [];
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 568, height: 320 },
    ]) {
      await page.setViewportSize(viewport);
      await open(page, "/");
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      const toggle = page.getByRole("button", { name: "Open navigation", exact: true });
      const nav = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(nav).toBeInViewport({ ratio: 1 });
      // GSAP retains an identity matrix here; it does not clear transform.
      await expect
        .poll(() =>
          nav.evaluate((element) => {
            const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
            return (
              Math.abs(matrix.m42) < 0.1 &&
              [...element.querySelectorAll("a")].every(
                (link) => Number(getComputedStyle(link).opacity) === 1,
              )
            );
          }),
        )
        .toBe(true);
      const navGeometry = await nav.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          overflowY: getComputedStyle(element).overflowY,
          lenisPrevent: element.hasAttribute("data-lenis-prevent"),
        };
      });
      expect(navGeometry.top).toBeGreaterThanOrEqual(0);
      expect(navGeometry.bottom).toBeLessThanOrEqual(viewport.height + 1);
      expect(navGeometry.left).toBeGreaterThanOrEqual(0);
      expect(navGeometry.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(navGeometry.lenisPrevent).toBe(true);
      if (viewport.height === 320) {
        expect(navGeometry.scrollHeight).toBeGreaterThan(navGeometry.clientHeight);
        expect(["auto", "scroll"]).toContain(navGeometry.overflowY);
      }
      const backgroundY = await page.evaluate(() => scrollY);
      const lastLink = nav.getByRole("link", { name: "Image credits", exact: true });
      await lastLink.focus();
      await expect(lastLink).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => scrollY)).toBe(backgroundY);
      if (viewport.height === 320)
        expect(await nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await capture(page, result, `${viewport.width}-last-link`);
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
      await lastLink.focus();
      await page.keyboard.press("Enter");
      await expect(nav).toBeHidden();
      await expect(page).toHaveURL(/\/#credits$/);
      await ready(page);
      const geometry = await noOverflow(page);
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await toggle.click();
      await nav.getByRole("link", { name: "Shop", exact: true }).click();
      await expect(page).toHaveURL(/\/shop$/);
      await ready(page);
      await expect(nav).toBeHidden();
      await noOverflow(page);
      result.observations.views.push({ ...geometry, navigation: navGeometry });
    }
  },

  async "reduced-motion"({ page, result }) {
    for (const [name, path] of [
      ["home", "/"],
      ["product", "/products/apple-airpods-max"],
    ]) {
      await open(page, path);
      await expect(page.locator("html")).toHaveAttribute("data-motion-mode", "reduced");
      await expect(main(page).locator(".pin-spacer")).toHaveCount(0);
      await expect(page.locator("#intro-screen")).toBeHidden();
      await expect(page.locator("#route-veil")).toBeHidden();
      await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
      await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
      await noOverflow(page);
      if (name === "product") {
        const image = main(page).locator(".gallery-stage img");
        await loadedImage(image);
        await expect(image).toHaveCSS("transform", "none");
        await main(page).getByRole("button", { name: "Next photograph", exact: true }).click();
        await expect(main(page).locator(".gallery-caption")).toContainText("Photograph 2 of 2");
        await loadedImage(image);
        await expect(image).toHaveCSS("transform", "none");
      }
      await capture(page, result, name);
    }
  },

  async "no-javascript"({ page, result }) {
    await open(page, "/", false);
    await expect(main(page).getByRole("heading", { level: 1 })).toContainText("Good sound.");
    await expect(page.locator("#intro-screen")).toBeHidden();
    await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
    await loadedImage(main(page).locator(".hero-product img").first());
    await noOverflow(page);
    await capture(page, result, "home");
    await main(page).getByRole("link", { name: "Shop the collection", exact: true }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await ready(page, false);
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("The considered edit.");
    await expect(main(page).locator("[data-product-card]")).toHaveCount(7);
    result.observations.javaScriptEnabled = false;
  },

  async "responsive-spotchecks"({ page, result }) {
    result.observations.views = [];
    for (const viewport of responsiveViews) {
      await page.setViewportSize(viewport);
      for (const [scene, path] of [
        ["home", "/"],
        ["product", "/products/apple-airpods-max"],
      ]) {
        await open(page, path);
        const geometry = await noOverflow(page);
        if (scene === "product") {
          const stage = main(page).locator(".gallery-stage");
          await loadedImage(stage.locator("img"));
          const box = await stage.boundingBox();
          assert.ok(box && box.width > 0 && box.height > 0, "Gallery geometry missing");
          if (viewport.width <= 568) {
            expect(box.height).toBeLessThanOrEqual(
              Math.max(220, Math.min(viewport.width * 0.85, viewport.height * 0.65)) + 1,
            );
          }
          await expect(
            main(page).getByRole("button", { name: "Add to bag", exact: true }),
          ).toBeEnabled();
          await main(page)
            .getByRole("button", { name: "Add to bag", exact: true })
            .scrollIntoViewIfNeeded();
          await expect(
            main(page).getByRole("button", { name: "Add to bag", exact: true }),
          ).toBeInViewport();
          result.observations.views.push({ scene, ...geometry, gallery: box });
        } else {
          await loadedImage(main(page).locator(".hero-product img").first());
          result.observations.views.push({ scene, ...geometry });
        }
        await capture(page, result, `${viewport.width}-${scene}`);
      }
    }
  },
};

async function runScenario(browser, result) {
  result.status = "running";
  result.startedAt = new Date().toISOString();
  const started = performance.now();
  await persist();
  let context;
  let page;
  let deadline;
  try {
    const mobile = result.scenario === "mobile-navigation";
    context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : desktop,
      hasTouch: mobile,
      // Do not use isMobile: Firefox does not support it.
      reducedMotion: result.scenario === "reduced-motion" ? "reduce" : "no-preference",
      javaScriptEnabled: result.scenario !== "no-javascript",
      serviceWorkers: "block",
    });
    context.setDefaultTimeout(12000);
    context.setDefaultNavigationTimeout(30000);
    deadline = setTimeout(() => {
      result.errors.push({ type: "scenario-timeout", message: "Scenario exceeded 90 seconds" });
      void context.close().catch(() => {});
    }, 90000);
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const unsafe = !["GET", "HEAD"].includes(request.method());
      const external =
        ["http:", "https:"].includes(url.protocol) && url.origin !== new URL(baseURL).origin;
      if (unsafe || external) {
        result.errors.push({
          type: "network-policy",
          method: request.method(),
          url: request.url(),
          message: unsafe ? "Non-read request blocked" : "Cross-origin request blocked",
        });
        await route.abort("blockedbyclient");
      } else {
        await route.continue();
      }
    });
    page = await context.newPage();
    page.on("pageerror", (error) =>
      result.errors.push({ type: "pageerror", message: errorText(error), url: page.url() }),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        result.errors.push({
          type: "console",
          message: message.text(),
          location: message.location(),
          url: page.url(),
        });
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        result.errors.push({ type: "http", status: response.status(), url: response.url() });
    });
    await checks[result.scenario]({ page, context, result });
    // Catch errors dispatched immediately after the final interaction/capture.
    await page.waitForTimeout(150);
    expect(result.errors, `${result.id} runtime, console, HTTP, or network-policy errors`).toEqual(
      [],
    );
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.failure = errorText(error);
    if (page && !page.isClosed()) {
      try {
        await capture(page, result, "failure");
      } catch (captureError) {
        result.screenshotError = errorText(captureError);
      }
    }
  } finally {
    clearTimeout(deadline);
    if (context) {
      try {
        await context.close();
      } catch (error) {
        result.status = "failed";
        result.cleanupError = errorText(error);
      }
    }
    // Late errors during teardown must not leave a scenario falsely marked passed.
    if (result.errors.length && result.status === "passed") result.status = "failed";
    result.durationMs = Math.round(performance.now() - started);
    result.finishedAt = new Date().toISOString();
    assertInventory();
    await persist();
    console.log(
      `${result.status.toUpperCase()} ${result.id}${result.failure ? `\n${result.failure}` : ""}`,
    );
  }
}

await mkdir(dirname(reportPath), { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
await persist();
try {
  const target = new URL(baseURL);
  assert.ok(["http:", "https:"].includes(target.protocol), "SHOPTHIE_URL must be HTTP(S)");
  assert.equal(
    target.pathname,
    "/",
    "SHOPTHIE_URL must be an origin, without an application subpath",
  );
  assert.ok(
    !target.username && !target.password && !target.search && !target.hash,
    "SHOPTHIE_URL must not contain credentials, query, or hash",
  );
  playwright = await import("@playwright/test");
  expect = playwright.expect.configure({ timeout: 12000 });
  ({ default: AxeBuilder } = await import("@axe-core/playwright"));
  for (const engine of report.engines) {
    engine.executablePath =
      engine.name === "webkit" && process.env.SHOPTHIE_WEBKIT_EXECUTABLE
        ? process.env.SHOPTHIE_WEBKIT_EXECUTABLE
        : playwright[engine.name].executablePath();
    try {
      activeBrowser = await playwright[engine.name].launch({
        headless: true,
        timeout: 30000,
        ...(engine.name === "webkit" && process.env.SHOPTHIE_WEBKIT_EXECUTABLE
          ? { executablePath: process.env.SHOPTHIE_WEBKIT_EXECUTABLE }
          : {}),
      });
      engine.status = "available";
      engine.version = activeBrowser.version();
    } catch (error) {
      const message = errorText(error);
      // Only known install/host dependency problems are coverage blockers.
      // Crashes, permissions, invalid flags, and other launch errors are failures.
      const unavailable =
        /executable doesn't exist|browser executable.*(?:not found|missing)|host system is missing dependencies|missing libraries|error while loading shared libraries|cannot open shared object file|please run.*playwright install/i.test(
          message,
        );
      engine.status = unavailable ? "blocked" : "failed";
      engine.reason = message;
      for (const entry of [...report.results, ...report.accessibility].filter(
        (entry) => entry.engine === engine.name,
      )) {
        entry.status = "blocked";
        entry.reason = `${engine.name} launch ${engine.status}: ${message}`;
      }
      await persist();
      console.error(`${engine.status.toUpperCase()} ${engine.name}: ${message}`);
      continue;
    }
    await persist();
    try {
      for (const result of report.results.filter((result) => result.engine === engine.name)) {
        await runScenario(activeBrowser, result);
      }
    } finally {
      await activeBrowser.close();
      activeBrowser = undefined;
    }
  }
} catch (error) {
  report.harnessErrors.push(errorText(error));
  console.error(errorText(error));
} finally {
  if (activeBrowser) {
    try {
      await activeBrowser.close();
    } catch (error) {
      report.harnessErrors.push(errorText(error));
    }
  }
  for (const entry of [...report.results, ...report.accessibility, ...report.engines]) {
    if (["pending", "running"].includes(entry.status)) {
      entry.status = "blocked";
      entry.reason = "Not reached; inspect scenario failures or harnessErrors. This is not a pass.";
    }
  }
  try {
    assertInventory();
  } catch (error) {
    report.harnessErrors.push(errorText(error));
  }
  const failed =
    report.harnessErrors.length > 0 ||
    [...report.results, ...report.accessibility, ...report.engines].some(
      (entry) => entry.status === "failed",
    );
  const blocked = [...report.results, ...report.accessibility, ...report.engines].some(
    (entry) => entry.status === "blocked",
  );
  report.status = failed ? "failed" : blocked ? "blocked" : "passed";
  report.finishedAt = new Date().toISOString();
  if (!interrupted) await persist();
  console.log(
    JSON.stringify(
      { status: report.status, ...report.statistics, reportPath: relative(root, reportPath) },
      null,
      2,
    ),
  );
  process.exitCode = failed ? 1 : blocked ? 2 : 0;
}
