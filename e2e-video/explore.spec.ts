/** Feature discovery for the investor video: visits every navigation item and records what is on screen. Local demo only. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const OUT = "D:/BAGLA_FINANCE_WORKSPACE/investor-demo/video/explore";
const PASSWORD = readFileSync("D:/BAGLA_FINANCE_WORKSPACE/investor-demo/.demo.env", "utf8")
  .split(/\r?\n/).find(l => l.startsWith("DEMO_PASSWORD="))!.slice("DEMO_PASSWORD=".length).trim();
const NAV = ["Dashboard", "Transactions", "Groups", "Budgets", "Goals", "Recurring", "Analytics", "Family",
  "Account features", "Account & Sync", "Settings"];

async function nav(page: Page, label: string) {
  await page.locator("aside, nav").getByText(label, { exact: true }).first().click();
}

async function dump(page: Page, name: string) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const info = await page.evaluate(() => {
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = (sel: string) => [...document.querySelectorAll(sel)].filter(vis)
      .map(e => ((e as HTMLElement).innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 80))
      .filter(Boolean);
    return { headings: txt("h1,h2,h3,h4"), buttons: [...new Set(txt("button,[role=tab],[role=radio],a"))],
      inputs: txt("input,select,textarea").concat([...document.querySelectorAll("input,select,textarea")].filter(vis)
        .map(e => e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.getAttribute("name") || "")) };
  });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(info, null, 1));
}

test("explore", async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/");
  await dump(page, "00-landing");
  const start = page.getByRole("button", { name: /get started|start|enter/i }).first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await nav(page, "Account & Sync");
  const already = page.getByRole("button", { name: /already have an account/i });
  if (await already.isVisible().catch(() => false)) await already.click();
  await dump(page, "00-signin");
  await page.getByLabel("Email").fill("priya.demo@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  const errors: string[] = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  for (const [i, label] of NAV.entries()) {
    await nav(page, label);
    await dump(page, `${String(i + 1).padStart(2, "0")}-${label.replace(/[^A-Za-z]+/g, "_")}`);
  }
  writeFileSync(`${OUT}/console-errors.json`, JSON.stringify(errors, null, 1));
});
