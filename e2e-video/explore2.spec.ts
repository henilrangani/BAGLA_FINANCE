/** Second discovery pass: opens dialogs and secondary tabs (no saving). Local synthetic demo only. */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const OUT = "D:/BAGLA_FINANCE_WORKSPACE/investor-demo/video/explore";
const PASSWORD = readFileSync("D:/BAGLA_FINANCE_WORKSPACE/investor-demo/.demo.env", "utf8")
  .split(/\r?\n/).find(l => l.startsWith("DEMO_PASSWORD="))!.slice("DEMO_PASSWORD=".length).trim();
const nav = (page: Page, label: string) => page.locator("aside, nav").getByText(label, { exact: true }).first().click();
const shot = async (page: Page, name: string, full = false) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const esc = async (page: Page) => { await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  const d = page.getByRole("alertdialog").getByRole("button", { name: "Discard" }); if (await d.isVisible().catch(() => false)) await d.click(); };

test("explore dialogs", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await nav(page, "Account & Sync");
  const already = page.getByRole("button", { name: /already have an account/i });
  if (await already.isVisible().catch(() => false)) await already.click();
  await page.getByLabel("Email").fill("priya.demo@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle");

  await nav(page, "Dashboard");
  await page.getByText("Cash Wallet", { exact: true }).first().click({ timeout: 8000 }).catch(() => {}); await shot(page, "d04-cashwallet", true);
  await nav(page, "Budgets");
  await page.getByRole("button", { name: "+ Create Budget" }).click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d05-create-budget");
  await esc(page);
  await page.getByRole("button", { name: "Simulator" }).click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d06-simulator", true);
  await nav(page, "Goals");
  await page.getByRole("button", { name: "+ Create Savings Target" }).click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d07-create-goal");
  await esc(page);
  await nav(page, "Analytics"); await shot(page, "d08-analytics-full", true);
  await nav(page, "Groups");
  await page.getByRole("button", { name: "Settle" }).first().click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d09-settle");
  await esc(page);
  await page.getByText("+ Add Expense").last().click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d10-group-expense", true);
  await esc(page);
  await page.getByRole("button", { name: /All Expenses/ }).click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d11-group-expenses", true);
  await page.getByRole("button", { name: /Members & Balances/ }).click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d12-members", true);
  await nav(page, "Recurring"); await shot(page, "d13-recurring", true);
  await page.getByRole("button", { name: "Add bill" }).click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d14-add-bill");
  await esc(page);
  await page.getByRole("button", { name: /AI Assistant/ }).first().click({ timeout: 8000 }).catch(e => console.log("MISS", String(e).slice(0, 120))); await shot(page, "d15-ai");
  await esc(page);
  await nav(page, "Settings"); await shot(page, "d16-settings", true);
  await nav(page, "Account & Sync"); await shot(page, "d17-account", true);
  await nav(page, "Account features"); await shot(page, "d18-features", true);
  await page.setViewportSize({ width: 1440, height: 810 });
  await nav(page, "Dashboard"); await shot(page, "d19-dashboard-1440");
});
