import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";

const base = process.env.SHOPTHIE_URL || "http://127.0.0.1:3100";
const output = "docs/phase-5-performance-results.json";
const report = {
  base,
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, platform: os.platform(), cpus: os.availableParallelism() },
  methodology:
    "Local production Chromium lab; fresh contexts for startup. Not field Web Vitals or real-device certification. Intentional readable intro retained. Heap sampled at the same home route after two fixed-route warmup cycles and forced GC.",
  startup: [],
  scroll: null,
  retention: [],
  warnings: [],
};
await mkdir("docs", { recursive: true });
const save = () => writeFile(output, JSON.stringify(report, null, 2) + "\n");
const browser = await chromium.launch();
report.environment.browser = browser.version();
const quantile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
};
async function ready(page, wait = 1300) {
  await expect(page.locator("html")).toHaveAttribute("data-intro-state", "complete", {
    timeout: 30000,
  });
  await expect(page.locator("html")).toHaveAttribute("data-route-state", "idle");
  await expect(page.getByRole("main")).toHaveAttribute("data-motion-ready", "true");
  await page.waitForTimeout(wait);
}
async function monitor(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__lab = { lcp: [], shifts: [], longTasks: [], surfaceAt: null };
    for (const type of ["largest-contentful-paint", "layout-shift", "longtask"]) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === "largest-contentful-paint")
            window.__lab.lcp.push({
              at: entry.startTime,
              size: entry.size,
              element: entry.element?.tagName || null,
            });
          if (type === "layout-shift" && !entry.hadRecentInput)
            window.__lab.shifts.push({ at: entry.startTime, value: entry.value });
          if (type === "longtask")
            window.__lab.longTasks.push({ at: entry.startTime, duration: entry.duration });
        }
      }).observe({ type, buffered: true });
    }
    window.addEventListener("shopthie:surface-ready", () => {
      window.__lab.surfaceAt ??= performance.now();
    });
  });
  return errors;
}
try {
  for (const scenario of [
    { name: "desktop-cold-1", width: 1440, height: 1000 },
    { name: "desktop-cold-2", width: 1440, height: 1000 },
    { name: "desktop-cold-3", width: 1440, height: 1000 },
    { name: "phone-cold", width: 390, height: 844, touch: true },
    { name: "phone-cpu4-network", width: 390, height: 844, touch: true, throttle: true },
    { name: "reduced-motion-cold", width: 390, height: 844, touch: true, reduce: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      isMobile: !!scenario.touch,
      hasTouch: !!scenario.touch,
      reducedMotion: scenario.reduce ? "reduce" : "no-preference",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = await monitor(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    if (scenario.throttle) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 200000,
        uploadThroughput: 75000,
      });
    }
    const response = await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    expect(response.status()).toBe(200);
    await ready(page);
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      // CLS is the maximum session window (1s gap / 5s window), not all shifts summed.
      let maxCls = 0,
        sum = 0,
        first = 0,
        previous = 0;
      for (const shift of window.__lab.shifts) {
        if (shift.at - previous > 1000 || shift.at - first > 5000) {
          first = shift.at;
          sum = 0;
        }
        sum += shift.value;
        previous = shift.at;
        maxCls = Math.max(maxCls, sum);
      }
      return {
        observedLcpMs: window.__lab.lcp.at(-1)?.at ?? null,
        lcpCandidates: window.__lab.lcp,
        cls: maxCls,
        shifts: window.__lab.shifts,
        fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
        ttfbMs: navigation.responseStart - navigation.requestStart,
        surfaceReadyMs: window.__lab.surfaceAt,
        introKind: document.documentElement.dataset.introKind,
        longTasks: window.__lab.longTasks,
        resourceTransferBytes: resources.reduce((sum, resource) => sum + resource.transferSize, 0),
        resourceEncodedBytes: resources.reduce(
          (sum, resource) => sum + resource.encodedBodySize,
          0,
        ),
        resources: resources.map((resource) => ({
          path: new URL(resource.name).pathname,
          type: resource.initiatorType,
          transferBytes: resource.transferSize,
          encodedBytes: resource.encodedBodySize,
          durationMs: resource.duration,
        })),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    report.startup.push({
      ...scenario,
      ...metrics,
      errors,
      cdpMetrics: (await cdp.send("Performance.getMetrics")).metrics,
    });
    await save();
    expect(errors).toEqual([]);
    expect(metrics.overflow).toBe(false);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = await monitor(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => {
    window.__scrollFrames = { active: true, values: [], previous: performance.now() };
    const frame = (now) => {
      if (!window.__scrollFrames.active) return;
      window.__scrollFrames.values.push(now - window.__scrollFrames.previous);
      window.__scrollFrames.previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  for (let step = 0; step < 16; step += 1) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
  }
  const scroll = await page.evaluate(() => {
    window.__scrollFrames.active = false;
    return {
      intervalsMs: window.__scrollFrames.values.filter((value) => value > 0),
      endY: scrollY,
      maxY: document.documentElement.scrollHeight - innerHeight,
    };
  });
  report.scroll = {
    ...scroll,
    medianFrameMs: quantile(scroll.intervalsMs, 0.5),
    p95FrameMs: quantile(scroll.intervalsMs, 0.95),
    p99FrameMs: quantile(scroll.intervalsMs, 0.99),
    framesOver50Ms: scroll.intervalsMs.filter((value) => value > 50).length,
    notes:
      "One sequential headless wheel-scroll sample; frame intervals describe this machine, not an FPS promise.",
  };
  await save();

  async function navigate(path) {
    const found = await page.evaluate((href) => {
      const link = [...document.querySelectorAll("a[href]")].find(
        (element) => element.getAttribute("href") === href && element.getClientRects().length,
      );
      link?.click();
      return !!link;
    }, path);
    expect(found, `a real link to ${path} exists`).toBe(true);
    await expect(page).toHaveURL(`${base}${path === "/" ? "/" : path}`);
    await ready(page, path === "/" ? 1300 : 600);
    await expect(page.locator(".pin-spacer")).toHaveCount(path === "/" ? 1 : 0);
  }
  async function cycle() {
    for (const path of ["/shop", "/products/apple-airpods-max", "/cart", "/about", "/"])
      await navigate(path);
  }
  // Warm the bounded Next.js route cache before assessing retained growth.
  await cycle();
  await cycle();
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 65536 });
  for (let cycleIndex = 0; cycleIndex <= 6; cycleIndex += 1) {
    if (cycleIndex) await cycle();
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(150);
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await cdp.send("Runtime.getHeapUsage");
    const dom = await cdp.send("Memory.getDOMCounters");
    report.retention.push({
      cycle: cycleIndex,
      route: "/",
      heap,
      dom,
      pinSpacers: await page.locator(".pin-spacer").count(),
    });
    await save();
  }
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  await writeFile("docs/phase-5-heap-sampling.json", JSON.stringify(profile) + "\n");
  const allocations = [];
  function visit(node) {
    if (node.selfSize)
      allocations.push({
        bytes: node.selfSize,
        function: node.callFrame.functionName,
        url: node.callFrame.url,
        line: node.callFrame.lineNumber,
      });
    for (const child of node.children) visit(child);
  }
  visit(profile.head);
  report.largestLiveSampledAllocators = allocations.sort((a, b) => b.bytes - a.bytes).slice(0, 20);
  const first = report.retention[0],
    last = report.retention.at(-1);
  report.retentionSummary = {
    heapDeltaBytes: last.heap.usedSize - first.heap.usedSize,
    domNodeDelta: last.dom.nodes - first.dom.nodes,
    listenerDelta: last.dom.jsEventListeners - first.dom.jsEventListeners,
    cyclesAfterWarmup: 6,
    routesPerCycle: 5,
    retainedCacheWarmupCycles: 2,
  };
  if (report.retentionSummary.heapDeltaBytes > Math.max(5000000, first.heap.usedSize * 0.2))
    report.warnings.push(
      "Post-GC heap growth exceeds the investigation threshold; inspect allocation profile/retainers before sign-off.",
    );
  if (report.retentionSummary.domNodeDelta > 500 || report.retentionSummary.listenerDelta > 50)
    report.warnings.push("Post-warmup DOM/listener growth warrants lifecycle investigation.");
  report.runtimeOrConsoleErrors = errors;
  await save();
  expect(errors).toEqual([]);
  await context.close();
  console.log(
    JSON.stringify(
      {
        startup: report.startup.map(
          ({ name, observedLcpMs, cls, surfaceReadyMs, resourceTransferBytes }) => ({
            name,
            observedLcpMs,
            cls,
            surfaceReadyMs,
            resourceTransferBytes,
          }),
        ),
        scroll: {
          medianFrameMs: report.scroll.medianFrameMs,
          p95FrameMs: report.scroll.p95FrameMs,
        },
        retention: report.retentionSummary,
        warnings: report.warnings,
      },
      null,
      2,
    ),
  );
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  await save();
  throw error;
} finally {
  await browser.close();
}
