import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";

export const API = `http://127.0.0.1:${process.env.E2E_API_PORT || "8010"}`;

export interface TestUser { name: string; email: string; password: string }

/** Synthetic account, generated per test, held in memory only (never written to disk or logs). */
export function newUser(name = "Asha Test"): TestUser {
  const id = randomBytes(6).toString("hex");
  return { name, email: `e2e-${id}@example.com`, password: `E2e-${randomBytes(12).toString("hex")}-Aa1!` };
}

/** Fresh browser profile → app shell (skips the marketing landing page if shown). */
export async function openApp(page: Page) {
  await page.goto("/");
  const start = page.getByRole("button", { name: /get started|start|enter/i }).first();
  if (await start.isVisible().catch(() => false)) await start.click();
}

export async function nav(page: Page, label: RegExp | string) {
  const sidebar = page.locator("aside, nav").getByText(label, { exact: typeof label === "string" }).first();
  await sidebar.click();
}

export async function signUpViaUI(page: Page, u: TestUser) {
  await openApp(page);
  await nav(page, "Account & Sync");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Your name").fill(u.name);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expectGreeting(page, u);
}

export async function expectGreeting(page: Page, u: TestUser) {
  await expect(page.getByRole("heading", { name: new RegExp(`Good (morning|afternoon|evening), ${u.name.split(" ")[0]}`) }).first()).toBeVisible();
}

export async function signInViaUI(page: Page, u: TestUser) {
  await openApp(page);
  await nav(page, "Account & Sync");
  const already = page.getByRole("button", { name: /already have an account/i });
  if (await already.isVisible().catch(() => false)) await already.click();
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expectGreeting(page, u);
}

/** Register + sign in through the API (for second users and seeding). Returns an access token. */
export async function apiRegister(request: APIRequestContext, u: TestUser): Promise<string> {
  const r = await request.post(`${API}/api/v1/auth/register`, { data: { email: u.email, password: u.password, full_name: u.name } });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).access_token;
}

export async function apiLogin(request: APIRequestContext, u: TestUser): Promise<string> {
  const r = await request.post(`${API}/api/v1/auth/login`, { data: { email: u.email, password: u.password } });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).access_token;
}

export async function apiGet<T = any>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const r = await request.get(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}

export async function apiSend<T = any>(request: APIRequestContext, token: string, method: "POST" | "PATCH" | "DELETE",
  path: string, data?: unknown): Promise<T> {
  const r = await request.fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, data });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.status() === 204 ? (undefined as T) : r.json();
}

/** Accept the next window.confirm / alert and return its message. */
export function acceptNextDialog(page: Page): Promise<string> {
  return new Promise(resolve => page.once("dialog", d => { const m = d.message(); d.accept(); resolve(m); }));
}
