import { expect, test, type Page } from "@playwright/test";
import { nav, openApp } from "./helpers";

/** Leaving any task: Close / Cancel / Escape / browser Back, with a discard prompt only when something was typed. */

async function openAddExpense(page: Page) {
  await nav(page, "Dashboard");
  await page.getByText("+ Expense", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Record Transaction" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Standard", exact: true }).click();
  return dialog;
}

const discardPrompt = (page: Page) => page.getByRole("alertdialog", { name: "Discard unsaved changes?" });

test("an untouched form closes at once with Escape, the X button or Cancel", async ({ page }) => {
  await openApp(page);
  let dialog = await openAddExpense(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(discardPrompt(page)).toHaveCount(0);

  dialog = await openAddExpense(page);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  dialog = await openAddExpense(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("typed data is never lost or saved by accident: keep editing, then discard", async ({ page }) => {
  await openApp(page);
  await nav(page, "Transactions");
  const before = await page.getByText("Navigation Test Cafe").count();
  expect(before).toBe(0);

  const dialog = await openAddExpense(page);
  await dialog.getByLabel("Amount in rupees").fill("123.45");
  await dialog.getByLabel("Merchant or store").fill("Navigation Test Cafe");

  await page.keyboard.press("Escape");
  await expect(discardPrompt(page)).toBeVisible();
  await discardPrompt(page).getByRole("button", { name: "Keep editing" }).click();
  await expect(discardPrompt(page)).toBeHidden();
  await expect(dialog.getByLabel("Amount in rupees")).toHaveValue("123.45"); // nothing lost

  await dialog.getByRole("button", { name: "Close" }).click();
  await discardPrompt(page).getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toBeHidden();

  // Nothing was recorded, and the next open starts empty.
  await nav(page, "Transactions");
  await expect(page.getByText("Navigation Test Cafe")).toHaveCount(0);
  const again = await openAddExpense(page);
  await expect(again.getByLabel("Amount in rupees")).toHaveValue("");
});

test("browser Back closes a dialog, and asks first when something was typed", async ({ page }) => {
  await openApp(page);
  let dialog = await openAddExpense(page);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).first()).toBeVisible(); // still in the app

  dialog = await openAddExpense(page);
  await dialog.getByLabel("Amount in rupees").fill("50");
  await page.goBack();
  await expect(discardPrompt(page)).toBeVisible();
  await expect(dialog.getByLabel("Amount in rupees")).toHaveValue("50");
  await discardPrompt(page).getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toBeHidden();
});

test("browser Back returns to the previous screen", async ({ page }) => {
  await openApp(page);
  await nav(page, "Transactions");
  await expect(page.getByText(/Transaction Ledger/).first()).toBeVisible();
  await nav(page, "Budgets");
  await expect(page.getByText(/Budgets, Goals & Simulator/).first()).toBeVisible();
  await page.goBack();
  await expect(page.getByText(/Transaction Ledger/).first()).toBeVisible();
  await page.goForward();
  await expect(page.getByText(/Budgets, Goals & Simulator/).first()).toBeVisible();
});

test("dialogs are labelled, keep keyboard focus inside, and return focus to the opener", async ({ page }) => {
  await openApp(page);
  await nav(page, "Dashboard");
  const opener = page.getByRole("button", { name: "+ Expense", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Record Transaction" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  expect(await dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("budget and goal forms: Cancel with typed data asks before discarding; nothing is created", async ({ page }) => {
  await openApp(page);
  await nav(page, "Budgets");
  const budgetsBefore = await page.getByText("Cancel Test Budget").count();
  await page.getByText("+ Create Budget").click();
  const dialog = page.getByRole("dialog", { name: "Create New Budget" });
  await dialog.getByPlaceholder("e.g. Monthly Dining Out").fill("Cancel Test Budget");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await discardPrompt(page).getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Cancel Test Budget")).toHaveCount(budgetsBefore);

  await nav(page, "Goals");
  await page.getByText("+ Create Savings Target").click();
  const goal = page.getByRole("dialog", { name: "Create Savings Target" });
  await page.keyboard.press("Escape"); // untouched: closes immediately
  await expect(goal).toBeHidden();
});

test("every global dialog can be closed with its X button and with Escape", async ({ page }) => {
  await openApp(page);
  const openers: [string, () => Promise<void>][] = [
    ["Payment sync demo (simulated)", () => page.getByRole("button", { name: "Sync Demo" }).click()],
    ["Bagla AI Assistant", () => page.getByRole("button", { name: /AI Assistant/ }).first().click()],
  ];
  for (const [name, open] of openers) {
    await open();
    const d = page.getByRole("dialog", { name });
    await expect(d).toBeVisible();
    await d.getByRole("button", { name: "Close" }).first().click();
    await expect(d).toBeHidden();
    await open();
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
  }
});

test("closing one dialog and opening another straight away keeps the new one open (slow history)", async ({ page }) => {
  // Reproduces what happened on the CI runner: the closed dialog's own history clean-up (history.back)
  // lands after the next dialog has opened. Here the traversal is delayed on purpose.
  await page.addInitScript(() => {
    const back = history.back.bind(history);
    history.back = () => { setTimeout(back, 300); };
  });
  await openApp(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: /AI Assistant/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Bagla AI Assistant" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "+ Expense", exact: true }).click();
    const add = page.getByRole("dialog", { name: "Record Transaction" });
    await expect(add).toBeVisible();
    await page.waitForTimeout(700); // the delayed traversal arrives in this window
    await expect(add).toBeVisible();
    await add.getByRole("button", { name: "Close" }).click();
    await expect(add).toBeHidden();
  }
});
