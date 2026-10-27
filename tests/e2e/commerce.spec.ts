import { test, expect } from "@playwright/test";

test("catalog search, category, sort and browser history retain shareable state", async ({
  page,
}) => {
  await page.goto("/shop");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The considered edit.");
  await expect(page.locator("[data-product-card]")).toHaveCount(7);
  await page.getByRole("button", { name: "Headphones", exact: true }).click();
  await expect(page).toHaveURL(/category=headphones/);
  await expect(page.locator("[data-product-card]")).toHaveCount(2);
  await page.getByLabel("Sort products").selectOption("price-asc");
  await expect(page).toHaveURL(/sort=price-asc/);
  await page.getByLabel("Search products").fill("Bose");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await expect(page).toHaveURL(/q=Bose/);
  await page.reload();
  await expect(page.getByLabel("Search products")).toHaveValue("Bose");
  await expect(page.getByRole("button", { name: "Headphones", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("[data-product-card]")).toHaveCount(7);
  await page.goBack();
  await expect(page.getByLabel("Search products")).toHaveValue("Bose");
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
});

test("product options, bag quantities, wishlist and demo checkout work and persist", async ({
  page,
}) => {
  const postRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") postRequests.push(request.url());
  });
  await page.goto("/products/google-pixel-8");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pixel 8");
  const unitPrice = Number(await page.locator(".detail-price").getAttribute("data-unit-price"));
  await page.getByLabel("Product option").selectOption({ index: 1 });
  await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
  await page.getByRole("button", { name: "Save Pixel 8", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Your bag", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-cart-line]")).toHaveCount(1);
  await expect(drawer.getByRole("spinbutton")).toHaveValue("2");
  await drawer.getByRole("link", { name: "View your bag", exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await page.reload();
  await expect(page.locator("[data-cart-line]")).toHaveCount(1);
  await expect(page.getByRole("spinbutton")).toHaveValue("2");
  await page.getByRole("button", { name: /Increase quantity for/ }).click();
  await expect(page.getByRole("spinbutton")).toHaveValue("3");
  await expect(page.locator("[data-cart-subtotal]")).toHaveAttribute(
    "data-cart-subtotal",
    String(unitPrice * 3),
  );
  await page.goto("/products/google-pixel-8");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(drawer.locator("[data-cart-line]")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to bag", exact: true })).toBeFocused();
  await page.goto("/wishlist");
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await expect(page.locator("[data-product-card]")).toContainText("Pixel 8");
  await page.reload();
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
  await page.goto("/cart");
  await page.getByRole("link", { name: "Continue to demo checkout", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Checkout demonstration.");
  await page.getByRole("button", { name: "Complete demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Demo complete.", exact: true })).toBeVisible();
  await expect(page.getByText("No order was placed.", { exact: false })).toBeVisible();
  expect(postRequests).toEqual([]);
});
