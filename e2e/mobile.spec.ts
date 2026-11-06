import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

/** The visible copy of a nav label (the desktop sidebar is hidden at phone width). */
const tap = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("visible=true").first().click();

test("mobile navigation: bottom bar and More drawer reach every main screen", async ({ page }) => {
  await openApp(page);
  await expect(page.getByText("More", { exact: true }).locator("visible=true").first()).toBeVisible();
  await tap(page, "Groups");
  await expect(page.getByRole("heading", { name: /No Groups Found|Universal Split Hub/ }).first()).toBeVisible();
  await tap(page, "Transactions");
  await expect(page.getByPlaceholder(/Search by merchant/)).toBeVisible();
  await tap(page, "More");
  await tap(page, "Budgets & Goals");
  await expect(page.getByRole("heading", { name: "Budgets, Goals & Simulator" })).toBeVisible();
  await tap(page, "Home");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).first()).toBeVisible();
  // No horizontal page scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("no horizontal scroll on a small Android phone (360 px)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await openApp(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await ctx.close();
});
