import { expect, test } from "@playwright/test";
import { nav, openApp } from "./helpers";

/** Regression: the Cash Wallet screen read fields that do not exist and rendered a blank, crashing page. */
test("Cash Wallet opens, shows the cash balance and records a quick cash expense", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await openApp(page);
  await nav(page, "Dashboard");
  await page.getByText("Cash Wallet", { exact: true }).first().click();
  await expect(page.getByText("Current Physical Cash in Pocket")).toBeVisible();
  await expect(page.getByText(/Last reconciled on \d{4}-\d{2}-\d{2}/)).toBeVisible();

  await page.getByLabel("What the cash was spent on").fill("Chai (test)");
  await page.getByLabel("Cash amount in rupees").fill("20");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Chai (test)").first()).toBeVisible();
  expect(errors).toEqual([]);
});
