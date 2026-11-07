/**
 * Investor-demo walkthrough against the LOCAL demo (http://127.0.0.1:3100, synthetic data only).
 * Not part of CI (separate config: playwright.demo.config.ts). Saves screenshots for the investor deck.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = "D:/BAGLA_FINANCE_WORKSPACE/investor-demo/screenshots";
const PASSWORD = readFileSync("D:/BAGLA_FINANCE_WORKSPACE/investor-demo/.demo.env", "utf8")
  .split(/\r?\n/).find(l => l.startsWith("DEMO_PASSWORD="))!.slice("DEMO_PASSWORD=".length).trim();

async function nav(page: Page, label: string) {
  await page.locator("aside, nav").getByText(label, { exact: true }).first().click();
}

async function signIn(page: Page, email: string) {
  await page.goto("/");
  const start = page.getByRole("button", { name: /get started|start|enter/i }).first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await nav(page, "Account & Sync");
  const already = page.getByRole("button", { name: /already have an account/i });
  if (await already.isVisible().catch(() => false)) await already.click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).first()).toBeVisible();
  await page.waitForLoadState("networkidle"); // sign-in reloads the app and then pulls the account's data
}

test("Journey A: individual: dashboard, add expense and income, budgets, analytics, goals", async ({ page }) => {
  await signIn(page, "priya.demo@example.com");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/01-dashboard.png`, fullPage: false });

  await nav(page, "Dashboard");
  await page.getByText("+ Expense", { exact: true }).click();
  const d = page.getByRole("dialog", { name: "Record Transaction" });
  await d.getByRole("button", { name: "Standard", exact: true }).click();
  await d.getByLabel("Amount in rupees").fill("185.50");
  await d.getByLabel("Merchant or store").fill("Chai Point (demo)");
  await d.getByRole("button", { name: /Save Expense/ }).click();
  await expect(d).toBeHidden();
  await nav(page, "Transactions");
  await expect(page.getByText("Chai Point (demo)").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-transactions.png` });

  await nav(page, "Budgets");
  await expect(page.getByText("Groceries").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-budgets.png` });
  await nav(page, "Goals");
  await expect(page.getByText(/Emergency fund/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-goals.png` });

  await nav(page, "Analytics");
  const reports = page.getByTestId("spending-reports");
  await reports.getByRole("radio", { name: "Last month" }).click();
  await expect(page.getByTestId("report-spent")).toBeVisible();
  await reports.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/05-analytics.png` });
});

test("Journey B: flatmates: group balances, flexible split preview, part-payment history", async ({ page }) => {
  await signIn(page, "priya.demo@example.com");
  await nav(page, "Groups");
  await expect(page.getByText("Flat 302 (demo)").first()).toBeVisible();
  await expect(page.getByTestId("group-type")).toHaveText("Flatmates");
  await page.screenshot({ path: `${SHOTS}/06-group-overview.png` });
  await page.getByText("+ Add Expense").last().click();
  const g = page.getByRole("dialog", { name: "Add Group Expense" });
  await g.getByRole("button", { name: "Groceries" }).click();
  await g.getByLabel("Total amount (₹)").fill("1500");
  await g.getByRole("radio", { name: "Percentages" }).click();
  await g.getByRole("button", { name: "Fill evenly" }).click();
  await expect(g.getByText(/Adds up exactly to ₹1,500.00/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-flexible-split.png` });
  await g.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("alertdialog", { name: "Discard unsaved changes?" }).getByRole("button", { name: "Discard" }).click();
  await page.getByRole("button", { name: /Members & Balances/ }).click();
  await expect(page.getByTestId("member-card-Ankit (demo)")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-group-members.png` });
});

test("Journey C: family: shared budget and goal; personal entries stay private", async ({ page }) => {
  await signIn(page, "raj.demo@example.com");
  await nav(page, "Family");
  await expect(page.getByText("Sharma Family (demo)").first()).toBeVisible();
  await expect(page.getByText(/New refrigerator/).first()).toBeVisible();
  await expect(page.getByText(/Household groceries/).first()).toBeVisible();
  // Priya's private entries (rent, salary, food delivery) are not visible to Raj; only what she shared.
  await expect(page.getByText("House rent")).toHaveCount(0);
  await expect(page.getByText(/Acme Technologies/)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/09-family.png` });
});

test("Journey D: AI assistant answers from records (honest mode label)", async ({ page }) => {
  await signIn(page, "priya.demo@example.com");
  await page.getByRole("button", { name: /AI Assistant/ }).first().click();
  const chat = page.getByRole("dialog", { name: "Bagla AI Assistant" });
  await expect(chat.getByTestId("ai-mode")).not.toHaveText("…");
  for (const q of ["Where did I spend the most last month?", "Am I over any budget?", "How can I spend less?"]) {
    await chat.getByLabel("Ask a question").fill(q);
    await chat.getByRole("button", { name: "Send" }).click();
    await expect(chat.locator('[data-testid^="ai-answer-"]').last()).toContainText(/₹|budget|spend/i);
  }
  await page.screenshot({ path: `${SHOTS}/10-ai-assistant.png` });
});
