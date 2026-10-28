import { defineConfig } from "@playwright/test";

// Focused real-lock regressions on each desktop engine. Start the already-built
// local production preview first; keep the main suite's HTML report intact.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "commerce-pending.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 45_000,
  outputDir: "./test-results/commerce-engines",
  reporter: [["list"], ["json", { outputFile: "docs/phase-5-commerce-browser-results.json" }]],
  use: {
    baseURL: process.env.SHOPTHIE_URL || "http://127.0.0.1:3100",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: (["chromium", "firefox", "webkit"] as const).map((browserName) => ({
    name: browserName,
    use: {
      browserName,
      launchOptions:
        browserName === "webkit" && process.env.SHOPTHIE_WEBKIT_EXECUTABLE
          ? { executablePath: process.env.SHOPTHIE_WEBKIT_EXECUTABLE }
          : {},
    },
  })),
});
