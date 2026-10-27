import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the Shopthie design foundation replaces the starter and has working section navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Shopthie/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good sound.");
  expect(
    await page.locator("h1").evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThan(60);
  await expect(page.locator(".hero-product")).toHaveCSS("position", "absolute");
  await expect(page.getByRole("link", { name: /Explore the edit/ })).toBeVisible();
  await page.getByRole("link", { name: /Explore the edit/ }).click();
  await expect(page).toHaveURL(/#collection$/);
  await expect(page.locator("#collection")).toBeInViewport();
  await expect(page.getByText("Create Next App", { exact: true })).toHaveCount(0);
});

test("mobile navigation is operable by keyboard and does not overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  if (testInfo.project.name === "mobile") {
    const menu = page.getByRole("button", { name: "Open navigation" });
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("design foundation supports reduced motion and has no serious accessibility violations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
