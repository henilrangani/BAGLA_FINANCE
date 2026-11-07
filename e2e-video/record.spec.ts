/**
 * Records the investor walkthrough from the REAL local demo app (synthetic data only).
 * Frames come from Chrome's screencast (JPEG, 1920x1080); each narration beat's actions run, then the
 * recorder waits until that beat's voice-over (durations.json) has finished, so picture and voice stay in sync.
 * Output: investor-demo/video/rec/frames/*.jpg, rec/frames.json, rec/timeline.json.
 * Run:  npx playwright test -c playwright.video.config.ts record
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";

const V = "D:/BAGLA_FINANCE_WORKSPACE/investor-demo/video";
const REC = `${V}/${process.env.RECDIR || "rec"}`;
const DUR: Record<string, number> = JSON.parse(readFileSync(`${V}/durations.json`, "utf8"));
const NARR = JSON.parse(readFileSync(`${V}/narration.json`, "utf8"));
const PASSWORD = readFileSync("D:/BAGLA_FINANCE_WORKSPACE/investor-demo/.demo.env", "utf8")
  .split(/\r?\n/).find(l => l.startsWith("DEMO_PASSWORD="))!.slice("DEMO_PASSWORD=".length).trim();
const ONLY = process.env.SCENES ? process.env.SCENES.split(",") : null; // e.g. SCENES=s05 for a dry run
const GAP = 0.45; // seconds of breathing room after each beat's narration

test.use({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });

// ---------- visible cursor (headless Chrome draws none) ----------
const CURSOR = `
(() => {
  const mk = () => {
    if (document.getElementById('__vc')) return;
    const c = document.createElement('div'); c.id = '__vc';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#111827" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed', left:'0', top:'0', zIndex:2147483647, pointerEvents:'none', transform:'translate(-200px,-200px)', filter:'drop-shadow(0 2px 3px rgba(0,0,0,.35))'});
    const r = document.createElement('div'); r.id = '__vr';
    Object.assign(r.style, {position:'fixed', width:'34px', height:'34px', marginLeft:'-17px', marginTop:'-17px', borderRadius:'50%', border:'3px solid #10b981', zIndex:2147483646, pointerEvents:'none', opacity:'0', left:'0', top:'0'});
    document.documentElement.append(c, r);
    const p = window.__vcpos || [-200, -200]; c.style.transform = 'translate(' + (p[0]-3) + 'px,' + (p[1]-2) + 'px)';
  };
  addEventListener('mousemove', e => { mk(); window.__vcpos = [e.clientX, e.clientY];
    document.getElementById('__vc').style.transform = 'translate(' + (e.clientX-3) + 'px,' + (e.clientY-2) + 'px)'; }, true);
  addEventListener('mousedown', e => { mk(); const r = document.getElementById('__vr');
    r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    r.animate([{opacity: .9, transform: 'scale(.4)'}, {opacity: 0, transform: 'scale(1.6)'}], {duration: 550, easing: 'ease-out'}); }, true);
  document.addEventListener('DOMContentLoaded', mk);
})();`;

// ---------- frame capture ----------
let cdp: CDPSession;
let t0 = 0;
let frameNo = 0;
const frames: { f: string; t: number }[] = [];
let capturing = false;
const now = () => (Date.now() - t0) / 1000;

async function startCapture(page: Page) {
  cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    const f = `f${String(++frameNo).padStart(6, "0")}.jpg`;
    writeFileSync(`${REC}/frames/${f}`, Buffer.from(data, "base64"));
    frames.push({ f, t: now() });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 2 });
}
async function restartCapture() {
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 2 });
}

// ---------- human-like actions ----------
let mouse = { x: 760, y: 430 };
const sleep = (p: Page, ms: number) => p.waitForTimeout(ms);
const misses: string[] = [];

async function moveTo(page: Page, x: number, y: number, ms = 550) {
  const steps = Math.max(8, Math.round(ms / 16));
  const sx = mouse.x, sy = mouse.y;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
    await sleep(page, 14);
  }
  mouse = { x, y };
}
async function hover(page: Page, l: Locator, pause = 700) {
  try {
    await l.scrollIntoViewIfNeeded({ timeout: 4000 });
    const b = await l.boundingBox({ timeout: 4000 });
    if (!b) throw new Error("no box");
    await moveTo(page, b.x + Math.min(b.width / 2, 120), b.y + b.height / 2);
    await sleep(page, pause);
  } catch (e) { misses.push(`hover ${l}: ${String(e).slice(0, 90)}`); }
}
async function click(page: Page, l: Locator, pause = 500) {
  try {
    await l.scrollIntoViewIfNeeded({ timeout: 5000 });
    const b = await l.boundingBox({ timeout: 5000 });
    if (!b) throw new Error("no box");
    await moveTo(page, b.x + Math.min(b.width / 2, 120), b.y + b.height / 2);
    await sleep(page, 160);
    await page.mouse.click(mouse.x, mouse.y);
    await sleep(page, pause);
  } catch (e) { misses.push(`click ${l}: ${String(e).slice(0, 90)}`); }
}
async function type(page: Page, l: Locator, text: string) {
  await click(page, l, 150);
  try { await l.fill(""); await l.pressSequentially(text, { delay: 55 }); } catch (e) { misses.push(`type ${l}: ${String(e).slice(0, 90)}`); }
  await sleep(page, 250);
}
async function scrollTo(page: Page, l: Locator, block: "start" | "center" = "start") {
  try {
    await l.first().evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b as ScrollLogicalPosition }), block, { timeout: 4000 });
    await sleep(page, 1100);
  } catch (e) { misses.push(`scroll ${l}: ${String(e).slice(0, 90)}`); }
}
async function scrollTop(page: Page) {
  await page.evaluate(() => { window.scrollTo({ top: 0, behavior: "smooth" }); document.querySelectorAll("main, [class*='overflow-y']").forEach(e => (e as HTMLElement).scrollTo?.({ top: 0, behavior: "smooth" })); });
  await sleep(page, 900);
}
const side = (page: Page, label: string) => page.locator("aside").getByText(label, { exact: true }).first();
async function nav(page: Page, label: string) { await click(page, side(page, label), 900); await scrollTop(page); }
async function escape(page: Page) {
  await page.keyboard.press("Escape"); await sleep(page, 350);
  const d = page.getByRole("alertdialog").getByRole("button", { name: "Discard" });
  if (await d.isVisible().catch(() => false)) await d.click();
}

async function signIn(page: Page, email: string, visible: boolean) {
  await (visible ? click(page, side(page, "Account & Sync"), 800) : side(page, "Account & Sync").click());
  const already = page.getByRole("button", { name: /already have an account/i });
  if (await already.isVisible().catch(() => false)) await already.click();
  const em = page.getByLabel("Email");
  if (visible) await type(page, em, email); else await em.fill(email);
  if (visible) await click(page, page.getByLabel("Password"), 150);
  await page.getByLabel("Password").fill(PASSWORD); // masked field: dots only, never the password
  await (visible ? click(page, page.getByRole("button", { name: "Sign in", exact: true }), 300)
    : page.getByRole("button", { name: "Sign in", exact: true }).click());
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).first()).toBeVisible({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await sleep(page, 2500);
  await page.waitForLoadState("networkidle");
  await restartCapture();
  mouse = { x: 760, y: 430 };
}
async function signOut(page: Page) {
  await side(page, "Account & Sync").click({ timeout: 15000 });
  await page.getByRole("button", { name: "Sign out" }).click({ timeout: 15000 });
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: /sign out/i });
  if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.click();
  await page.waitForLoadState("networkidle"); await sleep(page, 2000);
  await restartCapture();
}

// ---------- beats ----------
type Act = (p: Page) => Promise<void>;
const main = (p: Page) => p.locator("main");
const ACTIONS: Record<string, Act> = {
  // Scene 3: navigation and sign-in (starts signed out, on-device demo mode)
  s03b1: async p => { await moveTo(p, 900, 300); await hover(p, p.getByText("Demo Mode").first(), 900); await scrollTo(p, p.getByText("Monthly Overview").first(), "center"); await scrollTop(p); },
  s03b2: async p => { for (const l of ["Dashboard", "Transactions", "Groups", "Budgets", "Goals", "Recurring", "Analytics", "AI Assistant", "Family", "Account features", "Account & Sync", "Settings"]) await hover(p, side(p, l), 520); },
  s03b3: async p => { for (const n of [/^Online$/, /Ask AI/, /^Professional$/]) await hover(p, p.getByRole("button", { name: n }).first(), 600);
    await hover(p, p.getByRole("button", { name: /Add Expense/ }).locator("visible=true").first(), 700); },
  s03b4: async p => { await signIn(p, "priya.demo@example.com", true); },
  s03b5: async p => { await hover(p, p.getByText("Real Ledger").first(), 1200); await hover(p, p.getByRole("heading", { name: /Good (morning|afternoon|evening), Priya/ }).first(), 600); },

  // Scene 4: dashboard
  s04b1: async p => { await nav(p, "Dashboard"); for (const n of [/^\+ Expense$/, /Voice$/, /^Scan Bill$/, /^Split Hub$/, /^Cash Wallet$/, /^Bagla AI$/]) await hover(p, main(p).getByText(n).first(), 450);
    await hover(p, main(p).getByText(/Chai ₹20/).first(), 500); await hover(p, main(p).getByText(/Auto ₹60/).first(), 500); },
  s04b2: async p => { await scrollTo(p, main(p).getByText("TODAY'S EXPENSE").first(), "center");
    for (const n of [/today's expense/i, /today's income/i, /today's balance/i, /monthly savings/i]) await hover(p, main(p).getByText(n).first(), 650); },
  s04b3: async p => { await scrollTo(p, main(p).getByText("Monthly Overview").first(), "center"); await hover(p, main(p).getByText("Monthly Overview").first(), 900);
    await hover(p, main(p).getByText("Spending by Category").first(), 900); },
  s04b4: async p => { await scrollTo(p, main(p).getByText("Recent Transactions").first(), "center"); await hover(p, main(p).getByText("Recent Transactions").first(), 700);
    await hover(p, main(p).getByText("Budgets Progress").first(), 700); await hover(p, main(p).getByText(/YOU'RE OWED/i).first(), 700); },
  s04b5: async p => { await hover(p, main(p).getByText("AI Coach").first(), 600); await hover(p, main(p).getByText(/RULE-BASED/i).first(), 1200);
    await hover(p, main(p).getByText("Ask AI Coach").first(), 500); },

  // Scene 5: transactions and cash
  s05b1: async p => { await nav(p, "Transactions"); await hover(p, main(p).getByText("Transaction Ledger").first(), 600);
    await moveTo(p, 900, 640); },
  s05b2: async p => { for (const n of ["Expense", "Income", "All"]) await hover(p, main(p).getByText(n, { exact: true }).locator("visible=true").first(), 380);
    await hover(p, main(p).locator("select").first(), 500);
    await type(p, main(p).getByPlaceholder(/Search by merchant/), "Kirana"); await sleep(p, 900); },
  s05b3: async p => { await click(p, main(p).getByText("Kirana Store (demo)").first(), 900);
    const d = p.getByRole("dialog"); await hover(p, d.getByRole("button", { name: "Edit" }), 900); await hover(p, d.getByRole("button", { name: "Delete" }), 600);
    await click(p, d.getByRole("button", { name: "Close", exact: true }).last(), 500); },
  s05b4: async p => { await main(p).getByPlaceholder(/Search by merchant/).fill(""); await sleep(p, 300);
    await click(p, main(p).getByRole("button", { name: "+ Add Entry" }), 700);
    const d = p.getByRole("dialog", { name: "Record Transaction" });
    await hover(p, d.getByText(/Smart/).first(), 500);
    await click(p, d.getByRole("button", { name: "Standard", exact: true }), 500);
    await type(p, d.getByLabel("Amount in rupees"), "185.50");
    await type(p, d.getByLabel("Merchant or store"), "Chai Point (demo)");
    await click(p, d.getByRole("button", { name: /Save Expense/ }), 900); },
  s05b5: async p => { await scrollTop(p); await hover(p, main(p).getByText("Chai Point (demo)").first(), 1200); await hover(p, main(p).getByText("Income", { exact: true }).locator("visible=true").first(), 600); },
  s05b6: async p => { await click(p, main(p).getByRole("button", { name: "Import CSV" }), 1800); await escape(p);
    await hover(p, main(p).getByRole("button", { name: "Export CSV" }), 800); },
  s05b7: async p => { await nav(p, "Dashboard"); await click(p, main(p).getByText("Cash Wallet", { exact: true }).first(), 1000);
    await hover(p, main(p).getByText("Current Physical Cash in Pocket"), 700);
    await type(p, main(p).getByLabel("What the cash was spent on"), "Auto (demo)");
    await type(p, main(p).getByLabel("Cash amount in rupees"), "60");
    await click(p, main(p).getByRole("button", { name: "Add", exact: true }), 900);
    await hover(p, main(p).getByRole("button", { name: /Reconcile/ }), 700); },

  // Scene 6: budgets and goals
  s06b1: async p => { await nav(p, "Budgets"); for (const n of ["Groceries", "Food delivery", "Transport", "Shopping"]) await hover(p, main(p).getByText(n, { exact: true }).first(), 650); },
  s06b2: async p => { await click(p, main(p).getByRole("button", { name: "+ Create Budget" }), 600);
    const d = p.getByRole("dialog");
    await type(p, d.getByPlaceholder(/Monthly Dining Out/i), "Entertainment (demo)");
    await type(p, d.locator("input[type=number]").first(), "2000");
    try { const s = d.locator("select").first(); const opts = await s.locator("option").allTextContents();
      const pick = opts.find(o => /entertain|movie/i.test(o)) || opts[opts.length - 1]; await hover(p, s, 300); await s.selectOption({ label: pick }); } catch (e) { misses.push("budget category " + e); }
    await sleep(p, 500);
    await click(p, d.getByRole("button", { name: /Save Budget/ }), 1000); },
  s06b3: async p => { await click(p, main(p).getByRole("button", { name: "Simulator" }), 900); await hover(p, main(p).getByText(/MONTHLY EXTRA SAVED/i).first(), 700);
    try { const r = main(p).locator("input[type=range]").first(); const b = await r.boundingBox(); if (b) { await moveTo(p, b.x + b.width * 0.2, b.y + b.height / 2);
      await p.mouse.down(); await moveTo(p, b.x + b.width * 0.3, b.y + b.height / 2, 700); await p.mouse.up(); } } catch { /* optional */ }
    await hover(p, main(p).getByText(/COMPOUNDED IMPACT/i).first(), 700); },
  s06b4: async p => { await click(p, main(p).getByRole("button", { name: /^Goals \(/ }), 900);
    await hover(p, main(p).getByText("Emergency fund").first(), 900); await hover(p, main(p).getByText("Goa trip").first(), 900); },
  s06b5: async p => { await click(p, main(p).getByRole("button", { name: /Top-Up ₹1,000/ }).first(), 1300);
    await click(p, main(p).getByRole("button", { name: "+ Create Savings Target" }), 900);
    const d = p.getByRole("dialog"); await hover(p, d.getByPlaceholder(/Goa Vacation/i), 600); await hover(p, d.locator("input[type=number]").first(), 500);
    await click(p, d.getByRole("button", { name: "Cancel" }), 500); await escape(p); },

  // Scene 7: analytics
  s07b1: async p => { await nav(p, "Analytics"); for (const n of [/TOTAL INFLOW/i, /TOTAL OUTFLOW/i, /NET SAVINGS/i]) await hover(p, main(p).getByText(n).first(), 650);
    await click(p, main(p).getByRole("button", { name: "This Quarter" }), 1000); await click(p, main(p).getByRole("button", { name: "This Month" }), 700); },
  s07b2: async p => { const r = p.getByTestId("spending-reports"); await scrollTo(p, r, "start");
    await click(p, r.getByRole("radio", { name: "Last month" }), 1000); await click(p, r.getByRole("radio", { name: "Last 30 days" }), 900);
    await hover(p, main(p).getByText("By category").first(), 700); await hover(p, main(p).getByText("Daily spending").first(), 700); },
  s07b3: async p => { await scrollTo(p, main(p).getByText("Income vs spending, last 6 months").first(), "center");
    await hover(p, main(p).getByText("Income vs spending, last 6 months").first(), 1200); await hover(p, main(p).getByText("Budgets vs actual (current period)").first(), 1200); },
  s07b4: async p => { await scrollTo(p, main(p).getByText("Bagla Financial Health Index").first(), "center");
    for (const n of ["Budget Adherence", "Savings Consistency", "Recurring Expense Burden", "Spending Stability"]) await hover(p, main(p).getByText(n).first(), 800); },
  s07b5: async p => { await scrollTo(p, main(p).getByText("Month-over-Month Comparison").first(), "center");
    await hover(p, main(p).getByText("Month-over-Month Comparison").first(), 900); await hover(p, main(p).getByText("Top Merchants & Payees").first(), 1000);
    const r = p.getByTestId("spending-reports"); await scrollTo(p, r, "start"); await hover(p, r.getByRole("button", { name: /Export CSV/ }), 900); },

  // Scene 8: groups
  s08b1: async p => { await nav(p, "Groups"); await hover(p, main(p).getByText("Flat 302 (demo)").nth(1), 700); await hover(p, main(p).getByTestId("group-type"), 600);
    await hover(p, main(p).getByText("Edit group").first(), 700); },
  s08b2: async p => { await scrollTo(p, main(p).getByText("TOTAL GROUP SPEND").first(), "center");
    for (const n of [/TOTAL GROUP SPEND/i, /AVERAGE \/ PERSON/i, /^YOU PAID$/i, /YOU ARE OWED/i]) await hover(p, main(p).getByText(n).first(), 600); },
  s08b3: async p => { await scrollTo(p, main(p).getByText(/Suggested Settlements/).first(), "start");
    await hover(p, main(p).getByText("Ankit (demo)").first(), 600); await hover(p, main(p).getByText("Sneha (demo)").nth(1), 600);
    await hover(p, main(p).getByText(/SETTLED PAYMENTS HISTORY/i).first(), 600); await hover(p, main(p).getByRole("button", { name: "Undo" }).first(), 700); },
  s08b4: async p => { await scrollTop(p); await click(p, main(p).getByRole("button", { name: /\+ Add Expense/ }).last(), 800);
    const g = p.getByRole("dialog", { name: "Add Group Expense" });
    await click(p, g.getByRole("button", { name: "Groceries" }), 400);
    await type(p, g.getByLabel(/What was it for/), "Monthly groceries (demo)");
    await type(p, g.getByLabel("Total amount (₹)"), "1500");
    await hover(p, g.getByLabel(/Paid by/).first(), 500); await hover(p, g.getByText(/Who took part/).first(), 600); },
  s08b5: async p => { const g = p.getByRole("dialog", { name: "Add Group Expense" });
    for (const n of ["Exact amounts", "Shares"]) await hover(p, g.getByRole("radio", { name: n }), 350);
    await click(p, g.getByRole("radio", { name: "Percentages" }), 500); await click(p, g.getByRole("button", { name: "Fill evenly" }), 700);
    await scrollTo(p, g.getByText(/Adds up exactly/).first(), "center"); await hover(p, g.getByText(/Adds up exactly/).first(), 900); },
  s08b6: async p => { const g = p.getByRole("dialog", { name: "Add Group Expense" }); await click(p, g.getByRole("button", { name: "Save expense" }), 1200);
    await scrollTo(p, main(p).getByText("TOTAL GROUP SPEND").first(), "center"); await hover(p, main(p).getByText(/TOTAL GROUP SPEND/i).first(), 800); },
  s08b7: async p => { await scrollTo(p, main(p).getByText(/Suggested Settlements/).first(), "start");
    const row = main(p).locator("div").filter({ hasText: /Sneha \(demo\).*Rahul \(demo\)/ }).filter({ has: p.getByRole("button", { name: /Settle/ }) }).last();
    await click(p, row.getByRole("button", { name: /Settle/ }).first(), 900);
    const d = p.getByRole("dialog"); await type(p, d.getByLabel(/Amount paid/), "200");
    try { await hover(p, d.getByLabel(/How/), 300); await d.getByLabel(/How/).selectOption("upi"); } catch { /* optional */ }
    await hover(p, d.getByText(/Record a payment that already happened/), 900);
    await click(p, d.getByRole("button", { name: /Record part-payment|Mark as Settled/ }), 1200);
    await scrollTo(p, main(p).getByText(/SETTLED PAYMENTS HISTORY/i).first(), "center"); },
  s08b8: async p => { await scrollTop(p); await click(p, main(p).getByRole("button", { name: /All Expenses/ }), 1500);
    await click(p, main(p).getByRole("button", { name: /Members & Balances/ }), 1500); await hover(p, main(p).getByTestId("member-card-Ankit (demo)"), 900); },
  s08b9: async p => { await click(p, main(p).getByRole("button", { name: /Overview & Settlements/ }), 500);
    await scrollTo(p, main(p).getByText("Start from a type").first(), "start");
    for (const n of ["Vacation / Roadtrip", "Flatmates / Room Rent", "Office & Colleagues", "Trek & Adventure", "Party & Fest", "Custom Anything"]) await hover(p, main(p).getByText(n, { exact: true }).first(), 380);
    await scrollTop(p); await hover(p, main(p).getByRole("button", { name: "Join with a code" }), 700); },

  // Scene 9: family (Priya, then Raj)
  s09b1: async p => { await nav(p, "Family"); await hover(p, main(p).getByText("Sharma Family (demo)").first(), 600); await hover(p, main(p).getByText(/Your entries are/).first(), 1500); },
  s09b2: async p => { await hover(p, main(p).getByText("Members").first(), 500); await hover(p, main(p).locator("select").filter({ hasText: "viewer" }).first(), 700);
    await hover(p, main(p).getByText("Raj Sharma").first(), 500); await hover(p, main(p).getByRole("button", { name: "Create invite code" }), 900); },
  s09b3: async p => { await hover(p, main(p).getByText(/Shared spending ·/).first(), 900); await hover(p, main(p).getByText("Household groceries").first(), 900);
    await hover(p, main(p).getByRole("button", { name: "Add budget" }), 600); },
  s09b4: async p => { await scrollTo(p, main(p).getByText("New refrigerator").first(), "center"); await hover(p, main(p).getByText("New refrigerator").first(), 700);
    await type(p, main(p).getByLabel("Contribution in rupees").first(), "2000"); await click(p, main(p).getByRole("button", { name: "Contribute" }).first(), 1200); },
  s09b5: async p => { await scrollTo(p, main(p).getByText("What I share").first(), "start"); await hover(p, main(p).getByText("What I share").first(), 500);
    await hover(p, main(p).getByRole("button", { name: "Share" }).first(), 600); await hover(p, main(p).getByText("Make all my shared entries private"), 900);
    await scrollTo(p, main(p).getByText("Activity", { exact: true }).first(), "start"); await hover(p, main(p).getByText("Activity", { exact: true }).first(), 900); },
  s09b6: async p => { await signOut(p); await signIn(p, "raj.demo@example.com", true); },
  s09b7: async p => { await nav(p, "Family"); await hover(p, main(p).getByText("Household groceries").first(), 800);
    await scrollTo(p, main(p).getByText("New refrigerator").first(), "center"); await hover(p, main(p).getByText("New refrigerator").first(), 900);
    await scrollTo(p, main(p).getByText(/Shared spending ·/).first(), "center"); await hover(p, main(p).getByText(/Shared spending ·/).first(), 900); },

  // Scene 10: recurring (Priya)
  s10b1: async p => { await nav(p, "Recurring"); await hover(p, main(p).getByText(/MONTHLY FIXED COMMITMENTS/i).first(), 900);
    for (const n of ["House rent", "Broadband", "Mobile recharge", "Streaming subscription"]) await hover(p, main(p).getByText(n, { exact: true }).first(), 500);
    await hover(p, main(p).getByText(/Next due/).first(), 600); },
  s10b2: async p => { await click(p, main(p).getByRole("button", { name: "Add bill" }), 700); const d = p.getByRole("dialog");
    await type(p, d.getByPlaceholder(/Internet, Rent/i), "Gym membership (demo)"); await type(p, d.locator("input[type=number], input[inputmode=decimal]").first(), "1200");
    await hover(p, d.locator("select").first(), 400); await hover(p, d.locator("input[type=date]").first(), 400);
    await click(p, d.getByRole("button", { name: "Save", exact: true }), 1200); },
  s10b3: async p => { await hover(p, main(p).getByRole("button", { name: "Edit" }).first(), 700);
    await click(p, main(p).getByRole("button", { name: "Pause Streaming subscription" }), 1400);
    await click(p, main(p).getByRole("button", { name: "Resume Streaming subscription" }), 1200);
    await hover(p, main(p).getByRole("button", { name: /Cancel Streaming subscription/ }), 700); },
  s10b4: async p => { await scrollTo(p, main(p).getByText("Remind me about bills").first(), "center"); await hover(p, main(p).getByText("Remind me about bills").first(), 600);
    await hover(p, main(p).getByLabel("Quiet hours start").first(), 600); await hover(p, main(p).getByText(/Email isn't available yet/).first(), 1200); },

  // Scene 11: AI assistant
  s11b1: async p => { await click(p, p.getByRole("button", { name: /AI Assistant/ }).first(), 1200); const c = p.getByRole("dialog", { name: "Bagla AI Assistant" });
    await expect(c.getByTestId("ai-mode")).not.toHaveText("…"); await hover(p, c.getByTestId("ai-mode"), 1500); },
  s11b2: async p => { await ask(p, "Where did I spend the most last month?"); },
  s11b3: async p => { await ask(p, "Am I over any budget?"); },
  s11b4: async p => { await ask(p, "How can I spend less?"); },
  s11b5: async p => { await ask(p, "What is SIP?"); },
  s11b6: async p => { const c = p.getByRole("dialog", { name: "Bagla AI Assistant" }); await hover(p, c.getByText(/never changes your records/i).first(), 1500);
    await click(p, c.getByRole("button", { name: "Close" }).first(), 600); },

  // Scene 12: settings, data (app part)
  s12b1: async p => { await nav(p, "Settings"); await hover(p, main(p).getByText(/Public Stealth Mode/).first(), 600);
    await click(p, main(p).getByRole("button", { name: /Turn ON Stealth Mode/ }), 1500);
    await click(p, main(p).getByRole("button", { name: /Stealth Active/ }).first(), 800);
    await hover(p, main(p).getByText(/App Passcode/).first(), 700); },
  s12b2: async p => { await scrollTo(p, main(p).getByText(/Financial Data Connectors/).first(), "start"); await hover(p, main(p).getByText(/Financial Data Connectors/).first(), 900);
    await hover(p, main(p).getByText(/Not available/).first(), 1200); },
  s12b3: async p => { await nav(p, "Account & Sync"); await hover(p, main(p).getByText("Download my account data").first(), 700);
    await hover(p, main(p).getByRole("button", { name: /Download \(\.json\)/ }), 900); await hover(p, main(p).getByRole("button", { name: /Copy my data now/ }), 900); },
};

async function ask(p: Page, q: string) {
  const c = p.getByRole("dialog", { name: "Bagla AI Assistant" });
  console.log("ask", q);
  const before = await c.locator('[data-testid^="ai-answer-"]').count();
  await type(p, c.getByLabel("Ask a question"), q);
  await click(p, c.getByRole("button", { name: "Send" }), 300);
  await expect(c.locator('[data-testid^="ai-answer-"]')).toHaveCount(before + 1, { timeout: 30000 }).catch(() => misses.push("ai answer " + q));
  await c.locator('[data-testid^="ai-answer-"]').last().scrollIntoViewIfNeeded().catch(() => {});
  await hover(p, c.locator('[data-testid^="ai-answer-"]').last(), 500);
}

test("record investor walkthrough", async ({ page }) => {
  test.setTimeout(2_400_000);
  rmSync(REC, { recursive: true, force: true }); mkdirSync(`${REC}/frames`, { recursive: true });
  await page.addInitScript(CURSOR);
  const consoleErrors: string[] = [];
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", e => consoleErrors.push("PAGEERROR " + e.message.slice(0, 200)));

  await page.goto("/");
  const start = page.getByRole("button", { name: /get started|start|enter/i }).first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.waitForLoadState("networkidle"); await sleep(page, 1500);
  t0 = Date.now();
  await startCapture(page);
  await page.mouse.move(mouse.x, mouse.y);

  const timeline: { scene: string; start: number; end: number; beats: { id: string; start: number; end: number; audio: number }[] }[] = [];
  const appScenes = NARR.scenes.filter((s: any) => s.beats.some((b: any) => !b.slide));
  for (const sc of appScenes) {
    if (ONLY && !ONLY.includes(sc.id)) continue;
    if (sc.id === "s10") { await signOut(page); await signIn(page, "priya.demo@example.com", false); await nav(page, "Dashboard"); }
    if (ONLY && sc.id !== "s03" && !(await page.getByText("Real Ledger").first().isVisible().catch(() => false))) await signIn(page, "priya.demo@example.com", false);
    capturing = true;
    await sleep(page, 400);
    const scene = { scene: sc.id, start: now(), end: 0, beats: [] as any[] };
    await sleep(page, 500); // lead-in
    for (const b of sc.beats.filter((x: any) => !x.slide)) {
      const s = now();
      console.log("beat", b.id);
      await Promise.race([ACTIONS[b.id]?.(page), new Promise(r => setTimeout(() => { misses.push("TIMEOUT beat " + b.id); r(null); }, 60_000))]);
      const remaining = s + DUR[b.id] + GAP - now();
      if (remaining > 0 && !process.env.FAST) await sleep(page, remaining * 1000);
      scene.beats.push({ id: b.id, start: s, end: now(), audio: DUR[b.id] });
    }
    await sleep(page, 700); // tail
    scene.end = now();
    capturing = false;
    timeline.push(scene);
    writeFileSync(`${REC}/timeline.json`, JSON.stringify(timeline, null, 1));
    writeFileSync(`${REC}/frames.json`, JSON.stringify(frames));
    writeFileSync(`${REC}/misses.json`, JSON.stringify(misses, null, 1));
    writeFileSync(`${REC}/console-errors.json`, JSON.stringify(consoleErrors, null, 1));
    console.log(`${sc.id} done ${scene.end - scene.start}s, frames ${frames.length}, misses ${misses.length}`);
  }
  writeFileSync(`${REC}/misses.json`, JSON.stringify(misses, null, 1));
  writeFileSync(`${REC}/console-errors.json`, JSON.stringify(consoleErrors, null, 1));
  writeFileSync(`${REC}/frames.json`, JSON.stringify(frames));
});
