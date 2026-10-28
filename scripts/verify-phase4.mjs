import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.SHOPTHIE_URL || "http://127.0.0.1:3100";
const directory = "docs/screenshots/phase-4";
const reportPath = "docs/phase-4-browser-results.json";
const views = [
  { name: "narrow", width: 320, height: 740 },
  { name: "small-phone", width: 360, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "landscape", width: 568, height: 320 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "compact-desktop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "wide", width: 1920, height: 1080 },
];
const report = { baseURL, results: [], accessibility: [], errors: [] };
await mkdir(directory, { recursive: true });
const persist = () => writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
const browser = await chromium.launch();

try {
  for (const view of views) {
    const context = await browser.newContext({
      viewport: { width: view.width, height: view.height },
      isMobile: view.width <= 568,
      hasTouch: view.width <= 568,
      reducedMotion: "no-preference",
    });
    await context.addInitScript(() => sessionStorage.setItem("shopthie-intro-v1", "seen"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const open = async (path) => {
      await page.goto(baseURL + path);
      await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
      await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);
    };
    const capture = async (name, selector) => {
      if (selector) {
        await page.locator(selector).evaluate((element) => {
          window.scrollTo({
            top: element.getBoundingClientRect().top + scrollY - 110,
            behavior: "instant",
          });
        });
      }
      // Existing image/heading reveals settle before art-direction inspection.
      await page.waitForTimeout(1200);
      await page.waitForFunction(() =>
        [...document.images]
          .filter((image) => {
            const box = image.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
          })
          .every((image) => image.complete && image.naturalWidth > 0),
      );
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        motion: document.documentElement.dataset.motionMode,
        scrollY,
      }));
      const screenshot = `${directory}/${view.name}-${name}.png`;
      await page.screenshot({ path: screenshot, animations: "disabled" });
      const result = {
        scene: name,
        width: view.width,
        height: view.height,
        screenshot,
        ...state,
        errors: [...errors],
      };
      report.results.push(result);
      await persist();
      expect(state.overflow, `${name} at ${view.width}px`).toBe(false);
      expect(errors, `${name} at ${view.width}px`).toEqual([]);
    };
    const accessibility = async (name) => {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      report.accessibility.push({
        scene: name,
        width: view.width,
        height: view.height,
        violations: result.violations,
      });
      await persist();
      expect(result.violations, `${name} accessibility at ${view.width}px`).toEqual([]);
    };

    await open("/");
    await capture("hero");
    // Scan the entire unscrolled document, not only revealed content.
    if ([320, 834, 1440].includes(view.width)) await accessibility("home");
    await capture("featured-story", "#introduction");
    await capture("editorial-feature", "#weekend-edit");

    if (view.name === "landscape") {
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.getByRole("button", { name: "Open navigation" }).click();
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(nav).toBeInViewport({ ratio: 1 });
      await nav.getByRole("link", { name: "Image credits" }).focus();
      await expect(nav.getByRole("link", { name: "Image credits" })).toBeInViewport({ ratio: 1 });
      await capture("scrollable-navigation");
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
    }

    await open("/about");
    await capture("about-principles", "[aria-label='The way we look at things']");
    if ([320, 834, 1440].includes(view.width)) await accessibility("about");

    await open("/products/google-pixel-8");
    await capture("product-purchase", "#product-purchase");
    await capture("product-story", ".pd-story");
    if ([320, 834, 1440].includes(view.width)) await accessibility("product");
    await page
      .getByRole("region", { name: "A closer look." })
      .getByRole("link", { name: "Choose your configuration" })
      .click();
    await expect(page.locator("#product-purchase")).toBeInViewport();
    await page.getByRole("combobox", { name: "Product option" }).selectOption({ label: "256 GB" });
    await page
      .getByRole("button", { name: /Add to bag/ })
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: "Your bag" })).toContainText("256 GB");
    await page
      .getByRole("dialog", { name: "Your bag" })
      .getByRole("button", { name: "Close your bag" })
      .click();
    await context.close();
  }
} catch (error) {
  report.errors.push(String(error.stack || error));
  throw error;
} finally {
  await persist();
  await browser.close();
}
console.log(
  JSON.stringify({
    scenes: report.results.length,
    viewports: views.length,
    accessibilityScans: report.accessibility.length,
    reportPath,
  }),
);
