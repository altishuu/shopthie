import { expect, test } from "@playwright/test";

// Guest-only native check. Privileged behavior is exercised with explicit unit fixtures;
// never log in, enroll/cancel MFA, or capture private setup material for acceptance.
test.use({ reducedMotion: "reduce", screenshot: "off", trace: "off", video: "off" });

test("protected staff entry redirects guests without exposing staff or MFA controls", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
  }
  await page.addInitScript(() => sessionStorage.setItem("shopthie-intro-v1", "seen"));
  const response = await page.goto("/admin");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Staff entry.", level: 1 })).toHaveCount(0);
  await expect(
    page.locator(
      'input[name="code"],input[name="factor_id"],input[name="expected_subject"],img[alt="Authenticator setup QR code"]',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /set up authenticator|verify authenticator|remove authenticator|cancel pending setup/i,
    }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
