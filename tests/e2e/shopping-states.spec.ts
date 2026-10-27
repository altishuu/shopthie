import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("quick view confines focus, switches gallery images and restores its trigger", async ({
  page,
}) => {
  await page.goto("/shop");
  const trigger = page.getByRole("button", { name: "Quick view AirPods Max", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Quick view", exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThan(0);
  expect(bounds!.y).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "Next photograph" }).click();
  await expect(dialog.getByRole("status")).toContainText("Photograph 2 of 2");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
  }
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "View full product details" }).click();
  await expect(page).toHaveURL(/\/products\/apple-airpods-max$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Next photograph" }).click();
  await expect(page.locator(".gallery-caption")).toContainText("Photograph 2 of 2");
});

test("empty states, no results, collections and invalid routes are usable", async ({ page }) => {
  await page.goto("/shop?q=absolutely-no-product-like-this");
  await expect(page.getByRole("heading", { name: "Nothing here. Yet." })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("[data-product-card]")).toHaveCount(7);
  await page.goto("/collections/earbuds");
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "A little room for something good." }),
  ).toBeVisible();
  await page.goto("/wishlist");
  await expect(page.getByRole("heading", { name: "Keep something in mind." })).toBeVisible();
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Nothing to preview yet." })).toBeVisible();
  for (const path of [
    "/products/not-a-real-product",
    "/collections/not-a-collection",
    "/not-a-page",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Nothing here.");
    await expect(
      page.getByRole("link", { name: "Explore the collection", exact: true }),
    ).toBeVisible();
  }
});

test("demo stock limits and removing the last bag line provide clear feedback", async ({
  page,
}) => {
  await page.goto("/products/google-pixel-8");
  await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("5");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Your bag", exact: true });
  await expect(dialog.getByRole("spinbutton")).toHaveValue("5");
  await expect(dialog.getByRole("button", { name: /Increase quantity for/ })).toBeDisabled();
  await dialog.getByRole("button", { name: /Remove Pixel 8 .* from bag/ }).click();
  await expect(dialog.locator("[data-cart-line]")).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", { name: "A little room for something good." }),
  ).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Your bag", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
  await dialog.getByRole("link", { name: "Explore the collection", exact: true }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("corrupt saved data is ignored and new shopping actions still work", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("shopthie-commerce-v1", "{not valid json"));
  await page.goto("/products/apple-airpods-max");
  await expect(page.getByRole("button", { name: "Add to bag", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Your bag" }).locator("[data-cart-line]"),
  ).toHaveCount(1);
});

test("blocked persistence falls back to in-memory shopping without crashing", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "shopthie-commerce-v1") throw new DOMException("Blocked", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "shopthie-commerce-v1") throw new DOMException("Blocked", "SecurityError");
      return set.call(this, key, value);
    };
  });
  await page.goto("/products/apple-airpods-max");
  await expect(page.getByText(/Your browser is blocking saved state/)).toBeVisible();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Your bag" });
  await expect(dialog.locator("[data-cart-line]")).toHaveCount(1);
  await dialog.getByRole("link", { name: "View your bag", exact: true }).click();
  await expect(page.locator("[data-cart-line]")).toHaveCount(1);
});

test("saved bag changes synchronize between tabs", async ({ page, context }) => {
  await page.goto("/products/google-pixel-8");
  const other = await context.newPage();
  await other.goto("/cart");
  await expect(
    other.getByRole("heading", { name: "A little room for something good." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(other.locator("[data-cart-line]")).toHaveCount(1);
  await other.getByRole("button", { name: /Remove Pixel 8 .* from bag/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Your bag" }).locator("[data-cart-line]"),
  ).toHaveCount(0);
  await other.close();
});

test("commerce routes preserve responsive layout and automated accessibility", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of [
    "/shop",
    "/products/google-pixel-8",
    "/cart",
    "/wishlist",
    "/checkout",
    "/about",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      path,
    ).toBe(false);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations, path).toEqual([]);
  }
});
