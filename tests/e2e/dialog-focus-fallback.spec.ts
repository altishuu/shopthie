import { test, expect, type Locator, type Page } from "@playwright/test";

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function expectFocusTrapped(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
  }
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`last demo quantity returns keyboard focus to the purchase context (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/products/google-pixel-8");
    const purchase = page.locator("#product-purchase");
    const quantity = purchase.getByRole("spinbutton", { name: "Quantity", exact: true });
    const add = purchase.getByRole("button", { name: "Add to bag", exact: true });
    await expect(add).toBeEnabled();
    const previousOverflow = await page.evaluate(() => document.body.style.overflow);

    // Use native keyboard focus and activation, not click(), focus(), or a DOM event.
    await tabTo(page, quantity);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("5");
    await expect(quantity).toHaveValue("5");
    await tabTo(page, add);
    await expect(add).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Your bag", exact: true });
    await expect(dialog.getByRole("spinbutton")).toHaveValue("5");
    const disabledOpener = purchase.getByRole("button", {
      name: "Demo limit reached",
      exact: true,
      includeHidden: true,
    });
    await expect(disabledOpener).toBeDisabled();
    await expect(quantity).toBeDisabled();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await expectFocusTrapped(page, dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || active === document.body) return false;
          const contextualTarget = active.matches(
            "#product-purchase .product-options :is(button, input, select, textarea, a[href]), #product-purchase, #product-purchase h1, main",
          );
          return (
            contextualTarget &&
            active.isConnected &&
            !active.matches(':disabled, [aria-disabled="true"]') &&
            !active.closest('dialog, [hidden], [inert], [aria-hidden="true"]') &&
            active.getClientRects().length > 0 &&
            getComputedStyle(active).visibility === "visible"
          );
        }),
      )
      .toBe(true);
    await expect(disabledOpener).not.toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(previousOverflow);
  });
}

test("ordinary quick-view opener keeps native keyboard restoration and trapping", async ({
  page,
}) => {
  await page.goto("/shop");
  const trigger = page.getByRole("button", { name: "Quick view AirPods Max", exact: true });
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Quick view", exact: true });
  await expectFocusTrapped(page, dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
