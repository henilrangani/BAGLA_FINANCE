import { expect, test, type Page } from "@playwright/test";
import { acceptNextDialog, apiGet, apiLogin, nav, newUser, signInViaUI, signUpViaUI } from "./helpers";

async function groupDetail(request: any, token: string) {
  const list = await apiGet(request, token, "/api/v1/groups");
  return list.length ? apiGet(request, token, `/api/v1/groups/${list[0].id}`) : null;
}

async function addGroupExpense(page: Page, desc: string, amount: string) {
  await page.getByText("+ Add Expense").last().click();
  await page.getByPlaceholder("e.g. Seafood Dinner, Fuel, Airbnb Villa Booking").fill(desc);
  await page.getByPlaceholder("e.g. 2400").fill(amount);
  await page.getByRole("button", { name: "Save Group Expense" }).click();
}

test("group split, invitation to a second account, settlement and a safe void", async ({ page, browser, request }) => {
  const asha = newUser("Asha Test");
  const ravi = newUser("Ravi Test");
  await signUpViaUI(page, asha);
  const aTok = await apiLogin(request, asha);

  // Create a group from the empty state with two named people.
  await nav(page, "Groups");
  await page.getByText("Create Your First Group").click();
  await page.getByPlaceholder("e.g. Manali Snow Trip, Flat 402, Team Chai").fill("Goa Trip");
  await page.getByPlaceholder("e.g. Ravi, Meera").fill("Ravi, Meera");
  await page.getByRole("button", { name: "Create Universal Group" }).click();
  await expect(page.getByText("Goa Trip").first()).toBeVisible();
  await expect.poll(async () => (await groupDetail(request, aTok))?.members.length).toBe(3);
  const created = await groupDetail(request, aTok);
  expect(created.members.every((m: any) => m.upi_id === null)).toBe(true); // no invented UPI IDs

  // ₹100 split three ways, paid by Asha: shares are exact paise and her own ledger gets one entry.
  await addGroupExpense(page, "Dinner", "100");
  await expect.poll(async () => (await groupDetail(request, aTok))?.expenses.length).toBe(1);
  const d1 = await groupDetail(request, aTok);
  expect(d1.expenses[0].shares.map((s: any) => s.share_paise).sort()).toEqual([3333, 3333, 3334]);
  expect(d1.members.reduce((s: number, m: any) => s + m.net_paise, 0)).toBe(0);
  // Share-based: Asha's spending is only her ₹33.34; the ₹66.66 she fronted is a transfer, not spending.
  const spend = async () => (await apiGet(request, aTok, "/api/v1/transactions?status=posted")).items
    .filter((t: any) => t.kind === "expense").map((t: any) => t.amount_paise);
  await expect.poll(spend).toEqual([3334]);
  const groupBalance = async () => (await apiGet(request, aTok, "/api/v1/accounts"))
    .find((a: any) => a.account_type === "group")?.balance_paise;
  await expect.poll(groupBalance).toBe(6666);
  await expect(page.getByTestId("my-group-ledger")).toContainText("only your share");
  await expect(page.getByTestId("my-group-ledger")).toContainText("Others owe you ₹66.66");

  // Invite Ravi's seat; the code is shown once.
  await page.getByRole("button", { name: /Members & Balances/ }).click();
  const raviCard = page.getByTestId("member-card-Ravi");
  await expect(raviCard.getByText("Not joined yet")).toBeVisible();
  await raviCard.getByRole("button", { name: "Invite to join" }).click();
  const code = (await page.getByTestId("invite-code").innerText()).trim();
  expect(code.length).toBeGreaterThan(20);

  // Ravi (separate browser profile, separate account) joins with the code.
  const ctx = await browser.newContext();
  const rp = await ctx.newPage();
  await signUpViaUI(rp, ravi);
  await nav(rp, "Groups");
  await rp.getByText("Have a code? Join a group").click();
  await rp.getByLabel("Invite code").fill("not-a-real-code-but-long-enough");
  await rp.getByRole("button", { name: "Join group" }).click();
  await expect(rp.getByRole("alert")).toContainText(/invalid, has already been used, or has expired/);
  await rp.getByLabel("Invite code").fill(code);
  await rp.getByRole("button", { name: "Join group" }).click();
  await expect(rp.getByText("Goa Trip").first()).toBeVisible();
  // The code is single-use.
  const rTok = await apiLogin(request, ravi);
  const reuse = await request.post("http://127.0.0.1:8010/api/v1/groups/claim", {
    headers: { Authorization: `Bearer ${rTok}` }, data: { token: code } });
  expect(reuse.status()).toBe(400);

  // Ravi pays back his share from his own screen.
  const raviRow = rp.getByText("Ravi", { exact: true })
    .locator("xpath=ancestor::div[.//*[normalize-space(text())='Settle']][1]");
  await raviRow.getByText("Settle", { exact: true }).click();
  await expect(rp.getByText("Ravi pays Asha Test")).toBeVisible();
  await rp.getByText("Mark as Settled & Confirmed").click();
  await expect.poll(async () => (await groupDetail(request, aTok))?.settlements.filter((s: any) => s.status === "recorded").length).toBe(1);
  const paid = (await groupDetail(request, aTok)).settlements[0];
  const ids = Object.fromEntries(created.members.map((m: any) => [m.display_name, m.id]));
  expect([paid.from_member_id, paid.to_member_id, paid.amount_paise]).toEqual([ids["Ravi"], ids["Asha Test"], 3333]);

  // Asha voids the dinner: the dialog explains the payback; the payment stays; her ledger entry is voided.
  await page.reload();
  await nav(page, "Groups");
  await page.getByRole("button", { name: /All Expenses/ }).click();
  const dialog = acceptNextDialog(page);
  await page.getByRole("button", { name: "Delete expense Dinner" }).click();
  const message = await dialog;
  expect(message).toContain("will need to pay back");
  expect(message).toContain("Your share of it will be removed from your own transactions");
  await expect.poll(async () => (await groupDetail(request, aTok))?.expenses[0].status).toBe("void");
  const d2 = await groupDetail(request, aTok);
  expect(d2.settlements.filter((s: any) => s.status === "recorded").length).toBe(1);
  expect(d2.members.reduce((s: number, m: any) => s + m.net_paise, 0)).toBe(0);
  expect(Object.fromEntries(d2.members.map((m: any) => [m.display_name, m.net_paise]))).toMatchObject({ "Ravi": 3333 });
  // Her share is no longer spending; Ravi's ₹33.33 payback stays, so her group account shows she owes it back.
  await expect.poll(spend).toEqual([]);
  await expect.poll(groupBalance).toBe(-3333);

  // Removing a member who is owed money is refused with a clear message.
  await page.getByRole("button", { name: /Members & Balances/ }).click();
  const card2 = page.getByTestId("member-card-Ravi");
  await expect(card2.getByText("Joined", { exact: true })).toBeVisible();
  await card2.getByRole("button", { name: "Remove" }).click();
  await expect(card2.getByRole("alert")).toContainText("Settle this person's balance first");
  await ctx.close();
});
