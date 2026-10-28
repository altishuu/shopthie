import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const base = process.env.SHOPTHIE_URL || "http://127.0.0.1:3102";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
try {
  await page.goto(`${base}/`);
  await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
  await expect(page.locator("html")).toHaveAttribute("data-motion-mode", "full");
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 244, 240)");
  await page
    .getByRole("navigation", { name: "Footer navigation" })
    .getByRole("link", { name: "Shop", exact: true })
    .click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await page.locator('[data-product-card="google-pixel-8"] .product-image-link').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pixel 8");
  await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("spinbutton")).toHaveValue("2");
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion-mode", "reduced");
  await expect(page.locator("html")).not.toHaveClass(/lenis/);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveClass(/lenis/);
  expect(errors).toEqual([]);
  const result = {
    base,
    developmentStrictMode: "pass",
    routes: ["/", "/shop", "/products/google-pixel-8"],
    pinSetupCleanup: "pass",
    quantity: 2,
    liveReducedMotion: "pass",
    runtimeOrConsoleErrors: errors,
  };
  await writeFile("docs/phase-3-dev-results.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
