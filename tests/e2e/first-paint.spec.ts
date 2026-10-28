import { test, expect, type Page } from "@playwright/test";

async function holdAppScripts(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await gate;
    if (!page.isClosed()) await route.continue();
  });
  return release;
}

async function bootCover(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.body, "::before");
    return {
      content: style.content,
      background: style.backgroundColor,
      position: style.position,
      visibility: style.visibility,
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
}

test("cold first paint stays covered while app scripts are delayed, then hands off without a gap", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const release = await holdAppScripts(page);
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#main")).toBeAttached();
    await expect(page.locator("html")).not.toHaveAttribute("data-intro-state", /.+/);
    await expect(page.locator("#experience")).toHaveCSS("visibility", "hidden");
    const cover = await bootCover(page);
    expect(cover.content).not.toBe("none");
    expect(cover.position).toBe("fixed");
    expect(cover.background).toBe("rgb(32, 35, 31)");
    expect(cover.visibility).toBe("visible");
    expect(cover.width).toBeGreaterThanOrEqual(cover.viewportWidth - 20);
    expect(cover.height).toBeGreaterThanOrEqual(cover.viewportHeight - 1);
    await page.waitForTimeout(1200);
    await expect(page.locator("#experience")).toHaveCSS("visibility", "hidden");
    await info.attach("cold-before-hydration", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await page.evaluate(() => {
      (window as unknown as { __handoffGaps: number }).__handoffGaps = 0;
      const frame = () => {
        const intro = document.getElementById("intro-screen");
        const state = document.documentElement.dataset.introState;
        const root = document.getElementById("experience")!;
        if (!state || state === "loading") {
          const cover = getComputedStyle(document.body, "::before");
          const covered = cover.content !== "none" && cover.visibility === "visible";
          const introVisible = intro && !intro.hidden && getComputedStyle(intro).display !== "none";
          if (getComputedStyle(root).visibility === "visible" && !covered && !introVisible)
            (window as unknown as { __handoffGaps: number }).__handoffGaps++;
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
    });
    release();
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "loading");
    await expect(page.locator("#intro-screen")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete", {
      timeout: 6000,
    });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __handoffGaps: number }).__handoffGaps),
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("a stalled app fails open and a late hydration never covers the content again", async ({
  page,
}) => {
  const release = await holdAppScripts(page);
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#experience")).toHaveCSS("visibility", "hidden");
    await expect(page.locator("#experience")).toHaveCSS("visibility", "visible", { timeout: 6500 });
    expect((await bootCover(page)).visibility).toBe("hidden");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-intro-state", /.+/);
    release();
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
    await expect(page.locator("html")).toHaveAttribute("data-intro-kind", "bypassed");
    await expect(page.locator("#intro-screen")).toBeHidden();
    await expect(page.locator("#experience")).not.toHaveAttribute("inert", "");
  } finally {
    release();
  }
});

test("reduced motion does not hide the server-rendered page before hydration", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const release = await holdAppScripts(page);
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect((await bootCover(page)).content).toBe("none");
    release();
    await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete");
  } finally {
    release();
  }
});
