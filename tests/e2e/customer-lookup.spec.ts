import { expect, test } from "@playwright/test";

// Real guest route only. Privileged interaction/layout checks use clearly labeled
// local action fixtures in backend-customer-lookup-ui.test.ts, not native staff proof.
test.use({ reducedMotion: "reduce", screenshot: "off", trace: "off", video: "off" });

test("guest exact lookup redirects to login without customer controls or results", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
  }
  await page.addInitScript(() => sessionStorage.setItem("shopthie-intro-v1", "seen"));
  const response = await page.goto("/admin/customers");
  // Next Cache Components can stream a 200 redirect; assert browser navigation, not status alone.
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { name: "Customer lookup.", level: 1 })).toHaveCount(0);
  await expect(
    page.locator(
      'input[name="expected_subject"],input[name="target_subject"],select[name="reason"],.customer-lookup-result,.customer-status-manager,.customer-status-record',
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /look up customer/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /check current access|suspend application access|reactivate application access/i,
    }),
  ).toHaveCount(0);
  await expect(page.locator('a[href="/admin/customers"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
