import { expect, test, type Page } from "@playwright/test";
import { apiGet, apiLogin, nav, newUser, signUpViaUI } from "./helpers";

async function addExpense(page: Page, amount: string, merchant: string) {
  await nav(page, "Dashboard");
  await page.getByText("+ Expense", { exact: true }).click();
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await page.getByLabel("Amount in rupees").fill(amount);
  await page.getByLabel("Merchant or store").fill(merchant);
  await page.getByRole("button", { name: /Save Expense/ }).click();
}

async function serverTx(request: any, token: string, status = "posted") {
  return (await apiGet(request, token, `/api/v1/transactions?status=${status}`)).items as any[];
}

test("transaction create, edit and void reach the server in exact paise", async ({ page, request }) => {
  const u = newUser("Ravi Test");
  await signUpViaUI(page, u);
  const token = await apiLogin(request, u);

  await addExpense(page, "250.75", "Chai Point");
  await expect.poll(async () => (await serverTx(request, token)).map(t => t.amount_paise)).toEqual([25075]);

  await nav(page, "Transactions");
  await page.getByText("Chai Point").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByRole("form", { name: "Edit transaction" });
  await form.getByLabel(/Amount/).fill("300.10");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => (await serverTx(request, token)).map(t => t.amount_paise)).toEqual([30010]);

  // The detail panel stays open after saving; delete from there.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect.poll(async () => (await serverTx(request, token)).length).toBe(0);
  expect((await serverTx(request, token, "void")).map(t => t.amount_paise)).toEqual([30010]); // kept as history

  await page.reload();
  await nav(page, "Transactions");
  await expect(page.getByText("Chai Point")).toHaveCount(0);
});

test("budgets and goals are saved to the account and survive reload", async ({ page, request }) => {
  const u = newUser("Meera Test");
  await signUpViaUI(page, u);
  const token = await apiLogin(request, u);

  await nav(page, "Budgets");
  await page.getByText("+ Create Budget").click();
  await page.getByPlaceholder("e.g. Monthly Dining Out").fill("Dining out");
  await page.getByPlaceholder("8000").fill("8000.50");
  await page.getByRole("button", { name: "Save Budget" }).click();
  await expect.poll(async () => (await apiGet(request, token, "/api/v1/budgets")).map((b: any) => [b.name, b.amount_paise]))
    .toEqual([["Dining out", 800050]]);

  await nav(page, "Goals");
  await page.getByText("+ Create Savings Target").click();
  await page.getByPlaceholder("e.g. Goa Vacation Fund").fill("Goa trip");
  await page.getByPlaceholder("50000").fill("50000");
  await page.getByRole("button", { name: "Save Goal" }).click();
  await expect.poll(async () => (await apiGet(request, token, "/api/v1/goals")).map((g: any) => [g.name, g.target_paise]))
    .toEqual([["Goa trip", 5000000]]);

  await page.reload();
  await nav(page, "Budgets");
  await expect(page.getByText("Dining out").first()).toBeVisible();
});

test("statement import previews rows, adds them once, and flags a re-upload as duplicates", async ({ page, request }) => {
  const u = newUser("Import Test");
  await signUpViaUI(page, u);
  const token = await apiLogin(request, u);
  const csv = [
    "Date,Narration,Debit,Credit",
    "01/11/2026,UPI-SWIGGY ORDER,450.50,",
    "02/11/2026,SALARY NOV,,85000.00",
    "03/11/2026,ELECTRICITY BILL,1234.56,",
  ].join("\n");
  const file = { name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };

  await nav(page, "Account features");
  await page.getByLabel("Statement file").setInputFiles(file);
  await expect(page.getByText(/3 rows · 0 with problems · 0 already in your ledger/)).toBeVisible();
  await page.getByRole("button", { name: "Add 3 entries" }).click();
  await expect(page.getByRole("status").filter({ hasText: /added|imported/i })).toBeVisible();
  const items = await serverTx(request, token);
  expect(items.map(t => t.amount_paise).sort((a, b) => a - b)).toEqual([45050, 123456, 8500000]);

  // Same statement again: nothing new can be added.
  await page.getByLabel("Statement file").setInputFiles(file);
  await expect(page.getByText(/3 rows · 0 with problems · 3 already in your ledger/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add 0 entries" })).toBeDisabled();
  expect((await serverTx(request, token)).length).toBe(3);
});
