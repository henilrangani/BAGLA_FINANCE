import { expect, test } from "@playwright/test";
import { API, apiGet, apiLogin, apiSend, nav, newUser, signUpViaUI } from "./helpers";

test("group expense edit (audited re-split) and payback undo with confirmation", async ({ page, request }) => {
  const asha = newUser("Asha Test");
  await signUpViaUI(page, asha);
  const tok = await apiLogin(request, asha);
  // Seed through the API: a group with Ravi (no account) and a ₹90 dinner Asha paid, Ravi paid back ₹30.
  const g = await apiSend(request, tok, "POST", "/api/v1/groups", { name: "Flat", members: [{ display_name: "Ravi" }] });
  const ravi = g.members.find((m: any) => m.display_name === "Ravi").id;
  await apiSend(request, tok, "POST", `/api/v1/groups/${g.id}/expenses`,
    { description: "Dinner", amount_paise: 9000, paid_by_member_id: g.my_member_id });
  await apiSend(request, tok, "POST", `/api/v1/groups/${g.id}/settlements`,
    { from_member_id: ravi, to_member_id: g.my_member_id, amount_paise: 3000, method: "cash" });

  await page.reload();
  await nav(page, "Groups");
  await page.getByRole("button", { name: /All Expenses/ }).click();
  await page.getByRole("button", { name: "Edit expense Dinner" }).click();
  await page.getByLabel("Expense description").fill("Dinner at Leela");
  await page.getByLabel("Expense amount in rupees").fill("100.01");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Dinner at Leela")).toBeVisible();
  await expect(page.getByText("₹100.01").first()).toBeVisible();
  const d = await apiGet(request, tok, `/api/v1/groups/${g.id}`);
  expect(d.expenses[0].amount_paise).toBe(10001);
  expect(d.expenses[0].shares.map((s: any) => s.share_paise).sort()).toEqual([5000, 5001]);

  // Undo the ₹30 payback: the dialog explains it; the payment stays in history as void; Ravi owes it again.
  await page.getByRole("button", { name: /Overview/ }).click();
  const dialog = new Promise<string>(r => page.once("dialog", dg => { const m = dg.message(); dg.accept(); r(m); }));
  await page.getByRole("button", { name: /Undo payment Ravi to/ }).click();
  expect(await dialog).toContain("Only do this if the payment didn't actually happen");
  await expect.poll(async () => (await apiGet(request, tok, `/api/v1/groups/${g.id}`)).settlements[0].status).toBe("void");
  const after = await apiGet(request, tok, `/api/v1/groups/${g.id}`);
  const nets = Object.fromEntries(after.members.map((m: any) => [m.display_name, m.net_paise]));
  expect(nets.Ravi).toBe(-after.expenses[0].shares.find((s: any) => s.member_id === ravi).share_paise);
  expect(Object.values(nets).reduce((a: any, b: any) => a + b, 0)).toBe(0);
  void API;
});

test("reminder preferences save and persist; email is honestly marked unavailable", async ({ page }) => {
  await signUpViaUI(page, newUser("Remind Test"));
  await nav(page, "Recurring");
  const panel = page.getByTestId("reminders-panel");
  await expect(panel).toContainText("No reminders yet");
  await expect(panel).toContainText("no email provider is connected");
  await panel.getByLabel("Quiet hours start").fill("22:00");
  await expect(panel.getByRole("status")).toContainText("saved");
  await panel.getByLabel("Quiet hours end").fill("07:00");
  await panel.getByText("Remind me about bills").click();
  await expect(panel.getByRole("status")).toContainText("saved");
  await page.reload();
  await nav(page, "Recurring");
  await expect(panel.getByLabel("Quiet hours start")).toHaveValue("22:00");
  await expect(panel.getByLabel("Quiet hours end")).toHaveValue("07:00");
  await expect(panel.getByRole("checkbox").first()).not.toBeChecked();
});
