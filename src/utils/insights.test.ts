import { describe, expect, it } from "vitest";
import type { Budget, Category, Transaction } from "../types";
import { answerFromRecords, inr, rangeFor } from "./insights";

const cats: Category[] = [
  { id: "cat-food", name: "Food & Dining" }, { id: "cat-transport", name: "Transport" },
  { id: "cat-rent", name: "Rent" }, { id: "cat-salary", name: "Salary" },
] as any;

let n = 0;
const tx = (date: string, amount: number, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, userId: "u", amount, type: "expense", currency: "INR", merchant: "", description: "", categoryId, date,
  time: "12:00", paymentMethod: "upi", source: "manual", status: "verified", confidence: 1, createdAt: "", updatedAt: "", ...extra,
} as Transaction);

const today = "2026-11-06"; // a Friday
const data = {
  today, categories: cats, budgets: [] as Budget[],
  transactions: [
    tx("2026-11-01", 250.5, "cat-food", { merchant: "Chai Point" }),   // Sunday
    tx("2026-11-02", 120.25, "cat-food", { merchant: "Chai Point" }),  // Monday
    tx("2026-11-03", 80, "cat-transport"),
    tx("2026-11-04", 15000, "cat-rent"),
    tx("2026-11-05", 999.99, "cat-food", { status: "soft_deleted" }),  // excluded
    tx("2026-11-05", 5000, "cat-food", { type: "transfer" }),          // excluded
    tx("2026-10-15", 400, "cat-food"),
    tx("2026-11-01", 60000, "cat-salary", { type: "income" }),
  ],
};

describe("built-in answers (no AI)", () => {
  it("formats exact paise in Indian grouping", () => {
    expect(inr(1_500_050)).toBe("₹15,000.50");
    expect(inr(100)).toBe("₹1");
  });

  it("parses date ranges", () => {
    expect(rangeFor("food last month", today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(rangeFor("spending", today)).toMatchObject({ from: "2026-11-01", to: today, label: "this month" });
    expect(rangeFor("last 7 days", today)).toMatchObject({ from: "2026-10-31", to: today });
    expect(rangeFor("in october", today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(rangeFor("this week", today)).toMatchObject({ from: "2026-11-02" });
  });

  it("category total for a range, excluding transfers and deleted entries", () => {
    const a = answerFromRecords("How much did I spend on food this month?", data);
    expect(a.answered).toBe(true);
    expect(a.answer).toContain("₹370.75");   // 250.50 + 120.25
    expect(a.answer).toContain("2 entries");
    expect(a.basis).toMatch(/Transfers and deleted entries are excluded/);
    expect(answerFromRecords("food spending last month", data).answer).toContain("₹400");
  });

  it("top categories and total", () => {
    const a = answerFromRecords("Where did I spend the most this month?", data);
    expect(a.answer).toContain("₹15,450.75");
    expect(a.answer.indexOf("Rent")).toBeLessThan(a.answer.indexOf("Food"));
  });

  it("budget differences", () => {
    const budgets = [{ id: "b", name: "Food", amount: 300, spent: 370.75 }, { id: "c", name: "Travel", amount: 1000, spent: 80 }] as Budget[];
    const a = answerFromRecords("Am I over budget?", { ...data, budgets });
    expect(a.answer).toContain("1 of your 2 budgets is over");
    expect(a.answer).toContain("₹70.75 over");
    expect(a.answer).toContain("₹920 left");
    expect(answerFromRecords("budget?", data).answered).toBe(false);
  });

  it("patterns and saving suggestions come only from recorded data", () => {
    const p = answerFromRecords("what are my spending patterns", data);
    expect(p.answer).toContain("Chai Point (2×)");
    const s = answerFromRecords("how can I reduce my expenses", data);
    expect(s.answer).toContain("Food & Dining");
    expect(s.answer).toContain("not financial advice");
  });

  it("income and savings", () => {
    expect(answerFromRecords("income this month", data).answer).toContain("You kept ₹44,549.25");
  });

  it("explains terms and admits what it can't answer", () => {
    expect(answerFromRecords("What is an EMI?", data).answer).toMatch(/Equated Monthly Instalment/);
    const u = answerFromRecords("Should I buy Tesla shares?", data);
    expect(u.answered).toBe(false);
    expect(u.answer).toMatch(/only answer a few kinds/);
  });

  it("says so when there is no data, never inventing numbers", () => {
    const a = answerFromRecords("where did I spend the most", { ...data, transactions: [] });
    expect(a.answered).toBe(false);
    expect(a.answer).toMatch(/don't see any recorded spending/);
    expect(a.answer).not.toMatch(/₹\d/);
  });
});
