import { defineConfig, devices } from "@playwright/test";

/**
 * Browser suite against the real app and the real FastAPI backend.
 * `npm run e2e` starts both on ports 3010/8010 with a fresh SQLite database
 * (see e2e/start-backend.mjs). Results and traces go outside the repo.
 */
const API = `http://127.0.0.1:${process.env.E2E_API_PORT || "8010"}`;
const APP = `http://127.0.0.1:${process.env.E2E_APP_PORT || "3010"}`;
const OUT = process.env.E2E_OUTPUT || "../test-results/playwright";

export default defineConfig({
  testDir: "./e2e",
  outputDir: `${OUT}/artifacts`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // On CI the "github" reporter turns failures into job annotations (readable without opening the logs).
  reporter: process.env.CI
    ? [["list"], ["github"], ["json", { outputFile: `${OUT}/results.json` }]]
    : [["list"], ["json", { outputFile: `${OUT}/results.json` }]],
  use: {
    baseURL: APP,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
    // Cross-browser: the same journeys in Firefox and WebKit (Safari's engine) and an iPhone
    // profile. `npm run e2e` runs desktop+mobile (Chromium); `npm run e2e:browsers` runs these.
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 860 } }, testIgnore: /mobile\.spec/ },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 860 } }, testIgnore: /mobile\.spec/ },
    { name: "iphone", use: { ...devices["iPhone 13"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    { command: "node e2e/start-backend.mjs", url: `${API}/health`, reuseExistingServer: false, timeout: 120_000,
      stdout: "ignore", stderr: "pipe" },
    // A production build served by `vite preview`: what users get, and no dev-server dependency
    // optimisation reloading the page mid-test on a cold CI cache (that made the first test flaky).
    { command: `node node_modules/vite/bin/vite.js build --outDir dist-e2e --emptyOutDir --logLevel warn && node node_modules/vite/bin/vite.js preview --outDir dist-e2e --host 127.0.0.1 --port ${new URL(APP).port} --strictPort`,
      url: APP, reuseExistingServer: false, timeout: 180_000, env: { VITE_API_URL: API } },
  ],
});
