import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("shopthie-intro-v1", "seen"));
});

test("login offers a labelled, accessible password form with native validation", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  const form = page.getByRole("form", { name: "Sign in" });
  const email = form.getByLabel("Email", { exact: true });
  const password = form.getByLabel("Password", { exact: true });
  await expect(email).toHaveAttribute("type", "email");
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute(
    "href",
    "/signup",
  );
  const accessibility = await new AxeBuilder({ page })
    .include("#main")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

for (const gate of [
  {
    path: "/signup",
    heading: "Account creation is not open.",
    explanation: /public signup is currently disabled/i,
  },
  {
    path: "/forgot-password",
    heading: "Password recovery is not available yet.",
    explanation: /recovery email delivery is not enabled/i,
  },
]) {
  test(`${gate.path} explains the gate without collecting personal data`, async ({ page }) => {
    await page.goto(gate.path);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: gate.heading, level: 1 })).toBeVisible();
    await expect(main).toContainText(gate.explanation);
    await expect(main.locator("form, input")).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    await expect(main.getByRole("link", { name: "Back to the edit" })).toHaveAttribute(
      "href",
      "/shop",
    );
  });
}

test("guest account access redirects to login without account details", async ({ page }) => {
  const response = await page.goto("/account");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
});

test("a malformed provider session cookie cannot unlock the account", async ({
  page,
  context,
  baseURL,
}) => {
  // Use the actual app-owned cookie name; an ignored legacy cookie would prove nothing.
  await context.addCookies([
    {
      name: "shopthie-auth",
      value: "base64-not-a-session",
      url: baseURL!,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const response = await page.goto("/account");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Welcome back.", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
});

test("a forged session and elevated metadata cannot authenticate an account", async ({
  page,
  context,
  baseURL,
}) => {
  const subject = "11111111-1111-4111-8111-111111111111";
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: subject,
      exp: expires,
      aal: "aal2",
      role: "authenticated",
      app_metadata: { role: "owner" },
    }),
  ).toString("base64url");
  // Explicit synthetic attack fixture, NOT a real token or provider response.
  const fake = {
    access_token: `${header}.${payload}.invalid-signature`,
    refresh_token: "unit-not-a-refresh-token",
    expires_at: expires,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: subject,
      email: "unit@example.invalid",
      role: "authenticated",
      app_metadata: { role: "owner" },
      user_metadata: { role: "owner" },
      created_at: "2026-01-01T00:00:00Z",
    },
  };
  await context.addCookies([
    {
      name: "shopthie-auth",
      value: "base64-" + Buffer.from(JSON.stringify(fake)).toString("base64url"),
      url: baseURL!,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("unit@example.invalid");
});

test("Account navigation stays stable on desktop and at 320px without overflow", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  if (mobile) await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/shop");
  const header = page.getByRole("banner");
  if (mobile) {
    await expect(header.locator(".header-account")).toBeHidden();
    await header.getByRole("button", { name: "Open navigation" }).click();
    await expect(header.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  }
  const account = header.getByRole("link", { name: "Account", exact: true });
  await expect(account).toBeVisible();
  await expect(account).toHaveAttribute("href", "/account");
  await account.click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  const form = page.getByRole("form", { name: "Sign in" });
  await expect(form).toBeVisible();
  for (const control of await form.locator('input:not([type="hidden"]), button').all()) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("failed login returns a generic accessible error and a usable form", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/login?next=https%3A%2F%2Fexample.invalid");
  const email = "identity-regression@example.invalid";
  const password = "NotARealAccount-Regression-Only!";
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const error = page.getByRole("form", { name: "Sign in" }).getByRole("alert");
  await expect(error).toContainText(/sign in|try again|unavailable/i, { timeout: 25_000 });
  await expect(error).not.toContainText(email);
  await expect(error).not.toContainText(password);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(page.url()).not.toContain(password);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
});
