import { expect, test, type Page } from "@playwright/test";
import { apiGet, apiLogin, nav, newUser, openApp, signUpViaUI } from "./helpers";

/** The group is saved to the server in the background; until it exists this returns null (poll again). */
async function detail(request: any, token: string) {
  const list = await apiGet(request, token, "/api/v1/groups");
  return list.length ? apiGet(request, token, `/api/v1/groups/${list[0].id}`) : null;
}

async function createGroup(page: Page, name: string, type: string, people: string[]) {
  await nav(page, "Groups");
  await page.getByText("Create Your First Group").click();
  const d = page.getByRole("dialog", { name: "Create a group" });
  await d.getByLabel("Group name").fill(name);
  await d.getByRole("radio", { name: new RegExp(type) }).click();
  for (let i = 0; i < people.length; i++) {
    if (i > 0) await d.getByRole("button", { name: "Add person" }).click();
    await d.getByLabel(`Person ${i + 2} name`).fill(people[i]);
  }
  await d.getByRole("button", { name: "Create group" }).click();
  await expect(d).toBeHidden();
}

test("group setup: any number of named people, validation, type, and no invented members", async ({ page }) => {
  await openApp(page);
  await nav(page, "Groups");
  // Starting from a type pre-fills the form but adds nobody.
  await page.getByRole("button", { name: /Flatmates \/ Room Rent/ }).click();
  const d = page.getByRole("dialog", { name: "Create a group" });
  await expect(d.getByRole("radio", { name: /Flatmates/ })).toHaveAttribute("aria-checked", "true");
  await expect(d.getByLabel("Person 2 name")).toHaveValue("");
  await d.getByLabel("Group name").fill("Flat 7B");
  await d.getByRole("button", { name: "Create group" }).click();
  await expect(d.getByRole("alert")).toContainText("Add at least one other person");
  // Add six people, remove one, catch a duplicate.
  const names = ["Asha", "Ravi", "Meera", "Kabir", "Zoya", "Ravi"];
  for (let i = 0; i < names.length; i++) {
    if (i > 0) await d.getByRole("button", { name: "Add person" }).click();
    await d.getByLabel(`Person ${i + 2} name`).fill(names[i]);
  }
  await d.getByRole("button", { name: "Create group" }).click();
  await expect(d.getByRole("alert")).toContainText("same name");
  await d.getByRole("button", { name: "Remove person 7" }).click();
  await d.getByRole("button", { name: "Create group" }).click();
  await expect(d).toBeHidden();
  await expect(page.getByTestId("group-type")).toHaveText("Flatmates");
  await expect(page.getByText("6 people")).toBeVisible(); // you + 5
  await page.getByRole("button", { name: /Members & Balances/ }).click();
  for (const n of ["Asha", "Ravi", "Meera", "Kabir", "Zoya"]) await expect(page.getByTestId(`member-card-${n}`)).toBeVisible();
  await expect(page.getByTestId("member-card-Amit")).toHaveCount(0); // no template people

  // Edit details later: custom category.
  await page.getByRole("button", { name: "Edit group" }).click();
  const e = page.getByRole("dialog", { name: "Edit group details" });
  await e.getByRole("radio", { name: /Custom/ }).click();
  await e.getByLabel("Custom category (optional)").fill("Cricket club");
  await e.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("group-type")).toHaveText("Cricket club");
});

