import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.SHOPTHIE_URL || "http://127.0.0.1:3100";
const out = "docs/screenshots";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 834, 1112],
  ["mobile", 390, 844],
  ["small-mobile", 360, 800],
  ["wide", 1920, 1080],
]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".hero-visual img").waitFor();
  await page.screenshot({ path: `${out}/${name}-hero.png` });
  await page.locator("#collection").scrollIntoViewIfNeeded();
  await page
    .locator("#collection img")
    .evaluateAll((images) => Promise.all(images.map((image) => image.decode().catch(() => {}))));
  await page.screenshot({ path: `${out}/${name}-collection.png` });
  await page.locator("#sound").scrollIntoViewIfNeeded();
  await page.locator("#sound img").evaluate((image) => image.decode());
  await page.screenshot({ path: `${out}/${name}-story.png` });
  await page.locator("#credits summary").click();
  const credits = await page.locator("#credits li").count();
  const measurements = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    headingSize: getComputedStyle(document.querySelector("h1")).fontSize,
    heroImagePosition: getComputedStyle(document.querySelector(".hero-product")).position,
    images: [...document.querySelectorAll("main img")].map((image) => ({
      alt: image.alt,
      loaded: image.complete && image.naturalWidth > 0,
    })),
  }));
  if (
    measurements.overflow ||
    measurements.heroImagePosition === "static" ||
    measurements.images.some((image) => !image.loaded) ||
    errors.length ||
    credits !== 8
  )
    throw new Error(JSON.stringify({ name, measurements, errors, credits }));
  await page.evaluate(() => {
    document.querySelector("#credits").open = false;
    window.scrollTo(0, 0);
  });
  if (["desktop", "mobile"].includes(name))
    await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  results.push({ viewport: name, width, height, ...measurements, credits, errors });
  await page.close();
}
const fallback = await browser.newPage({
  javaScriptEnabled: false,
  viewport: { width: 390, height: 844 },
});
await fallback.goto(base);
const noJS = await fallback.getByRole("heading", { level: 1 }).isVisible();
if (!noJS) throw new Error("No-JavaScript headline unavailable");
console.log(JSON.stringify({ results, noJavaScriptHeadline: noJS, screenshots: out }, null, 2));
await browser.close();
