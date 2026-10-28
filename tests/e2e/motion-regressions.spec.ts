import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __introTiming: { started: number; readable: number; exit: number; complete: number };
    __catalogProbe: {
      done: boolean;
      frames: { category: string; id: string; moving: boolean }[];
    };
  }
}

async function idle(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
  await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
}

async function recordCards(page: Page) {
  await page.evaluate(() => {
    const probe: Window["__catalogProbe"] = { done: false, frames: [] };
    window.__catalogProbe = probe;
    const start = performance.now();
    const frame = () => {
      if (window.__catalogProbe !== probe) return;
      const category = new URLSearchParams(location.search).get("category") || "all";
      document.querySelectorAll<HTMLElement>("[data-product-card]").forEach((card) => {
        if (!card.getClientRects().length) return;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
        probe.frames.push({
          category,
          id: card.dataset.productCard!,
          moving:
            Math.abs(matrix.m42) > 0.5 ||
            Math.abs(matrix.m41) > 0.5 ||
            Math.abs(matrix.m11 - 1) > 0.002,
        });
      });
      if (performance.now() - start < 1200) requestAnimationFrame(frame);
      else probe.done = true;
    };
    requestAnimationFrame(frame);
  });
}

test("both first and repeat intros hold fully revealed text long enough to read", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const timing = { started: 0, readable: 0, exit: 0, complete: 0 };
    window.__introTiming = timing;
    const sample = () => {
      const intro = document.getElementById("intro-screen");
      const state = document.documentElement.dataset.introState;
      const now = performance.now();
      if (intro && !intro.hidden && state === "loading") {
        timing.started ||= now;
        const letters = [...intro.querySelectorAll(".intro-letter")];
        const revealed =
          letters.length > 0 &&
          letters.every((letter) => {
            const matrix = new DOMMatrixReadOnly(getComputedStyle(letter).transform);
            return Math.abs(matrix.m42) < 0.4 && Math.abs(matrix.m12) < 0.002;
          });
        const inset = getComputedStyle(intro)
          .clipPath.match(/[-\d.]+/g)
          ?.map(Number) || [0];
        const bottom = inset.length > 2 ? inset[2] : inset[0];
        if (revealed && bottom < 0.5) timing.readable ||= now;
        if (bottom >= 0.5) timing.exit ||= now;
      }
      if (state === "complete" && timing.started) timing.complete = now;
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto("/");
  await idle(page);
  await expect.poll(() => page.evaluate(() => window.__introTiming.complete)).toBeGreaterThan(0);
  let timing = await page.evaluate(() => window.__introTiming);
  const first = { ...timing };
  expect(timing.readable).toBeGreaterThan(0);
  expect(timing.exit - timing.readable).toBeGreaterThanOrEqual(1200);
  expect(timing.complete - timing.started).toBeLessThan(4500);
  await page.reload();
  await idle(page);
  await expect.poll(() => page.evaluate(() => window.__introTiming.complete)).toBeGreaterThan(0);
  timing = await page.evaluate(() => window.__introTiming);
  expect(timing.readable).toBeGreaterThan(0);
  expect(timing.exit - timing.readable).toBeGreaterThanOrEqual(900);
  expect(timing.complete - timing.started).toBeLessThan(4500);
  await info.attach("intro-readability", {
    body: JSON.stringify(
      {
        first: { readableMs: first.exit - first.readable, totalMs: first.complete - first.started },
        repeat: {
          readableMs: timing.exit - timing.readable,
          totalMs: timing.complete - timing.started,
        },
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test("category-to-category changes animate incoming cards even with no shared products", async ({
  page,
}) => {
  await page.goto("/shop");
  await idle(page);
  await page.getByRole("button", { name: "Headphones", exact: true }).click();
  await expect(page.locator("[data-product-card]:visible")).toHaveCount(2);
  for (const selection of [
    { label: "Earbuds", category: "earbuds", id: "apple-airpods-pro-2nd-gen", count: 1 },
    { label: "Speakers", category: "speakers", id: "sonos-play-1", count: 2 },
    { label: "Smartphones", category: "smartphones", id: "google-pixel-8", count: 2 },
  ]) {
    await recordCards(page);
    await page.getByRole("button", { name: selection.label, exact: true }).click();
    await expect(page.locator("[data-product-card]:visible")).toHaveCount(selection.count);
    await expect.poll(() => page.evaluate(() => window.__catalogProbe.done)).toBe(true);
    const moving = await page.evaluate(
      ({ category, id }) =>
        window.__catalogProbe.frames.some(
          (frame) => frame.category === category && frame.id === id && frame.moving,
        ),
      selection,
    );
    expect(moving, `${selection.category} incoming card should visibly transition`).toBe(true);
    await expect(page.locator(`[data-product-card="${selection.id}"]`)).toHaveCSS(
      "transform",
      "none",
    );
  }
});

test("filter animation handles empty results, rapid changes, and live reduced motion", async ({
  page,
}) => {
  await page.goto("/shop?category=headphones&brand=Bose");
  await idle(page);
  await page.getByRole("button", { name: "Earbuds", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nothing here. Yet." })).toBeVisible();
  await recordCards(page);
  await page.getByRole("button", { name: "Headphones", exact: true }).click();
  await expect(page.locator("[data-product-card]:visible")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__catalogProbe.done)).toBe(true);
  expect(
    await page.evaluate(() =>
      window.__catalogProbe.frames.some(
        (frame) =>
          frame.category === "headphones" && frame.id === "bose-quietcomfort-25" && frame.moving,
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("[data-product-card]:visible")).toHaveCount(7);
  await page.locator(".category-chips").evaluate((chips) => {
    const buttons = [...chips.querySelectorAll("button")];
    buttons.find((button) => button.textContent === "Earbuds")!.click();
    buttons.find((button) => button.textContent === "Speakers")!.click();
  });
  await expect(page.getByRole("button", { name: "Speakers", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-product-card]:visible")).toHaveCount(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-product-card]").first()).toHaveCSS("transform", "none");
  await recordCards(page);
  await page.getByRole("button", { name: "Smartphones", exact: true }).click();
  await expect(page.locator("[data-product-card]:visible")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__catalogProbe.done)).toBe(true);
  expect(
    await page.evaluate(() =>
      window.__catalogProbe.frames
        .filter((frame) => frame.category === "smartphones")
        .some((frame) => frame.moving),
    ),
  ).toBe(false);
});
