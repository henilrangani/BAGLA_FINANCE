import { expect, test, type Page } from "@playwright/test";
import { apiGet, apiLogin, expectGreeting, nav, newUser, signUpViaUI } from "./helpers";

const PROFILE_KEY = "bagla_active_profile_v1";

async function addExpense(page: Page, amount: string, merchant: string) {
  await nav(page, "Dashboard");
  await page.getByText("+ Expense", { exact: true }).click();
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await page.getByLabel("Amount in rupees").fill(amount);
  await page.getByLabel("Merchant or store").fill(merchant);
  await page.getByRole("button", { name: /Save Expense/ }).click();
}

test("support request and plan screen (no invented prices)", async ({ page }) => {
  await signUpViaUI(page, newUser("Support Test"));
  await nav(page, "Account features");
  await page.getByLabel("Subject").fill("Import question");
  await page.getByLabel("Message").fill("How do I import an HDFC statement in XLSX?");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request [A-Z0-9-]+ recorded/)).toBeVisible();
  await expect(page.getByText(/Import question/).first()).toBeVisible();
  await expect(page.getByText("Paid plans aren't available yet.")).toBeVisible();
  await expect(page.getByText("No payment method is collected. Trials end automatically.")).toBeVisible();
});

test("offline: changes queue on the device and sync on reconnect, exactly once", async ({ page, context, request }) => {
  const u = newUser("Offline Test");
  await signUpViaUI(page, u);
  const token = await apiLogin(request, u);
  await context.setOffline(true);
  await addExpense(page, "75.25", "Auto rickshaw");
  await expect(page.getByRole("status").filter({ hasText: /Offline: 1 change/ })).toBeVisible();
  expect((await apiGet(request, token, "/api/v1/transactions?status=posted")).items.length).toBe(0);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await apiGet(request, token, "/api/v1/transactions?status=posted")).items
    .map((t: any) => t.amount_paise), { timeout: 20_000 }).toEqual([7525]);
  await page.reload();
  await expectGreeting(page, u);
  expect((await apiGet(request, token, "/api/v1/transactions?status=posted")).items.length).toBe(1);
});

test("expired session: the app says so, keeps local changes, and signing in again resumes sync", async ({ page, context, request }) => {
  const u = newUser("Session Test");
  await signUpViaUI(page, u);
  // Expiry = the browser no longer has a valid refresh cookie.
  await context.clearCookies();
  await page.reload();
  await expect(page.getByText(/Your session ended/).first()).toBeVisible();
  await addExpense(page, "40", "Tea stall");
  await nav(page, "Account & Sync");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const token = await apiLogin(request, u);
  await expect.poll(async () => (await apiGet(request, token, "/api/v1/transactions?status=posted")).items
    .map((t: any) => t.amount_paise), { timeout: 20_000 }).toEqual([4000]);
});

test("an old-version session token in storage is upgraded to the cookie once and removed", async ({ page, context, request }) => {
  const u = newUser("Upgrade Test");
  const r = await request.post("http://127.0.0.1:8010/api/v1/auth/register", {
    data: { email: u.email, password: u.password, full_name: u.name } });
  const legacy = (await r.json()).refresh_token as string; // API-style body token, as older app versions stored
  const me = await (await request.get("http://127.0.0.1:8010/api/v1/users/me",
    { headers: { Authorization: `Bearer ${(await r.json()).access_token}` } })).json();
  await page.goto("/");
  await page.evaluate(([t, id, email, key]) => {
    localStorage.setItem("bagla_session_v1", JSON.stringify({ refresh_token: t, user_id: id, email }));
    localStorage.setItem(key, `cloud:${id}`); // as the older version left it
  }, [legacy, me.id, me.email, PROFILE_KEY]);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Upgrade/ }).first()).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("bagla_session_v1") || "")).not.toContain("refresh_token");
  expect((await context.cookies()).some(c => c.name === "bagla_rt" && c.httpOnly)).toBe(true);
});
