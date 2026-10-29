import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

test("saved-address route protects guests on desktop and narrow mobile", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
  }
  await page.addInitScript(() => sessionStorage.setItem("shopthie-intro-v1", "seen"));
  const response = await page.goto("/account/addresses");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  await expect(
    page.locator(
      'input[name="recipient"],input[name="line1"],select[name="country_code"],input[name="expected_subject"]',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /add address|edit address|delete address/i }),
  ).toHaveCount(0);
  const form = page.getByRole("form", { name: "Sign in" });
  for (const control of await form.locator('input:not([type="hidden"]),button').all()) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
