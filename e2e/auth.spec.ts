import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { API, apiGet, apiLogin, expectGreeting, nav, newUser, signInViaUI, signUpViaUI } from "./helpers";

test("registration, sign-in on a fresh browser, and session survives reload", async ({ page, browser, request }) => {
  const u = newUser("Asha Test");
  await signUpViaUI(page, u);
  // The refresh token lives only in an HttpOnly cookie: page scripts and storage never see it.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toMatch(/refresh_token/);
  const rt = (await page.context().cookies()).find(c => c.name === "bagla_rt");
  expect(rt?.httpOnly).toBe(true);
  expect(rt?.path).toBe("/api/v1/auth");
  // SameSite as sent by the server (WebKit's cookie API reports "None" on some platforms).
  const r = await page.request.post(`${API}/api/v1/auth/login`, {
    headers: { "X-Bagla-Client": "web" }, data: { email: u.email, password: u.password } });
  expect(r.headers()["set-cookie"]).toMatch(/bagla_rt=.*HttpOnly.*SameSite=lax/i);
  expect(await page.evaluate(() => document.cookie)).not.toContain("bagla_rt");
  await page.reload();
  await expectGreeting(page, u);
  // The server holds the account.
  const token = await apiLogin(request, u);
  expect((await apiGet(request, token, "/api/v1/users/me")).email).toBe(u.email);

  // A new, empty browser profile signs in with the same account.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await signInViaUI(p2, u);
  await nav(p2, "Account & Sync");
  await expect(p2.getByText(u.email)).toBeVisible();
  await ctx.close();
});

test("wrong password is refused with a clear message", async ({ page, request }) => {
  const u = newUser();
  await signUpViaUI(page, u);
  const ctx = await page.context().browser()!.newContext();
  const p2 = await ctx.newPage();
  await p2.goto("/");
  await nav(p2, "Account & Sync");
  await p2.getByLabel("Email").fill(u.email);
  await p2.getByLabel("Password").fill("not-the-password");
  await p2.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p2.getByRole("alert")).toBeVisible();
  await ctx.close();
  void request;
});

test("signed-in user can download a complete export of their account data", async ({ page, request }) => {
  const u = newUser("Kavya Test");
  await signUpViaUI(page, u);
  const token = await apiLogin(request, u);
  await nav(page, "Account & Sync");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download (.json)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^bagla-account-export-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const data = JSON.parse(readFileSync(file, "utf8"));
  expect(data.format).toBe("bagla-finance-export/1");
  expect(data.user.email).toBe(u.email);
  expect(JSON.stringify(data)).not.toMatch(/password_hash|refresh_token/);
  const accounts = await apiGet(request, token, "/api/v1/accounts");
  expect(data.accounts.map((a: any) => a.id).sort()).toEqual(accounts.map((a: any) => a.id).sort());
});
