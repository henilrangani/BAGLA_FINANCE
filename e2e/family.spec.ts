import { expect, test } from "@playwright/test";
import { API, apiGet, apiLogin, apiSend, nav, newUser, signUpViaUI } from "./helpers";

test("family space: invite, explicit sharing, privacy, budgets, goals and contributions", async ({ page, browser, request }) => {
  const mom = newUser("Mom Test");
  const dad = newUser("Dad Test");
  await signUpViaUI(page, mom);
  const mTok = await apiLogin(request, mom);
  const [mCash] = (await apiGet(request, mTok, "/api/v1/accounts")).filter((a: any) => a.account_type === "cash");
  // Two entries: one will be shared, one stays private.
  const groceries = await apiSend(request, mTok, "POST", "/api/v1/transactions", {
    account_id: mCash.id, amount_paise: 120_050, kind: "expense", description: "BigBasket groceries", category: "cat-groceries" });
  await apiSend(request, mTok, "POST", "/api/v1/transactions", {
    account_id: mCash.id, amount_paise: 99_999, kind: "expense", description: "Private gift", category: "cat-shopping" });

  await nav(page, "Family");
  await expect(page.getByTestId("family-empty")).toBeVisible();
  await page.getByLabel("Family name").fill("Shah Family");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("family-space")).toBeVisible();

  // Invite Dad as an adult.
  await page.getByLabel("Role for the invited person").selectOption("adult");
  await page.getByRole("button", { name: "Create invite code" }).click();
  const code = (await page.getByTestId("family-invite-code").innerText()).trim();

  const ctx = await browser.newContext();
  const dp = await ctx.newPage();
  await signUpViaUI(dp, dad);
  await nav(dp, "Family");
  await dp.getByLabel("Family invite code").fill(code);
  await dp.getByRole("button", { name: "Join", exact: true }).click();
  await expect(dp.getByTestId("family-space")).toBeVisible();
  await expect(dp.getByTestId("family-shared-total")).toHaveText("₹0");

  // Mom shares only the groceries entry.
  await page.reload();
  await nav(page, "Family");
  const row = page.getByText("BigBasket groceries").locator("xpath=ancestor::div[1]");
  await row.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("status")).toContainText("Entry shared with the family");

  await dp.getByRole("button", { name: "Refresh" }).click();
  await expect(dp.getByTestId("family-shared-total")).toHaveText("₹1,200.50");
  await expect(dp.getByText("Private gift")).toHaveCount(0);
  await expect(dp.getByText("₹999.99")).toHaveCount(0);
  // Server-side check too: Dad's API view has no private entry.
  const dTok = await apiLogin(request, dad);
  const fams = await apiGet(request, dTok, "/api/v1/families");
  const shared = await apiGet(request, dTok, `/api/v1/families/${fams[0].id}/transactions`);
  expect(shared.items.map((i: any) => i.description)).toEqual(["BigBasket groceries"]);
  // Dad can't read Mom's private entry directly.
  const peek = await request.get(`${API}/api/v1/transactions/${groceries.id}`, { headers: { Authorization: `Bearer ${dTok}` } });
  expect(peek.status()).toBe(404);

  // Dad (adult) adds a budget and a goal; both contribute; per-member amounts show.
  await dp.getByLabel("Budget name").fill("Groceries");
  await dp.getByLabel("Monthly limit in rupees").fill("1000");
  await dp.getByLabel("Budget category").selectOption({ label: "Groceries" }).catch(async () =>
    dp.getByLabel("Budget category").selectOption("cat-groceries"));
  await dp.getByRole("button", { name: "Add budget" }).click();
  const budget = dp.getByTestId("family-budget").first();
  await expect(budget).toContainText("₹1,200.50 / ₹1,000");
  await expect(budget).toContainText("Over by ₹200.50");

  await dp.getByLabel("Goal name").fill("Goa holiday");
  await dp.getByLabel("Goal target in rupees").fill("50000");
  await dp.getByRole("button", { name: "Add goal" }).click();
  await dp.getByLabel("Contribution in rupees").fill("2500.01");
  await dp.getByRole("button", { name: "Contribute" }).click();
  await expect(dp.getByTestId("family-goal").first()).toContainText("₹2,500.01 of ₹50,000");

  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByLabel("Contribution in rupees").fill("1000");
  await page.getByRole("button", { name: "Contribute" }).click();
  const goal = page.getByTestId("family-goal").first();
  await expect(goal).toContainText("₹3,500.01 of ₹50,000");
  await expect(goal).toContainText("Dad Test: ₹2,500.01");
  await expect(goal).toContainText("Mom Test (you): ₹1,000");

  // Privacy reset: Mom makes everything private; Dad's view drops to zero.
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Make all my shared entries private" }).click();
  await expect(page.getByRole("status")).toContainText("private again");
  await dp.getByRole("button", { name: "Refresh" }).click();
  await expect(dp.getByTestId("family-shared-total")).toHaveText("₹0");
  await expect(dp.getByText(/made their shared entries private/)).toBeVisible(); // activity feed
  await ctx.close();
});
