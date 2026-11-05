import { expect, test } from "@playwright/test";
import { apiGet, apiLogin, nav, newUser, signUpViaUI } from "./helpers";

function isoDaysAgo(n: number) {
  const d = new Date(Date.now() - n * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d); // YYYY-MM-DD
}

test("recurring bills: add, monthly total, mark paid once, skip, edit, pause/resume, cancel", async ({ page, request }) => {
  const u = newUser("Bills Test");
  await signUpViaUI(page, u);
  const token = await apiLogin(request, u);

  await nav(page, "Recurring");
  await expect(page.getByText(/No recurring bills yet/)).toBeVisible();
  // Weekly ₹120 bill that started 15 days ago → 3 occurrences due (day 0, 7, 14).
  await page.getByRole("button", { name: "Add bill" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a recurring bill" });
  await dialog.getByLabel(/Name/).fill("Milk");
  await dialog.getByLabel(/Amount/).fill("120");
  await dialog.getByLabel("Repeats").selectOption("weekly");
  await dialog.getByLabel("First due date").fill(isoDaysAgo(15));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Milk", { exact: true })).toBeVisible();
  // Monthly equivalent of ₹120/week = ₹520 (exact paise maths).
  await expect(page.getByText(/^₹520\s*\/\s*month$/).or(page.getByText("₹520", { exact: true })).first()).toBeVisible();

  const overdue = page.getByLabel("Overdue payments for Milk");
  await expect(overdue.getByText(/^Due /)).toHaveCount(3);
  // Mark the first one paid, twice quickly: exactly one ledger entry.
  const pay = overdue.getByRole("button", { name: "Mark paid" }).first();
  await pay.click();
  await expect(overdue.getByText(/^Due /)).toHaveCount(2);
  const tx = (await apiGet(request, token, "/api/v1/transactions?status=posted")).items;
  expect(tx.map((t: any) => t.amount_paise)).toEqual([12000]);
  const bill = (await apiGet(request, token, "/api/v1/recurring"))[0];
  const paidDate = bill.history.find((h: any) => h.status === "paid").due_date;
  const again = await request.post(`http://127.0.0.1:8010/api/v1/recurring/${bill.id}/occurrences/${paidDate}/pay`,
    { headers: { Authorization: `Bearer ${token}` }, data: {} });
  expect(again.status()).toBe(200);
  expect((await apiGet(request, token, "/api/v1/transactions?status=posted")).items.length).toBe(1);

  // Skip the next one.
  await overdue.getByRole("button", { name: "Skip" }).first().click();
  await expect(overdue.getByText(/^Due /)).toHaveCount(1);

  // Edit the amount.
  await page.getByRole("button", { name: "Edit Milk" }).click();
  await page.getByLabel("Bill amount in rupees").fill("130.50");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("₹130.50").first()).toBeVisible();
  expect((await apiGet(request, token, "/api/v1/recurring"))[0].amount_paise).toBe(13050);

  // Pause: nothing is due while paused; resume brings it back.
  await page.getByRole("button", { name: "Pause Milk" }).click();
  await expect(page.getByLabel("Overdue payments for Milk")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume Milk" }).click();
  await expect(page.getByLabel("Overdue payments for Milk")).toBeVisible();

  // Cancel asks first, then removes it from the list; the paid entry stays in the ledger.
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Cancel Milk" }).click();
  await expect(page.getByText(/No recurring bills yet/)).toBeVisible();
  expect((await apiGet(request, token, "/api/v1/transactions?status=posted")).items.length).toBe(1);
});
