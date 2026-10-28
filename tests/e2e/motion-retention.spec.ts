import { test, expect } from "@playwright/test";

test("repeated page restores do not retain new media-query listeners", async ({
  page,
  context,
  browserName,
}, info) => {
  test.skip(browserName !== "chromium", "CDP listener counters are Chromium-specific");
  const cdp = await context.newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  const idle = async () => {
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
    await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
    await page.waitForTimeout(1200);
  };
  const cycle = async () => {
    await page
      .getByRole("navigation", { name: "Footer navigation" })
      .getByRole("link", { name: "Shop", exact: true })
      .click();
    await expect(page).toHaveURL(/\/shop$/);
    await idle();
    await expect(page.locator(".pin-spacer")).toHaveCount(0);
    await page.locator('.site-header a[href="/"]').click();
    await expect(page).toHaveURL("/");
    await idle();
  };
  const count = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    return cdp.send("Memory.getDOMCounters");
  };
  await page.goto("/");
  await idle();
  await cycle();
  const baseline = await count();
  for (let index = 0; index < 3; index += 1) await cycle();
  const after = await count();
  await info.attach("retained-listeners", {
    body: JSON.stringify({ baseline, after }),
    contentType: "application/json",
  });
  expect(
    after.jsEventListeners - baseline.jsEventListeners,
    "disposed media queries must release native listeners",
  ).toBeLessThanOrEqual(2);
});
