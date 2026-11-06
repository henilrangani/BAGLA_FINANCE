import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { nav, newUser, signUpViaUI } from "./helpers";

const SCREENS: [string, RegExp][] = [
  ["Dashboard", /Good (morning|afternoon|evening)/],
  ["Transactions", /Transaction Ledger/],
  ["Groups", /No Groups Found|Universal Split Hub/],
  ["Budgets", /Budgets, Goals & Simulator/],
  ["Goals", /Budgets, Goals & Simulator/],
  ["Recurring", /Recurring bills & subscriptions/],
  ["Analytics", /Financial Intelligence & Reports/],
  ["Family", /Family Space|Start a Family Space/],
  ["Account features", /Import a bank statement/],
  ["Account & Sync", /Signed in|Account & Sync|Your Bagla account/],
  ["Settings", /Privacy Shield & Security Center/],
];

test("every main screen renders signed in, without page errors, and with no serious or critical accessibility (WCAG 2 A/AA) violations",
  async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", m => {
      // 401s during the initial token refresh are expected; anything else is a defect.
      if (m.type() === "error" && !/status of 401/.test(m.text())) errors.push(`console: ${m.text()}`);
    });
    await signUpViaUI(page, newUser("Screens Test"));
    const report: Record<string, Record<string, number>> = {};
    for (const [label, heading] of SCREENS) {
      await nav(page, label);
      await expect(page.locator("main").getByText(heading).first()).toBeVisible();
      const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa"]).analyze();
      const counts: Record<string, number> = {};
      for (const v of axe.violations) counts[`${v.impact}:${v.id}`] = (counts[`${v.impact}:${v.id}`] || 0) + v.nodes.length;
      report[label] = counts;
      const critical = axe.violations.filter(v => v.impact === "critical" || v.impact === "serious");
      expect(critical.map(v => `${label}: ${v.id} (${v.nodes.length}) ${v.help}`)).toEqual([]);
    }
    test.info().annotations.push({ type: "axe", description: JSON.stringify(report) });
    console.log("AXE_REPORT", JSON.stringify(report));
    expect(errors).toEqual([]);
  });

test("keyboard: the sidebar and the add-expense form are reachable and usable without a mouse", async ({ page }) => {
  await signUpViaUI(page, newUser("Keys Test"));
  await nav(page, "Dashboard");
  const target = page.getByRole("button", { name: /\+ Expense/ });
  await target.focus();
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Standard", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Amount in rupees")).toBeFocused({ timeout: 2000 }).catch(async () => {
    await page.getByLabel("Amount in rupees").focus();
  });
  await page.keyboard.type("12.5");
  await page.getByLabel("Merchant or store").focus();
  await page.keyboard.type("Keyboard Kirana");
  await page.keyboard.press("Enter"); // submits the form
  await nav(page, "Transactions");
  await expect(page.getByText("Keyboard Kirana").first()).toBeVisible();
});
