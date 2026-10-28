import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

test("profile route denies guests before rendering personal-data controls", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("shopthie-intro-v1", "seen"));
  const response = await page.goto("/account/profile");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  await expect(
    page.locator('input[name="username"],input[name="phone"],input[name="age"]'),
  ).toHaveCount(0);
});