test("flexible splits match the server to the paisa; partial payback; rename keeps history", async ({ page, request }) => {
  const u = newUser("Asha Test");
  await signUpViaUI(page, u);
  const tok = await apiLogin(request, u);
  await createGroup(page, "Weekend trip", "Trip", ["Ravi", "Meera", "Kabir"]);
  await expect.poll(async () => (await detail(request, tok))?.members.length).toBe(4);
  let g = await detail(request, tok);
  expect(g.group_type).toBe("trip");
  const id = Object.fromEntries(g.members.map((m: any) => [m.display_name, m.id]));

  // Percentages, Kabir left out: ₹999.99 at 50/30/20 → 499.99 / 300.00 / 200.00 (largest remainder).
  await page.getByText("+ Add Expense").last().click();
  let d = page.getByRole("dialog", { name: "Add Group Expense" });
  await d.getByLabel("What was it for?").fill("Villa");
  await d.getByLabel("Total amount (₹)").fill("999.99");
  await d.getByRole("radio", { name: "Percentages" }).click();
  await d.getByLabel("Kabir", { exact: true }).uncheck();
  await d.getByLabel("Asha Test percent").fill("50");
  await d.getByLabel("Ravi percent").fill("30");
  await d.getByLabel("Meera percent").fill("10");
  await expect(d.getByText("10% still to assign")).toBeVisible();
  await expect(d.getByRole("button", { name: "Save expense" })).toBeDisabled(); // can't save while it doesn't add up
  await d.getByLabel("Meera percent").fill("20");
  await expect(d.getByTestId("share-Asha Test")).toHaveText("₹499.99");
  await expect(d.getByTestId("share-Ravi")).toHaveText("₹300.00");
  await expect(d.getByTestId("share-Meera")).toHaveText("₹200.00");
  await expect(d.getByTestId("share-Kabir")).toHaveText("not in it");
  await expect(d.getByText("Adds up exactly to ₹999.99")).toBeVisible();
  await d.getByRole("button", { name: "Save expense" }).click();
  await expect(d).toBeHidden();
  await expect.poll(async () => (await detail(request, tok))?.expenses.length).toBe(1);
  g = await detail(request, tok);
  const villa = g.expenses[0];
  expect(villa.split_method).toBe("percentage");
  expect(Object.fromEntries(villa.shares.map((s: any) => [s.member_id, s.share_paise])))
    .toEqual({ [id["Asha Test"]]: 49999, [id["Ravi"]]: 30000, [id["Meera"]]: 20000 }); // server == preview

  // Shares 2:1:1 on ₹100.01; exact amounts that don't add up are refused.
  await page.getByText("+ Add Expense").last().click();
  d = page.getByRole("dialog", { name: "Add Group Expense" });
  await d.getByLabel("What was it for?").fill("Dinner");
  await d.getByLabel("Total amount (₹)").fill("100.01");
  await d.getByRole("radio", { name: "Exact amounts" }).click();
  await d.getByLabel("Ravi amount").fill("50");
  await expect(d.getByText("₹50.01 still to assign")).toBeVisible();
  await d.getByRole("radio", { name: "Shares" }).click();
  await d.getByLabel("Kabir", { exact: true }).uncheck();
  await d.getByLabel("Asha Test shares").fill("2");
  await expect(d.getByTestId("share-Asha Test")).toHaveText("₹50.01");
  await expect(d.getByTestId("share-Ravi")).toHaveText("₹25.00");
  await d.getByRole("button", { name: "Save expense" }).click();
  await expect.poll(async () => (await detail(request, tok))?.expenses.length).toBe(2);
  g = await detail(request, tok);
  expect(g.members.reduce((s: number, m: any) => s + m.net_paise, 0)).toBe(0);

  // Ravi owes 300.00 + 25.00 = ₹325.00. He pays ₹100 back (part-payment); ₹225 stays outstanding.
  await page.getByRole("button", { name: /Overview/ }).click();
  const raviRow = page.getByText("Ravi", { exact: true }).locator("xpath=ancestor::div[.//*[normalize-space(text())='Settle']][1]");
  await raviRow.getByText("Settle", { exact: true }).click();
  const settle = page.getByRole("dialog", { name: "Settle Payment" });
  await expect(settle.getByLabel("Amount paid (₹)")).toHaveValue("325.00");
  await settle.getByLabel("Amount paid (₹)").fill("400");
  await settle.getByRole("button", { name: /Mark as Settled/ }).click();
  await expect(settle.getByRole("alert")).toContainText("more than the ₹325.00 outstanding");
  await settle.getByLabel("Amount paid (₹)").fill("100");
  await settle.getByLabel("How").selectOption("cash");
  await settle.getByRole("button", { name: "Record part-payment" }).click();
  await expect.poll(async () => (await detail(request, tok))?.settlements.filter((s: any) => s.status === "recorded").length).toBe(1);
  g = await detail(request, tok);
  expect([g.settlements[0].amount_paise, g.settlements[0].method]).toEqual([10000, "cash"]);
  expect(g.members.find((m: any) => m.id === id["Ravi"]).net_paise).toBe(-22500);

  // Rename Ravi: same seat, same history and balance.
  await page.getByRole("button", { name: /Members & Balances/ }).click();
  const card = page.getByTestId("member-card-Ravi");
  await card.getByRole("button", { name: "Rename" }).click();
  await card.getByLabel("New name for Ravi").fill("Ravi K.");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("member-card-Ravi K.")).toBeVisible();
  g = await detail(request, tok);
  const ravi = g.members.find((m: any) => m.id === id["Ravi"]);
  expect([ravi.display_name, ravi.net_paise]).toEqual(["Ravi K.", -22500]);
  expect(g.expenses.length).toBe(2);
});

test("expense templates only pre-fill text; the monthly summary is exact", async ({ page }) => {
  await openApp(page);
  await nav(page, "Groups");
  await page.getByRole("button", { name: /Flatmates \/ Room Rent/ }).click();
  const setup = page.getByRole("dialog", { name: "Create a group" });
  await setup.getByLabel("Group name").fill("Template Flat");
  await setup.getByLabel("Person 2 name").fill("Ravi");
  await setup.getByRole("button", { name: "Add person" }).click();
  await setup.getByLabel("Person 3 name").fill("Meera");
  await setup.getByRole("button", { name: "Create group" }).click();
  await expect(setup).toBeHidden();

  await page.getByText("+ Add Expense").last().click();
  const d = page.getByRole("dialog", { name: "Add Group Expense" });
  await d.getByRole("button", { name: "Monthly rent" }).click();
  await expect(d.getByLabel("What was it for?")).toHaveValue("Monthly rent");
  await expect(d.getByLabel("Total amount (₹)")).toHaveValue(""); // never an invented amount
  await d.getByLabel("What was it for?").fill("Rent – November");  // still editable
  await d.getByLabel("Total amount (₹)").fill("2501");
  await d.getByRole("radio", { name: "Shares" }).click();
  const me = await d.locator("label", { hasText: "(you)" }).first().innerText();
  const myName = me.replace(" (you)", "").trim();
  await d.getByLabel(`${myName} shares`).fill("2");
  await d.getByLabel("Ravi shares").fill("2");
  await expect(d.getByTestId(`share-${myName}`)).toHaveText("₹1,000.40");
  await expect(d.getByTestId("share-Ravi")).toHaveText("₹1,000.40");
  await expect(d.getByTestId("share-Meera")).toHaveText("₹500.20");
  await d.getByRole("button", { name: "Save expense" }).click();
  await expect(d).toBeHidden();
  const summary = page.getByTestId("group-month-summary");
  await expect(summary).toContainText("Group spending: ₹2,501.00");
  await expect(summary).toContainText("1 expense");
  await expect(summary).toContainText("Your share: ₹1,000.40");
});
