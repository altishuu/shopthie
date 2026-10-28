import { test, expect, type Page } from "@playwright/test";

async function holdAppScripts(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await gate;
    if (!page.isClosed()) await route.continue();
  });
  return release;
}

for (const path of ["/shop", "/collections/smartphones"]) {
  test(`a native product link gesture survives catalog hydration on ${path}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const release = await holdAppScripts(page);
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const link = page.getByRole("link", { name: "View Pixel 8", exact: true });
      await expect(link).toBeVisible();
      await link.scrollIntoViewIfNeeded();
      const originalLink = await link.elementHandle();
      const before = await link.boundingBox();
      expect(before).not.toBeNull();
      // Start the real native gesture against server HTML, not a hydrated locator.
      await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
      await page.mouse.down();
      release();
      await expect(
        page.getByRole("button", { name: "Quick view Pixel 8", exact: true }),
      ).toBeEnabled();
      const connected = await originalLink!.evaluate((node) => node.isConnected);
      const after = await link.boundingBox();
      await info.attach("native-link-handoff", {
        body: JSON.stringify({ path, connected, before, after }, null, 2),
        contentType: "application/json",
      });
      // Do not relocate or restart the gesture after hydration.
      await page.mouse.up();
      expect.soft(connected, "the server-rendered native link must not be replaced").toBe(true);
      await expect(page).toHaveURL(/\/products\/google-pixel-8$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pixel 8");
    } finally {
      release();
      await page.mouse.up();
    }
  });
}
