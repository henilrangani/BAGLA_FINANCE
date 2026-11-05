import { configDefaults, defineConfig } from "vitest/config";

// Unit tests only; the browser suite in e2e/ runs with Playwright (`npm run e2e`).
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
