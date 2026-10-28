import { test, expect } from "@playwright/test";

test("shop and collection links remain browsable with JavaScript disabled", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: info.project.use.viewport,
  });
  try {
    const page = await context.newPage();
    for (const [path, count] of [
      ["/shop", 7],
      ["/collections/headphones", 2],
      ["/collections/earbuds", 1],
      ["/collections/speakers", 2],
      ["/collections/smartphones", 2],
    ] as const) {
      await page.goto(path);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(main.locator("[data-product-card]")).toHaveCount(count);
      // Playwright's aggregate text matcher skips NOSCRIPT subtrees, even in a
      // scripting-disabled document. Assert its actual rendered paragraph.
      const guidance = main.locator("noscript p");
      await expect(guidance).toBeVisible();
      await expect(guidance).toContainText("Interactive filters and shopping require JavaScript");
    }
    await page.goto("/shop");
    await page.getByRole("link", { name: "View AirPods Max", exact: true }).click();
    await expect(page).toHaveURL(/\/products\/apple-airpods-max$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AirPods Max");
  } finally {
    await context.close();
  }
});
