import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Reading order, truthful product details, and primary actions stay independent of motion.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("home follows a deliberate editorial sequence with a real speaker feature", async ({
  page,
}) => {
  await page.goto("/");
  const chapters = await page
    .locator("main [data-home-chapter]")
    .evaluateAll((items) => items.map((item) => item.id));
  expect(chapters).toEqual([
    "flagship",
    "introduction",
    "home-considered-edit",
    "home-new-perspective",
    "home-listening-interlude",
    "story",
    "weekend-edit",
    "collection",
    "closing",
  ]);
  const feature = page.getByRole("region", { name: "A change of scene." });
  await expect(feature.getByRole("link", { name: /Explore JBL Flip 3/ })).toHaveAttribute(
    "href",
    "/products/jbl-flip-3",
  );
  await expect(feature.getByRole("link", { name: /speaker edit/ })).toHaveAttribute(
    "href",
    "/collections/speakers",
  );
  await expect(
    page.getByText(/best[- ]selling|best sellers|new arrivals|limited.time|sale ends/i),
  ).toHaveCount(0);
});

test("About explains its editorial principles and honest demo boundaries", async ({ page }) => {
  await page.goto("/about");
  const principles = page.getByRole("region", { name: "The way we look at things" });
  await expect(principles.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("look closer");
  await expect(page.getByText(/no live inventory, payment processing/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore the collection/ })).toHaveAttribute(
    "href",
    "/shop",
  );
});

test("product storytelling exposes canonical specifications and links directly to purchase controls", async ({
  page,
}) => {
  await page.goto("/products/google-pixel-8");
  const story = page.getByRole("region", { name: "A closer look." });
  await expect(story).toContainText("Google Tensor G3");
  await expect(story).toContainText("128 GB / 256 GB");
  await expect(story.getByRole("link", { name: /Choose your configuration/ })).toHaveAttribute(
    "href",
    "#product-purchase",
  );
  await story.getByRole("link", { name: /Choose your configuration/ }).click();
  await expect(page.locator("#product-purchase")).toBeInViewport();
  await expect(page.getByRole("button", { name: /Add to bag/ }).first()).toBeEnabled();
  await page.getByRole("combobox", { name: "Product option" }).selectOption({ label: "256 GB" });
  await page
    .getByRole("button", { name: /Add to bag/ })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Your bag" })).toContainText("256 GB");
});

test("editorial pages retain readable accessible content at narrow and landscape sizes", async ({
  page,
}) => {
  for (const size of [
    { width: 320, height: 740 },
    { width: 568, height: 320 },
  ]) {
    await page.setViewportSize(size);
    for (const path of ["/", "/about", "/products/apple-airpods-max"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations, `${path} at ${size.width}`).toEqual([]);
    }
  }
});

test("mobile gallery keeps the image useful without consuming a full short viewport", async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 568, height: 320 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/products/apple-airpods-max");
    await expect(page.locator(".gallery-stage")).toBeVisible();
    const stage = await page.locator(".gallery-stage").boundingBox();
    expect(stage!.height).toBeLessThanOrEqual(
      Math.max(220, Math.min(size.width * 0.85, size.height * 0.65)),
    );
    await expect(page.getByRole("button", { name: "Next photograph" })).toBeVisible();
    await page.getByRole("button", { name: "Next photograph" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Photograph 2 of 2" })).toBeVisible();
  }
});

test("short landscape navigation scrolls inside the viewport and closes on selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(nav).toBeInViewport({ ratio: 1 });
  const credits = nav.getByRole("link", { name: "Image credits" });
  await credits.focus();
  await expect(credits).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.press("Enter");
  await expect(nav).toBeHidden();
  await expect(page).toHaveURL(/#credits$/);
});
