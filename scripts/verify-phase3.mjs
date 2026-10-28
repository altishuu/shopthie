import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.SHOPTHIE_URL || "http://127.0.0.1:3100";
const out = "docs/screenshots/phase-3";
const report = "docs/phase-3-browser-results.json";
await mkdir(out, { recursive: true });
await mkdir("docs/phase-3-media", { recursive: true });
const browser = await chromium.launch();
const results = [];
const accessibility = [];
let videoPath;
const persist = () =>
  writeFile(report, JSON.stringify({ base, results, accessibility, videoPath }, null, 2) + "\n");

try {
  for (const [name, width, height] of [
    ["narrow", 320, 800],
    ["small-mobile", 360, 800],
    ["compact", 375, 812],
    ["mobile", 390, 844],
    ["tablet", 834, 1112],
    ["desktop", 1440, 1000],
    ["wide", 1920, 1080],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 761,
      isMobile: width < 761,
      reducedMotion: "no-preference",
      ...(name === "desktop"
        ? { recordVideo: { dir: "docs/phase-3-media", size: { width: 1440, height: 1000 } } }
        : {}),
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const capture = async (scene) => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.querySelectorAll("img").forEach((image) => {
          image.loading = "eager";
        });
        await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      });
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        imagesLoaded: [...document.querySelectorAll("main img")]
          .filter((image) => image.getClientRects().length)
          .every((image) => image.complete && image.naturalWidth > 0),
        background: getComputedStyle(document.body).backgroundColor,
        motion: document.documentElement.dataset.motionMode,
        pins: document.querySelectorAll(".pin-spacer").length,
        smoothWheel: document.documentElement.classList.contains("lenis"),
      }));
      const path = `${out}/${name}-${scene}.png`;
      await page.screenshot({ path });
      results.push({ name, width, height, scene, ...state, errors: [...errors], screenshot: path });
      await persist();
      assert(!state.overflow, `${name}/${scene}: horizontal overflow`);
      assert(state.imagesLoaded, `${name}/${scene}: image pixels missing`);
      assert.equal(state.background, "rgb(245, 244, 240)", "design stylesheet must be present");
      assert.equal(errors.length, 0, errors.join("\n"));
    };
    const axe = async (scene) => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      accessibility.push({ name, scene, violations });
      await persist();
      assert.equal(violations.length, 0, `${name}/${scene}: ${JSON.stringify(violations)}`);
    };
    await page.goto(base, { waitUntil: "domcontentloaded" });
    if (name === "desktop") {
      await page.locator("#intro-screen").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${out}/desktop-introduction.png` });
    }
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
    await page.waitForTimeout(850);
    await capture("hero");
    if (name === "desktop") await axe("hero-full-motion");
    for (const [scene, id] of [
      ["considered-edit", "home-considered-edit"],
      ["listening", "home-listening-interlude"],
      ["phone-edit", "home-new-perspective"],
    ]) {
      await page.locator(`#${id}`).evaluate(
        (section, pinned) => {
          const anchor = section.parentElement.classList.contains("pin-spacer")
            ? section.parentElement
            : section;
          const top = anchor.getBoundingClientRect().top + scrollY;
          scrollTo({
            top: Math.max(0, top + (pinned ? innerHeight * 0.42 : -110)),
            behavior: "instant",
          });
        },
        scene === "listening" && width >= 1024,
      );
      await page.waitForTimeout(1100);
      await capture(scene);
    }
    assert.equal(await page.locator(".pin-spacer").count(), width >= 1024 ? 1 : 0);
    if (name === "mobile" || name === "desktop") {
      await page.evaluate(() =>
        scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
      );
      await page.waitForTimeout(1100);
      await axe("all-home-sections-revealed");
    }
    await page.getByRole("link", { name: "Explore the phone edit", exact: true }).click();
    await expect(page).toHaveURL(/\/collections\/smartphones$/);
    await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
    await page.waitForTimeout(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await capture("collection-after-transition");
    await expect(page.locator(".pin-spacer")).toHaveCount(0);
    if (width < 761) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.waitForTimeout(400);
      await capture("mobile-navigation");
      await page.keyboard.press("Escape");
    }
    if (name === "desktop") {
      videoPath = await page.video().path();
      await persist();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await persist();
console.log(
  JSON.stringify(
    {
      checkedScenes: results.length,
      viewportWidths: [...new Set(results.map((row) => row.width))],
      overflow: results.filter((row) => row.overflow).length,
      runtimeErrors: results.flatMap((row) => row.errors),
      accessibilityChecks: accessibility.length,
      violations: accessibility.flatMap((row) => row.violations).length,
      screenshots: out,
      videoPath,
      report,
    },
    null,
    2,
  ),
);
