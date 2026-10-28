import { expect, test, type Page } from "@playwright/test";

const key = "shopthie-commerce-v1";
type ProbeWindow = typeof window & { commerceWrites: number; releaseCommerceLock?: () => void };

// Hold the REAL origin lock until both tabs have queued their UI intents. This
// makes overlap deterministic instead of hoping two sequential clicks race.
async function holdCommerceLock(page: Page) {
  await page.evaluate(
    (key) =>
      new Promise<void>((acquired) => {
        void navigator.locks.request(
          key,
          { mode: "exclusive" },
          () =>
            new Promise<void>((release) => {
              (window as ProbeWindow).releaseCommerceLock = release;
              acquired();
            }),
        );
      }),
    key,
  );
}
async function releaseCommerceLock(page: Page) {
  await page.evaluate(() => (window as ProbeWindow).releaseCommerceLock?.());
}
async function pendingCommerceLocks(page: Page) {
  return page.evaluate(
    async (key) =>
      (await navigator.locks.query()).pending?.filter((lock) => lock.name === key).length ?? 0,
    key,
  );
}
async function writes(page: Page) {
  return page.evaluate(() => (window as ProbeWindow).commerceWrites);
}

test("overlapping tabs serialize local cart intents, converge, and stop writing", async ({
  page,
  context,
}) => {
  await context.addInitScript((key) => {
    (window as ProbeWindow).commerceWrites = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) (window as ProbeWindow).commerceWrites++;
      return set.call(this, name, value);
    };
  }, key);
  const other = await context.newPage();
  await Promise.all(
    [page, other].map(async (tab) => {
      await tab.emulateMedia({ reducedMotion: "reduce" });
      await tab.goto("/products/google-pixel-8");
      await expect(tab.getByRole("button", { name: "Add to bag", exact: true })).toBeEnabled();
    }),
  );
  expect((await writes(page)) + (await writes(other))).toBe(0);
  const drawer = (tab: Page) => tab.getByRole("dialog", { name: "Your bag", exact: true });

  await holdCommerceLock(page);
  try {
    await Promise.all(
      [page, other].map((tab) =>
        tab.getByRole("button", { name: "Add to bag", exact: true }).click(),
      ),
    );
    await expect
      .poll(() => pendingCommerceLocks(page), { timeout: 1000, intervals: [10, 25, 50] })
      .toBe(2);
    // Neither tab may expose quantity controls before its add has committed.
    await expect(drawer(page)).toHaveCount(0);
    await expect(drawer(other)).toHaveCount(0);
  } finally {
    await releaseCommerceLock(page);
  }
  for (const tab of [page, other]) {
    await expect(drawer(tab).locator("[data-cart-line]")).toHaveCount(1);
    await expect(drawer(tab).getByRole("spinbutton")).toHaveValue("2");
  }
  expect((await writes(page)) + (await writes(other))).toBe(2);

  // Mix an absolute quantity update with a wishlist intent in the other tab.
  // Both must reduce against the latest committed document, not a stale render.
  await other.keyboard.press("Escape");
  await expect(drawer(other)).toHaveCount(0);
  await holdCommerceLock(page);
  try {
    await Promise.all([
      drawer(page)
        .getByRole("button", { name: /Increase quantity for/ })
        .click(),
      other.getByRole("button", { name: "Save Pixel 8", exact: true }).click(),
    ]);
    await expect
      .poll(() => pendingCommerceLocks(page), { timeout: 1000, intervals: [10, 25, 50] })
      .toBe(2);
  } finally {
    await releaseCommerceLock(page);
  }
  await expect(drawer(page).getByRole("spinbutton")).toHaveValue("3");
  for (const tab of [page, other]) {
    await expect(tab.locator(".save-product")).toHaveAttribute("aria-pressed", "true");
    await expect(tab.locator(".demo-stock")).toHaveText("2 remaining in this demo option");
  }
  await other.getByRole("button", { name: "Open bag", exact: true }).click();
  await expect(drawer(other).getByRole("spinbutton")).toHaveValue("3");

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(Object.keys(persisted).sort()).toEqual(["cart", "version", "wishlist"]);
  expect(persisted.version).toBe(1);
  expect(persisted.cart).toHaveLength(1);
  expect(persisted.cart[0].quantity).toBe(3);
  expect(Object.keys(persisted.cart[0]).sort()).toEqual(["productId", "quantity", "variantId"]);
  expect(persisted.wishlist).toEqual(["google-pixel-8"]);
  expect((await writes(page)) + (await writes(other))).toBe(4);

  // Deliver obsolete payloads AFTER newer writes. The handler must read the
  // current persisted state, and remote hydration must never feed setItem.
  await Promise.all(
    [page, other].map((tab) =>
      tab.evaluate((key) => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: '{"version":1,"cart":[],"wishlist":[]}',
            storageArea: localStorage,
          }),
        );
      }, key),
    ),
  );
  await page.waitForTimeout(350);
  for (const tab of [page, other]) {
    await expect(drawer(tab).getByRole("spinbutton")).toHaveValue("3");
    await expect(tab.locator(".save-product")).toHaveAttribute("aria-pressed", "true");
  }
  expect((await writes(page)) + (await writes(other))).toBe(4);
  await page.waitForTimeout(350);
  expect((await writes(page)) + (await writes(other))).toBe(4);

  // Native cross-tab deletion and key-null clear events must not be echoed.
  await page.evaluate((key) => localStorage.removeItem(key), key);
  await expect(drawer(other).locator("[data-cart-line]")).toHaveCount(0);
  await expect(other.locator(".save-product")).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(
    ({ key, persisted }) => localStorage.setItem(key, JSON.stringify(persisted)),
    { key, persisted },
  );
  await expect(drawer(other).getByRole("spinbutton")).toHaveValue("3");
  await page.evaluate(() => localStorage.clear());
  await expect(drawer(other).locator("[data-cart-line]")).toHaveCount(0);
  await expect(other.locator(".save-product")).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(350);
  expect((await writes(page)) + (await writes(other))).toBe(5); // four intents + explicit reseed
  expect(await other.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await other.close();
});
