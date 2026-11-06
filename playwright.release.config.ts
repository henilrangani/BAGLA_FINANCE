import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke-tests the packaged release stack (compose.release.yaml) that is already running.
 * Nothing is started or stopped here. Production settings apply, including the 20-per-15-minutes
 * sign-in limit per IP, so run a few specs per batch:
 *   $env:E2E_API_PORT="8080"; npx playwright test -c playwright.release.config.ts e2e/money.spec.ts
 */
const APP = process.env.RELEASE_URL || "http://127.0.0.1:8080";
const OUT = process.env.E2E_OUTPUT || "../test-results/playwright-release";

export default defineConfig({
  testDir: "./e2e",
  outputDir: `${OUT}/artifacts`,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: `${OUT}/results.json` }]],
  use: { baseURL: APP, trace: "retain-on-failure", screenshot: "only-on-failure", timezoneId: "Asia/Kolkata", locale: "en-IN" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } }, testIgnore: /mobile\.spec/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 860 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
});
