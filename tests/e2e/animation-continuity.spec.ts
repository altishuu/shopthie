import { test, expect, type Page } from "@playwright/test";

type Frame = {
  time: number;
  path: string;
  intro: string;
  route: string;
  mask: number;
  galleryMask: number;
  titleY: number;
  hasHero: boolean;
};
declare global {
  interface Window {
    __entranceFrames: Frame[];
  }
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    window.__entranceFrames = [];
    const sample = () => {
      const main = [...document.querySelectorAll("main")].find(
        (element) => element.getClientRects().length,
      );
      const hero = main?.querySelector(".hero-visual");
      const heading = main?.querySelector("h1");
      const gallery = main?.querySelector(".gallery-stage img");
      if (main && heading) {
        const clip = hero ? getComputedStyle(hero).clipPath : "none";
        const values = clip.match(/[-\d.]+/g)?.map(Number) || [0];
        const mask = values.length > 3 ? values[3] : values.length > 1 ? values[1] : values[0];
        const galleryValues = (gallery ? getComputedStyle(gallery).clipPath : "none")
          .match(/[-\d.]+/g)
          ?.map(Number) || [0];
        window.__entranceFrames.push({
          time: performance.now(),
          path: location.pathname,
          intro: document.documentElement.dataset.introState || "boot",
          route: document.documentElement.dataset.routeState || "boot",
          hasHero: !!hero,
          mask,
          galleryMask: galleryValues.length > 2 ? galleryValues[2] : galleryValues[0],
          titleY: new DOMMatrixReadOnly(getComputedStyle(heading).transform).m42,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function complete(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
  await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
  await page.waitForTimeout(1300);
}

function heroContinuity(frames: Frame[]) {
  const completeAt = frames.find((frame) => frame.intro === "complete")!.time;
  const moving = frames.filter((frame) => frame.hasHero && frame.mask > 0.1 && frame.mask < 99.9);
  expect(moving.length).toBeGreaterThan(1);
  expect(
    moving[0].time,
    "the entrance should not be spent behind the intro",
  ).toBeGreaterThanOrEqual(completeAt - 45);
  expect(
    moving.at(-1)!.time,
    "the reveal must continue well beyond the departing overlay's cleanup",
  ).toBeGreaterThan(completeAt + 600);
  // Sampling can miss frames; detect an actual premature terminal jump instead
  // of treating the first observed eased value as the animation's start time.
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    if (current.time - previous.time < 100 && current.mask === 0)
      expect(
        previous.mask,
        "the mask must approach its endpoint rather than be reset",
      ).toBeLessThan(1);
  }
  expect(frames.at(-1)!.mask).toBeLessThan(0.01);
  return { completeAt, firstMotionAt: moving[0].time, lastMotionAt: moving.at(-1)!.time };
}

test("first visit and reload hero entrances run fully after the loader", async ({ page }, info) => {
  await instrument(page);
  await page.goto("/");
  await complete(page);
  const first = heroContinuity(await page.evaluate(() => window.__entranceFrames));
  await page.reload();
  await complete(page);
  const repeat = heroContinuity(await page.evaluate(() => window.__entranceFrames));
  await info.attach("hero-continuity", {
    body: JSON.stringify({ first, repeat }),
    contentType: "application/json",
  });
});

test("global heading entrances wait for both loader and route bridge completion", async ({
  page,
}, info) => {
  await instrument(page);
  await page.goto("/shop");
  await complete(page);
  let frames = await page.evaluate(() => window.__entranceFrames);
  const introAt = frames.find((frame) => frame.intro === "complete")!.time;
  let moving = frames.filter((frame) => frame.titleY > 0.2 && frame.titleY < 11.8);
  expect(moving.length).toBeGreaterThan(1);
  expect(moving[0].time).toBeGreaterThanOrEqual(introAt - 45);
  expect(moving.at(-1)!.time).toBeGreaterThan(introAt + 100);
  await page
    .getByRole("navigation", { name: "Footer navigation" })
    .getByRole("link", { name: "Our perspective" })
    .click();
  await expect(page).toHaveURL(/\/about$/);
  await complete(page);
  frames = (await page.evaluate(() => window.__entranceFrames)).filter(
    (frame) => frame.path === "/about",
  );
  const idleAt = frames.find((frame) => frame.route === "idle")!.time;
  moving = frames.filter((frame) => frame.titleY > 0.2 && frame.titleY < 11.8);
  expect(moving.length).toBeGreaterThan(1);
  expect(
    moving[0].time,
    "incoming heading must not finish beneath the route veil",
  ).toBeGreaterThanOrEqual(idleAt - 45);
  expect(moving.at(-1)!.time).toBeGreaterThan(idleAt + 100);
  await info.attach("route-heading-continuity", {
    body: JSON.stringify({ idleAt, moving }),
    contentType: "application/json",
  });
});

test("finishing the intro does not discard the page's later scroll reveals", async ({ page }) => {
  await page.goto("/");
  await complete(page);
  const image = page.locator(".collection-image").first();
  const before = await image.evaluate((element) => getComputedStyle(element).clipPath);
  expect(before, "offscreen collection reveal must still be owned by the page").not.toBe("none");
  expect(before).toContain("8%");
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const clip = getComputedStyle(element).clipPath;
        return (
          clip !== "none" &&
          (clip.match(/[-\d.]+/g) || []).every((value) => Math.abs(Number(value)) < 0.01)
        );
      }),
    )
    .toBe(true);
});

test("decoded product gallery entrances wait for the same global surface handoff", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/products/google-pixel-8");
  await complete(page);
  const frames = await page.evaluate(() => window.__entranceFrames);
  const at = frames.find((frame) => frame.intro === "complete")!.time;
  const moving = frames.filter((frame) => frame.galleryMask > 0.05 && frame.galleryMask < 4.95);
  expect(moving.length).toBeGreaterThan(1);
  expect(
    moving[0].time,
    "gallery motion must not be consumed under the loader",
  ).toBeGreaterThanOrEqual(at - 45);
  expect(moving.at(-1)!.time).toBeGreaterThan(at + 150);
  await page
    .getByRole("navigation", { name: "Footer navigation" })
    .getByRole("link", { name: "Shop", exact: true })
    .click();
  await expect(page).toHaveURL(/\/shop$/);
  await complete(page);
  await page
    .getByRole("main")
    .locator('[data-product-card="apple-airpods-max"] .product-image-link')
    .click();
  await expect(page).toHaveURL(/\/products\/apple-airpods-max$/);
  await complete(page);
  const destination = (await page.evaluate(() => window.__entranceFrames)).filter(
    (frame) => frame.path === "/products/apple-airpods-max",
  );
  const idle = destination.find((frame) => frame.route === "idle")!.time;
  const motion = destination.filter(
    (frame) => frame.galleryMask > 0.05 && frame.galleryMask < 4.95,
  );
  // Timing and intermediate geometry matter; do not impose a host frame rate.
  expect(motion.length).toBeGreaterThan(1);
  expect(motion[0].time).toBeGreaterThanOrEqual(idle - 45);
  expect(motion.at(-1)!.time).toBeGreaterThan(idle + 150);
  expect(destination.at(-1)!.galleryMask).toBe(0);
});

test("skipping the loader still runs an uninterrupted entrance", async ({ page }) => {
  await instrument(page);
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-motion-ready", "true");
  await page.getByRole("button", { name: /Skip intro/ }).click();
  await page.waitForFunction(() => document.documentElement.dataset.introState === "complete");
  const target = page.getByRole("link", { name: /Explore the edit/ });
  const box = await target.boundingBox();
  // Hover must not overwrite the entrance's transform or leave its mask half closed.
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await complete(page);
  heroContinuity(await page.evaluate(() => window.__entranceFrames));
  expect(
    await target.evaluate((element) =>
      (getComputedStyle(element).clipPath.match(/[-\d.]+/g) || []).every(
        (value) => Number(value) === 0,
      ),
    ),
  ).toBe(true);
});
