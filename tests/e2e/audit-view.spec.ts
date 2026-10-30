import { expect, test } from "@playwright/test";

// Bounded guest-only native check. No staff login, MFA operation, account mutation,
// event read, private setup material or screenshots/traces of account content.
test.use({ reducedMotion: "reduce", screenshot: "off", trace: "off", video: "off" });

test("audit history redirects guests without event data or staff controls", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => sessionStorage.setItem("shopthie-intro-v1", "seen"));
  const response = await page.goto("/admin/audit");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator("[data-audit-event],.audit-history-manager")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /load recent events|older events/i })).toHaveCount(
    0,
  );
  await expect(
    page.locator(
      'a[href="/admin/audit"],input[name="expected_subject"],input[name="cursor_created_at"],input[name="cursor_id"],input[name="factor_id"],input[name="code"]',
    ),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
