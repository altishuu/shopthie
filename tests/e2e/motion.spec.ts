import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function idle(page: import("@playwright/test").Page) {
  await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
  await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
}

test("first visit has a bounded real-readiness introduction; repeats abbreviate it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await idle(page);
  await expect(page.locator("html")).toHaveAttribute("data-intro-kind", "full");
  await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#hero-title")).toBeVisible();
  await expect(page.locator("#hero-title")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => sessionStorage.getItem("shopthie-intro-v1"))).toBe("seen");
  await page.reload();
  await idle(page);
  await expect(page.locator("html")).toHaveAttribute("data-intro-kind", "abbreviated");
  expect(errors).toEqual([]);
});

test("navigation is interruptible and browser history remains native", async ({ page }, info) => {
  await page.goto("/");
  await idle(page);
  // Header links stay available while the transition layer moves.
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Shop", exact: true })
      .click();
  } else {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Shop", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Our perspective", exact: true })
      .click();
    await expect(page).toHaveURL(/\/about$/);
    await idle(page);
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Shop", exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/shop$/);
  await idle(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The considered edit.");
  await page.evaluate(() => scrollTo({ top: 400, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(400);
  await page.locator('[data-product-card="apple-airpods-max"] .product-image-link').click();
  await expect(page).toHaveURL(/\/products\/apple-airpods-max$/);
  await idle(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/shop$/);
  await idle(page);
  await expect(page.locator("[data-product-card]:visible")).toHaveCount(7);
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - 400))).toBeLessThan(12);
  await page.goForward();
  await expect(page).toHaveURL(/\/products\/apple-airpods-max$/);
  await idle(page);
});

test("reduced motion and live preference changes release every overlay and scroll lock", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await idle(page);
  await expect(page.locator("html")).toHaveAttribute("data-motion-mode", "reduced");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveAttribute("data-motion-mode", "full");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion-mode", "reduced");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator("#route-veil")).toBeHidden();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("a rapid click back to the current route cancels the pending exit", async ({ page }) => {
  await page.goto("/shop");
  await idle(page);
  await page.getByRole("navigation", { name: "Footer navigation" }).evaluate((nav) => {
    const links = [...nav.querySelectorAll<HTMLAnchorElement>("a")];
    links.find((link) => link.getAttribute("href") === "/about")!.click();
    links.find((link) => link.getAttribute("href") === "/shop")!.click();
  });
  await idle(page);
  await expect(page).toHaveURL(/\/shop$/);
});

test("the editorial pin has one owner across route hide and restoration", async ({
  page,
}, info) => {
  await page.goto("/");
  await idle(page);
  const expected = info.project.name === "desktop" ? 1 : 0;
  await expect(page.locator(".pin-spacer")).toHaveCount(expected);
  await expect(page.locator("[data-home-scene]:visible")).toHaveCount(3);
  await page
    .getByRole("navigation", { name: "Footer navigation" })
    .getByRole("link", { name: "Shop", exact: true })
    .click();
  await expect(page).toHaveURL(/\/shop$/);
  await idle(page);
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL("/");
  await idle(page);
  await expect(page.locator(".pin-spacer")).toHaveCount(expected);
  await expect(page.locator("[data-home-scene]:visible")).toHaveCount(3);
});

test("skip link focuses the visible route rather than a retained hidden page", async ({ page }) => {
  await page.goto("/shop");
  await idle(page);
  await page.locator('[data-product-card="apple-airpods-max"] .product-image-link').click();
  await expect(page).toHaveURL(/\/products\/apple-airpods-max$/);
  await idle(page);
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("magnetic controls reset completely when reduced motion is enabled", async ({
  page,
}, info) => {
  await page.goto("/");
  await idle(page);
  const button = page.getByRole("link", { name: /Explore the edit/ });
  const rect = await button.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2 + 14, rect!.y + rect!.height / 2 + 6);
  if (info.project.name === "desktop") await expect(button).not.toHaveCSS("transform", "none");
  await page.mouse.move(1, 1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(button).toHaveCSS("transform", "none");
});

test("unavailable critical assets cannot keep the intro locked", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*hero-apple-airpods-max*", async (route) => {
    await held;
    await route.abort();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "loading");
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete", {
      timeout: 4500,
    });
    await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
    await expect(page.locator("#experience")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    release();
  }
});

test("the introduction can be skipped while a critical asset is pending", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*hero-apple-airpods-max*", async (route) => {
    await held;
    await route.abort();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Skip intro/ }).click();
    await idle(page);
    await expect(page.locator("#intro-screen")).toBeHidden();
    await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
  } finally {
    release();
  }
});

test("floating navigation returns after leaving a scrolled page", async ({ page }, info) => {
  await page.goto("/");
  await idle(page);
  await page
    .getByRole("navigation", { name: "Footer navigation" })
    .getByRole("link", { name: "Shop", exact: true })
    .click();
  await expect(page).toHaveURL(/\/shop$/);
  await idle(page);
  await expect(page.locator(".site-header")).toBeInViewport();
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  }
});

test("full-motion editorial text preserves contrast before scroll reveals", async ({ page }) => {
  await page.goto("/");
  await idle(page);
  await expect(page.locator(".hero-bottom")).toHaveCSS("opacity", "1");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("modal wheel scrolling is isolated and motion returns after closing", async ({ page }) => {
  await page.goto("/shop");
  await idle(page);
  await page.getByRole("button", { name: "Quick view AirPods Max", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Quick view", exact: true });
  await expect(dialog).toBeVisible();
  const before = await page.evaluate(() => window.scrollY);
  await dialog.hover();
  await page.mouse.wheel(0, 320);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(
    page.getByRole("button", { name: "Quick view AirPods Max", exact: true }),
  ).toBeFocused();
});

test("homepage content and shopping links remain available without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3101/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good sound.");
  await expect(page.locator("#intro-screen")).toBeHidden();
  await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
  await page.getByRole("link", { name: "Shop the collection", exact: true }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The considered edit.");
  await context.close();
});
