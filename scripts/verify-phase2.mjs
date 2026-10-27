import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.SHOPTHIE_URL || "http://127.0.0.1:3100";
const out = "docs/screenshots/phase-2";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];

for (const [name, width, height] of [
  ["small-mobile", 360, 800],
  ["mobile", 390, 844],
  ["tablet", 834, 1112],
  ["desktop", 1440, 1000],
  ["wide", 1920, 1080],
]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
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
      imagesLoaded: [...document.querySelectorAll("main img, dialog[open] img")].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
      heading: document.querySelector("h1")?.textContent,
    }));
    if (state.overflow || !state.imagesLoaded || errors.length)
      throw new Error(JSON.stringify({ name, scene, state, errors }));
    await page.screenshot({ path: `${out}/${name}-${scene}.png` });
    if (["mobile", "desktop"].includes(name) && ["shop", "product", "cart"].includes(scene))
      await page.screenshot({ path: `${out}/${name}-${scene}-full.png`, fullPage: true });
    results.push({ viewport: name, width, height, scene, ...state, runtimeErrors: [...errors] });
  };
  await page.goto(`${base}/shop`, { waitUntil: "networkidle" });
  await page.locator("[data-product-card]").first().waitFor();
  await capture("shop");
  await page.getByRole("button", { name: "Quick view AirPods Max", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await capture("quick-view");
  await page.keyboard.press("Escape");
  await page.goto(`${base}/products/apple-airpods-max`, { waitUntil: "networkidle" });
  await capture("product");
  await page.goto(`${base}/products/google-pixel-8`, { waitUntil: "networkidle" });
  await page.getByLabel("Product option").selectOption({ index: 1 });
  await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
  await page.getByRole("button", { name: "Save Pixel 8", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("dialog", { name: "Your bag", exact: true }).waitFor();
  await capture("bag-drawer");
  await page.keyboard.press("Escape");
  for (const route of ["cart", "wishlist", "checkout", "about", "collections/speakers"]) {
    await page.goto(`${base}/${route}`, { waitUntil: "networkidle" });
    if (route === "cart") await page.locator("[data-cart-line]").waitFor();
    if (route === "wishlist") await page.locator("[data-product-card]").waitFor();
    await capture(route.replace("/", "-"));
  }
  await page.close();
}
await browser.close();
await writeFile("docs/phase-2-browser-results.json", JSON.stringify(results, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      checkedScenes: results.length,
      viewports: [...new Set(results.map((row) => row.viewport))],
      overflow: results.filter((row) => row.overflow).length,
      runtimeErrors: results.flatMap((row) => row.runtimeErrors),
      screenshots: out,
    },
    null,
    2,
  ),
);
