import { expect, test, type Page } from "@playwright/test";

const key = "shopthie-commerce-v1";
type LockWindow = typeof window & { releaseCommerceLock?: () => void };
const bag = (page: Page) => page.getByRole("dialog", { name: "Your bag", exact: true });
const quick = (page: Page) => page.getByRole("dialog", { name: "Quick view", exact: true });
const add = (page: Page) => page.getByRole("button", { name: "Add to bag", exact: true });

async function pending(locker: Page) {
  return locker.evaluate(
    async (key) =>
      (await navigator.locks.query()).pending?.filter((lock) => lock.name === key).length ?? 0,
    key,
  );
}

// The locker survives navigation in the shopping tab. Always release, even if
// an assertion fails; never wait for all local FIFO intents to request a lock.
async function withHeldLock(locker: Page, action: () => Promise<void>) {
  await locker.evaluate(
    (key) =>
      new Promise<void>((acquired) => {
        void navigator.locks.request(
          key,
          { mode: "exclusive" },
          () =>
            new Promise<void>((release) => {
              (window as LockWindow).releaseCommerceLock = release;
              acquired();
            }),
        );
      }),
    key,
  );
  const started = performance.now();
  try {
    await action();
    // The first local intent blocks; the rest wait in the tab's FIFO, not in
    // navigator.locks.pending. Fail rather than silently testing the fallback.
    expect(await pending(locker)).toBe(1);
    expect(performance.now() - started).toBeLessThan(1800);
  } finally {
    await locker.evaluate(() => (window as LockWindow).releaseCommerceLock?.());
  }
}

async function waitForPending(locker: Page) {
  await expect.poll(() => pending(locker), { timeout: 700, intervals: [10, 25] }).toBe(1);
}

async function persistedQuantity(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.cart[0]?.quantity,
    key,
  );
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const direction of ["Increase", "Decrease"] as const) {
  test(`queued ${direction.toLowerCase()} clicks each apply to the committed quantity`, async ({
    page,
    context,
  }) => {
    await page.goto("/products/google-pixel-8");
    await expect(add(page)).toBeEnabled();
    const initial = direction === "Increase" ? "1" : "4";
    await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill(initial);
    await add(page).click();
    await expect(bag(page).getByRole("spinbutton")).toHaveValue(initial);
    const locker = await context.newPage();
    await locker.goto("/about");
    await withHeldLock(locker, async () => {
      const step = bag(page).getByRole("button", { name: new RegExp(`${direction} quantity for`) });
      for (let i = 0; i < 3; i++) await step.click();
      await waitForPending(locker);
      await expect(bag(page).getByRole("spinbutton")).toHaveValue(initial);
      expect(await persistedQuantity(page)).toBe(Number(initial));
    });
    const expected = direction === "Increase" ? "4" : "1";
    await expect(bag(page).getByRole("spinbutton")).toHaveValue(expected);
    await expect.poll(() => persistedQuantity(page)).toBe(Number(expected));
    await locker.close();
  });
}

test("direct numeric edits stay absolute between queued relative clicks", async ({
  page,
  context,
}) => {
  await page.goto("/products/google-pixel-8");
  await expect(add(page)).toBeEnabled();
  await add(page).click();
  await expect(bag(page).getByRole("spinbutton")).toHaveValue("1");
  const locker = await context.newPage();
  await locker.goto("/about");
  await withHeldLock(locker, async () => {
    const increase = bag(page).getByRole("button", { name: /Increase quantity for/ });
    await increase.click();
    await increase.click();
    await bag(page).getByRole("spinbutton").fill("2");
    await increase.click();
    await waitForPending(locker);
    expect(await persistedQuantity(page)).toBe(1);
  });
  await expect(bag(page).getByRole("spinbutton")).toHaveValue("3");
  await expect.poll(() => persistedQuantity(page)).toBe(3);
  await locker.close();
});

