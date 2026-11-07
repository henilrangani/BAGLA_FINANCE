import { defineConfig, devices } from "@playwright/test";

/** Walks through the local investor demo (start it first: investor-demo\start-demo.ps1). Not used by CI. */
export default defineConfig({
  testDir: "./e2e-demo",
  outputDir: "D:/BAGLA_FINANCE_WORKSPACE/performance-tests/demo-walkthrough-artifacts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", timezoneId: "Asia/Kolkata", locale: "en-IN",
    ...devices["Desktop Chrome"], viewport: { width: 1366, height: 820 } },
});
