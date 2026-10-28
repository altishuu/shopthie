import { test, expect } from "@playwright/test";
import { categoryDefinitions, products } from "../../src/data/products";

test("every seeded product and collection resolves through its own deep link", async ({ page }) => {
  // Eleven document loads intentionally replay the readable intro. Keep each
  // assertion's normal timeout; only budget this multi-route sweep accordingly.
  test.setTimeout(60_000);
  for (const product of products) {
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(product.name);
    await expect(page.getByLabel("Product option").locator("option")).toHaveCount(
      product.variants.length,
    );
    await expect(page.getByRole("button", { name: "Add to bag", exact: true })).toBeEnabled();
    await page
      .locator(".gallery-stage img")
      .evaluate((image) => (image as HTMLImageElement).decode());
    expect(
      await page
        .locator(".gallery-stage img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  }
  for (const category of categoryDefinitions) {
    await page.goto(`/collections/${category.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${category.label}.`);
    await expect(page.locator("[data-product-card]")).toHaveCount(
      products.filter((product) => product.category === category.slug).length,
    );
    await expect(page.getByRole("button", { name: category.label, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
});