for (const dismissal of ["Escape", "close button"] as const) {
  test(`quick-view ${dismissal} before add commits does not reopen the bag or steal focus`, async ({
    page,
    context,
  }) => {
    await page.goto("/shop");
    const trigger = page.getByRole("button", { name: "Quick view Pixel 8", exact: true });
    await trigger.click();
    await expect(
      quick(page).getByRole("button", { name: "Add to bag", exact: true }),
    ).toBeEnabled();
    const locker = await context.newPage();
    await locker.goto("/about");
    await withHeldLock(locker, async () => {
      await quick(page).getByRole("button", { name: "Add to bag", exact: true }).click();
      await waitForPending(locker);
      if (dismissal === "Escape") await page.keyboard.press("Escape");
      else await quick(page).getByRole("button", { name: "Close quick view", exact: true }).click();
      await expect(quick(page)).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await persistedQuantity(page)).toBeUndefined();
    });
    await expect.poll(() => persistedQuantity(page)).toBe(1);
    await expect(bag(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await locker.close();
  });
}

test("a newer quick view keeps its focus when an older add commits", async ({ page, context }) => {
  await page.goto("/shop");
  await page.getByRole("button", { name: "Quick view Pixel 8", exact: true }).click();
  await expect(add(page)).toBeEnabled();
  const locker = await context.newPage();
  await locker.goto("/about");
  await withHeldLock(locker, async () => {
    await add(page).click();
    await waitForPending(locker);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Quick view AirPods Max", exact: true }).click();
    await expect(
      quick(page).getByRole("heading", { name: "AirPods Max", exact: true }),
    ).toBeVisible();
  });
  await expect.poll(() => persistedQuantity(page)).toBe(1);
  await expect(bag(page)).toHaveCount(0);
  await expect(
    quick(page).getByRole("heading", { name: "AirPods Max", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
  await locker.close();
});

for (const navigation of ["Back", "Forward", "client link"] as const) {
  test(`${navigation} before add commits preserves the cart without reopening overlays`, async ({
    page,
    context,
  }) => {
    await page.goto("/shop");
    // This suite exercises committed shopping intents, not a click spanning the
    // server-preview/client-catalog handoff. Require the interactive surface.
    await expect(
      page.getByRole("button", { name: "Quick view Pixel 8", exact: true }),
    ).toBeEnabled();
    await page.getByRole("link", { name: "View Pixel 8", exact: true }).click();
    await expect(page).toHaveURL(/\/products\/google-pixel-8$/);
    await expect(add(page)).toBeEnabled();
    if (navigation === "Forward") {
      await page.goBack();
      await expect(page).toHaveURL(/\/shop$/);
      await page.getByRole("button", { name: "Quick view Pixel 8", exact: true }).click();
      await expect(add(page)).toBeEnabled();
    }
    const locker = await context.newPage();
    await locker.goto("/about");
    await withHeldLock(locker, async () => {
      await add(page).click();
      await waitForPending(locker);
      if (navigation === "Back") await page.goBack();
      else if (navigation === "Forward") await page.goForward();
      else await page.getByRole("link", { name: "Back to the collection", exact: true }).click();
      await expect(page).toHaveURL(
        navigation === "Forward" ? /\/products\/google-pixel-8$/ : /\/shop$/,
      );
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await persistedQuantity(page)).toBeUndefined();
    });
    await expect.poll(() => persistedQuantity(page)).toBe(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // This remains an accepted mutation, also after a subsequent reload.
    await page.reload();
    await page.getByRole("button", { name: "Open bag", exact: true }).click();
    await expect(bag(page).getByRole("spinbutton")).toHaveValue("1");
    await locker.close();
  });
}

for (const surface of ["PDP", "catalog"] as const) {
  test(`${surface} wishlist notices follow both queued committed toggles`, async ({
    page,
    context,
  }) => {
    await page.goto(surface === "PDP" ? "/products/google-pixel-8" : "/shop");
    const toggle = page.getByRole("button", { name: "Save Pixel 8", exact: true });
    const notice = page.locator('div[role="status"][aria-atomic="true"]');
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(notice).toBeEmpty();
    const locker = await context.newPage();
    await locker.goto("/about");
    await withHeldLock(locker, async () => {
      await toggle.click();
      await toggle.click();
      await waitForPending(locker);
      expect
        .soft(await notice.textContent(), "no success notice before persistence commits")
        .toBe("");
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
    });
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          return raw === null ? null : JSON.parse(raw).wishlist;
        }, key),
      )
      .toEqual([]);
    await expect(notice).toHaveText(/removed.*wishlist/);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await locker.close();
  });
}

for (const surface of ["drawer", "page"] as const) {
  test(`${surface} bag removal waits for commit before success and heading focus`, async ({
    page,
    context,
  }) => {
    await page.goto("/products/google-pixel-8");
    await expect(add(page)).toBeEnabled();
    await add(page).focus();
    await add(page).click();
    await expect(bag(page).getByRole("spinbutton")).toHaveValue("1");
    if (surface === "page") await page.goto("/cart");
    const scope = surface === "drawer" ? bag(page) : page.getByRole("main");
    const heading = scope.getByRole("heading", {
      name: surface === "drawer" ? "Your bag" : "Your bag.",
      exact: true,
    });
    const remove = scope.getByRole("button", { name: /Remove Pixel 8 .* from bag/ });
    await expect(remove).toBeEnabled();
    const notice = page.locator('div[role="status"][aria-atomic="true"]');
    const beforeNotice = await notice.textContent();
    const locker = await context.newPage();
    await locker.goto("/about");
    await withHeldLock(locker, async () => {
      await remove.focus();
      await remove.click();
      await waitForPending(locker);
      expect.soft(await notice.textContent(), "no early removal success").toBe(beforeNotice);
      expect
        .soft(
          await heading.evaluate((node) => node === document.activeElement),
          "no early heading focus",
        )
        .toBe(false);
      await expect(scope.getByRole("spinbutton")).toHaveValue("1");
      expect(await persistedQuantity(page)).toBe(1);
    });
    await expect.poll(() => persistedQuantity(page)).toBeUndefined();
    await expect(notice).toHaveText("Pixel 8 removed from your bag.");
    await expect(scope.getByRole("spinbutton")).toHaveCount(0);
    await expect(heading).toBeFocused();
    await locker.close();
  });
}

for (const cancellation of ["dismissal", "navigation"] as const) {
  test(`bag removal followed by ${cancellation} commits without stale heading focus`, async ({
    page,
    context,
  }) => {
    await page.goto("/products/google-pixel-8");
    await expect(add(page)).toBeEnabled();
    await add(page).focus();
    await add(page).click();
    await expect(bag(page).getByRole("spinbutton")).toHaveValue("1");
    const heading = bag(page).getByRole("heading", { name: "Your bag", exact: true });
    const notice = page.locator('div[role="status"][aria-atomic="true"]');
    const beforeNotice = await notice.textContent();
    // Record even transient focus into retained/closed dialog headings.
    await page.evaluate(() => {
      const root = window as typeof window & { removalHeadingFocus?: number };
      root.removalHeadingFocus = 0;
      document.addEventListener("focusin", (event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.matches("dialog h2, [data-bag-heading]")
        )
          root.removalHeadingFocus!++;
      });
    });
    const locker = await context.newPage();
    await locker.goto("/about");
    await withHeldLock(locker, async () => {
      const remove = bag(page).getByRole("button", { name: /Remove Pixel 8 .* from bag/ });
      await remove.focus();
      await remove.click();
      await waitForPending(locker);
      expect.soft(await notice.textContent(), "pending removal is not success").toBe(beforeNotice);
      expect
        .soft(
          await heading.evaluate((node) => node === document.activeElement),
          "pending removal cannot focus",
        )
        .toBe(false);
      if (cancellation === "dismissal") {
        await page.keyboard.press("Escape");
        await expect(add(page)).toBeFocused();
      } else {
        await bag(page).getByRole("link", { name: "Keep exploring", exact: true }).click();
        await expect(page).toHaveURL(/\/shop$/);
      }
      await expect(bag(page)).toHaveCount(0);
      expect(await persistedQuantity(page)).toBe(1);
    });
    await expect.poll(() => persistedQuantity(page)).toBeUndefined();
    await expect(bag(page)).toHaveCount(0);
    if (cancellation === "dismissal") await expect(add(page)).toBeFocused();
    expect
      .soft(
        await page.evaluate(
          () => (window as typeof window & { removalHeadingFocus?: number }).removalHeadingFocus,
        ),
      )
      .toBe(0);
    await page.reload();
    await page.getByRole("button", { name: "Open bag", exact: true }).click();
    await expect(bag(page).getByText("Your bag is empty.", { exact: false })).toBeVisible();
    await locker.close();
  });
}

