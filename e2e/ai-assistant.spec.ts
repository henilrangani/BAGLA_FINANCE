import { expect, test, type Page } from "@playwright/test";
import { nav, openApp } from "./helpers";

/**
 * The AI assistant's honest states. No real AI provider is called in these tests:
 * - "not set up" is the real state of the test server (no GEMINI_API_KEY);
 * - the "set up" cases replace /api/ai/* with test responses (page.route) to check the UI's behaviour
 *   (labels, Stop, Retry, navigation-only suggestions). They do not verify a live Gemini integration.
 */

async function addExpense(page: Page, amount: string, merchant: string) {
  await nav(page, "Dashboard");
  await page.getByText("+ Expense", { exact: true }).click();
  const d = page.getByRole("dialog", { name: "Record Transaction" });
  await d.getByRole("button", { name: "Standard", exact: true }).click();
  await d.getByLabel("Amount in rupees").fill(amount);
  await d.getByLabel("Merchant or store").fill(merchant);
  await d.getByRole("button", { name: /Save Expense/ }).click();
  await expect(d).toBeHidden();
}

const openAssistant = async (page: Page) => {
  await page.getByRole("button", { name: /AI Assistant/ }).first().click();
  return page.getByRole("dialog", { name: "Bagla AI Assistant" });
};

test("without an AI provider: says so, and answers from recorded entries only", async ({ page }) => {
  await openApp(page);
  let chat = await openAssistant(page);
  await expect(chat.getByTestId("ai-mode")).toHaveText("Built-in rules");
  await expect(chat.getByTestId("ai-banner")).toContainText("AI isn't set up on this server");

  // The food total before and after two new entries differs by exactly what was entered.
  const foodTotal = async (): Promise<number> => {
    await chat.getByLabel("Ask a question").fill("How much did I spend on food this month?");
    await chat.getByRole("button", { name: "Send" }).click();
    const a = chat.getByTestId("ai-answer-rules").last();
    await expect(a).toContainText("From your records (no AI)");
    await expect(a).toContainText("Transfers and deleted entries are excluded");
    const text = await a.innerText();
    if (/No Food & Dining spending recorded/.test(text)) return 0;
    const m = /spent ₹([\d,]+(?:\.\d{2})?) on Food/.exec(text);
    expect(m, text).not.toBeNull();
    return Math.round(Number(m![1].replace(/,/g, "")) * 100);
  };
  const before = await foodTotal();
  await page.keyboard.press("Escape");
  await addExpense(page, "250.50", "Chai Point");
  await addExpense(page, "120.25", "Chai Point");
  chat = await openAssistant(page);
  expect(await foodTotal()).toBe(before + 37075);

  await chat.getByLabel("Ask a question").fill("Should I buy gold?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByTestId("ai-answer-rules").last()).toContainText("only answer a few kinds of questions");
});

test("with a (test) AI provider: labelled, cancellable, retryable, and suggestions only navigate", async ({ page }) => {
  let mode: "slow" | "error" | "ok" = "slow";
  await page.route("**/api/ai/status", r => r.fulfill({ json: { configured: true, provider: "Google Gemini", model: "test-model" } }));
  await page.route("**/api/ai/chat", async r => {
    if (mode === "slow") { await new Promise(res => setTimeout(res, 4000)); return r.fulfill({ json: { reply: "late", aiAvailable: true } }).catch(() => {}); }
    if (mode === "error") return r.fulfill({ status: 500, body: "boom" });
    return r.fulfill({ json: { aiAvailable: true, reply: "Food is your biggest category.",
      suggestedActions: [{ id: "a", label: "See food entries", actionType: "filter_category", payload: { category: "Food" } }] } });
  });
  await openApp(page);
  const chat = await openAssistant(page);
  await expect(chat.getByTestId("ai-mode")).toHaveText("AI");
  await expect(chat.getByTestId("ai-banner")).toContainText("can be wrong");

  await chat.getByLabel("Ask a question").fill("Where does my money go?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByText("Waiting for the AI service")).toBeVisible();
  await chat.getByRole("button", { name: "Stop" }).click();
  await expect(chat.getByTestId("ai-answer-error").last()).toContainText("Stopped. Nothing was changed.");

  mode = "error";
  await chat.getByRole("button", { name: "Try again" }).last().click();
  await expect(chat.getByTestId("ai-answer-error").last()).toContainText("HTTP 500");

  mode = "ok";
  await chat.getByRole("button", { name: "Try again" }).last().click();
  const ai = chat.getByTestId("ai-answer-ai").last();
  await expect(ai).toContainText("AI answer");
  await expect(ai).toContainText("Food is your biggest category.");
  await expect(ai).toContainText("It can be wrong");
  await ai.getByRole("button", { name: "See food entries" }).click();
  await expect(chat).toBeHidden();
  await expect(page.getByText(/Transaction Ledger/).first()).toBeVisible(); // it only navigated
});
