import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { nav, openApp } from "./helpers";

async function addExpense(page: Page, amount: string, merchant: string) {
  await nav(page, "Dashboard");
  await page.getByText("+ Expense", { exact: true }).click();
  const d = page.getByRole("dialog", { name: "Record Transaction" });
  await d.getByRole("button", { name: "Standard", exact: true }).click();
  await d.getByLabel("Amount in rupees").fill(amount);
  await d.getByLabel("Merchant or store").fill(merchant);
  await d.getByRole("button", { name: /Save Expense/ }).click();
  await expect(d).toBeHidden();
}

const spentPaise = async (page: Page): Promise<number> => {
  const t = (await page.getByTestId("report-spent").innerText().catch(() => "₹0")).replace(/[₹,\s]/g, "");
  return Math.round(Number(t.replace("−", "-")) * 100);
};

test("spending reports: exact totals from recorded entries, period switch, CSV export", async ({ page }) => {
  await openApp(page);
  await nav(page, "Analytics");
  const reports = page.getByTestId("spending-reports");
  await expect(reports).toBeVisible();
  await reports.getByRole("radio", { name: "Last 7 days" }).click();
  const before = (await page.getByTestId("reports-empty").isVisible()) ? 0 : await spentPaise(page);

  await addExpense(page, "100.10", "Report Test Cafe");
  await addExpense(page, "0.20", "Report Test Cafe");
  await nav(page, "Analytics");
  await reports.getByRole("radio", { name: "Last 7 days" }).click();
  expect(await spentPaise(page)).toBe(before + 10030); // 100.10 + 0.20, no float drift

  const [dl] = await Promise.all([page.waitForEvent("download"), reports.getByRole("button", { name: "Export CSV" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^bagla-spending-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await dl.path(), "utf8");
  expect(csv).toContain('"Category","Entries","Spent (INR)"');
  expect(csv).toContain(`"Total"`);
  expect(csv).toContain((((before + 10030) / 100)).toFixed(2));

  await reports.getByRole("radio", { name: "Last month" }).click();
  await expect(reports.getByRole("radio", { name: "Last month" })).toHaveAttribute("aria-checked", "true");
});