for (const canonical of ["remove", "save"] as const) {
  test(`wishlist removal focus follows canonical ${canonical} commit, not the clicked saved render`, async ({
    page,
    context,
  }) => {
    await page.goto("/shop");
    const save = page.getByRole("button", { name: "Save Pixel 8", exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(
      page.getByRole("button", { name: "Remove Pixel 8 from wishlist", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goto("/wishlist");
    const heading = page.getByRole("heading", { name: "Your wishlist.", exact: true });
    const remove = page.getByRole("button", { name: "Remove Pixel 8 from wishlist", exact: true });
    await expect(remove).toBeEnabled();
    const locker = await context.newPage();
    await locker.goto("/about");
    await withHeldLock(locker, async () => {
      await remove.focus();
      await remove.click();
      await waitForPending(locker);
      expect
        .soft(
          await heading.evaluate((node) => node === document.activeElement),
          "wishlist focus waits for canonical removal",
        )
        .toBe(false);
      await expect(remove).toHaveAttribute("aria-pressed", "true");
      if (canonical === "save") {
        // A cooperating tab removed it first. This pending toggle now ADDS it.
        await locker.evaluate((key) => {
          const state = JSON.parse(localStorage.getItem(key)!);
          state.wishlist = [];
          localStorage.setItem(key, JSON.stringify(state));
        }, key);
      }
    });
    const notice = page.locator('div[role="status"][aria-atomic="true"]');
    await expect(notice).toHaveText(
      canonical === "remove"
        ? "Pixel 8 removed from your wishlist."
        : "Pixel 8 saved to your wishlist.",
    );
    if (canonical === "remove") {
      await expect(remove).toHaveCount(0);
      await expect(heading).toBeFocused();
    } else {
      await expect(remove).toHaveAttribute("aria-pressed", "true");
      await expect(heading).not.toBeFocused();
    }
    await locker.close();
  });
}

test("duplicate pending bag removals keep the latest absent-row focus repair", async ({
  page,
  context,
}) => {
  await page.goto("/products/google-pixel-8");
  await expect(add(page)).toBeEnabled();
  await add(page).focus();
  await add(page).click();
  await expect(bag(page).getByRole("spinbutton")).toHaveValue("1");
  const heading = bag(page).getByRole("heading", { name: "Your bag", exact: true });
  const notice = page.locator('div[role="status"][aria-atomic="true"]');
  const beforeNotice = await notice.textContent();
  const locker = await context.newPage();
  await locker.goto("/about");
  await withHeldLock(locker, async () => {
    const remove = bag(page).getByRole("button", { name: /Remove Pixel 8 .* from bag/ });
    await remove.focus();
    await remove.click();
    await remove.focus();
    await remove.click();
    await waitForPending(locker);
    expect.soft(await notice.textContent(), "duplicates are still pending").toBe(beforeNotice);
    expect
      .soft(
        await heading.evaluate((node) => node === document.activeElement),
        "neither pending remove can focus",
      )
      .toBe(false);
    expect(await persistedQuantity(page)).toBe(1);
  });
  await expect.poll(() => persistedQuantity(page)).toBeUndefined();
  await expect(bag(page).getByRole("spinbutton")).toHaveCount(0);
  await expect(notice).toHaveText("Pixel 8 removed from your bag.");
  await expect(heading).toBeFocused();
  await locker.close();
});

for (const surface of ["bag", "wishlist"] as const) {
  test(`${surface} removal preserves focus moved to another control while pending`, async ({
    page,
    context,
  }) => {
    await page.goto("/products/google-pixel-8");
    await expect(add(page)).toBeEnabled();
    if (surface === "bag") {
      await add(page).click();
      await expect(bag(page).getByRole("spinbutton")).toHaveValue("1");
    } else {
      await page.getByRole("button", { name: "Save Pixel 8", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Remove Pixel 8 from wishlist", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.goto("/wishlist");
    }
    const remove =
      surface === "bag"
        ? bag(page).getByRole("button", { name: /Remove Pixel 8 .* from bag/ })
        : page.getByRole("button", { name: "Remove Pixel 8 from wishlist", exact: true });
    const destination =
      surface === "bag"
        ? bag(page).getByRole("button", { name: "Close your bag", exact: true })
        : page.locator(".site-header").getByRole("link", { name: "Wishlist", exact: true });
    const locker = await context.newPage();
    await locker.goto("/about");
    await withHeldLock(locker, async () => {
      await remove.focus();
      await remove.click();
      await waitForPending(locker);
      await page.keyboard.press("Tab");
      await destination.focus();
      await expect(destination).toBeFocused();
    });
    await expect(remove).toHaveCount(0);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(destination).toBeFocused();
    await locker.close();
  });
}
