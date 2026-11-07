import { defineConfig, devices } from "@playwright/test";

/** Records the investor walkthrough video from the LOCAL demo (start it first: investor-demo\start-demo.ps1). Not used by CI. */
export default defineConfig({
  testDir: "./e2e-video",
  outputDir: "D:/BAGLA_FINANCE_WORKSPACE/temp/video-artifacts",
  workers: 1,
  timeout: 900_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", timezoneId: "Asia/Kolkata", locale: "en-IN",
    ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 },
});
