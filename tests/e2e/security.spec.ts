import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce", screenshot: "off", trace: "off", video: "off" });

test("security route redirects guests without exposing MFA controls or setup", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
  }
  await page.addInitScript(() => sessionStorage.setItem("shopthie-intro-v1", "seen"));
  const response = await page.goto("/account/security");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  await expect(
    page.locator(
      'input[name="code"],input[name="expected_subject"],input[name="acknowledge_backup"],input[name="confirm_remove"],img[alt="Authenticator setup QR code"]',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /set up authenticator|verify authenticator|remove authenticator|cancel pending setup/i,
    }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
