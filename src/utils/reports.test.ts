import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import { buildSpendingReport, periodRange, reportToCsv } from "./reports";

let n = 0;
const tx = (date: string, amount: number, type: Transaction["type"], categoryId = "cat-food", extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${n++}`, userId: "u", amount, type, currency: "INR", merchant: "", description: "", categoryId, date, time: "10:00",
    paymentMethod: "upi", source: "manual", status: "verified", confidence: 1, createdAt: "", updatedAt: "", ...extra } as Transaction);

const cats = [{ id: "cat-food", name: "Food & Dining" }, { id: "cat-rent", name: "Rent & Housing" }] as any;

describe("spending report (integer paise)", () => {
  const txs = [
    tx("2026-11-01", 100.1, "expense"),
    tx("2026-11-01", 0.2, "expense"),                 // 100.10 + 0.20 must be exactly 100.30
    tx("2026-11-03", 15000, "expense", "cat-rent"),
    tx("2026-11-04", 20.1, "refund"),                 // reduces food
    tx("2026-11-04", 5000, "transfer"),               // neither income nor spending
    tx("2026-11-05", 999, "expense", "cat-food", { status: "soft_deleted" }),
    tx("2026-11-05", 999, "expense", "cat-food", { status: "duplicate_flagged" }),
    tx("2026-11-02", 60000, "income", "cat-salary"),
    tx("2026-10-31", 50, "expense"),                  // previous month, outside range
  ];
  const r = buildSpendingReport({ transactions: txs, categories: cats, budgets: [{ name: "Food", amount: 50, spent: 80.2 } as any],
    today: "2026-11-05", from: "2026-11-01", to: "2026-11-05" });

  it("totals and category breakdown", () => {
    expect(r.totalSpendPaise).toBe(10030 + 1500000 - 2010);
    expect(r.totalIncomePaise).toBe(6000000);
    expect(r.byCategory.map(c => [c.name, c.paise])).toEqual([["Rent & Housing", 1500000], ["Food & Dining", 8020]]);
    expect(r.entryCount).toBe(5); // 2 food, 1 rent, 1 refund, 1 income
  });

  it("daily series is zero-filled and uses local dates (no time-zone shift)", () => {
    expect(r.daily.map(d => d.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(r.daily.map(d => d.paise)).toEqual([10030, 0, 1500000, -2010, 0]);
  });

  it("monthly series covers the last 6 months", () => {
    expect(r.monthly.map(m => m.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(r.monthly[4]).toEqual({ month: "2026-10", incomePaise: 0, spendPaise: 5000 });
    expect(r.monthly[5].incomePaise).toBe(6000000);
  });

  it("budget vs actual in paise", () => {
    expect(r.budgets).toEqual([{ name: "Food", limitPaise: 5000, spentPaise: 8020 }]);
  });

  it("CSV export is exact and spreadsheet-safe", () => {
    const csv = reportToCsv({ ...r, byCategory: [...r.byCategory, { categoryId: "x", name: "=HYPERLINK(1)", paise: 1, count: 1 }] }, "2026-11-01", "2026-11-05");
    expect(csv).toContain('"Rent & Housing","1","15000.00"');
    expect(csv).toContain('"Total","5","15080.20"');
    expect(csv).toContain(`"'=HYPERLINK(1)"`); // formula neutralised
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);
  });

  it("empty data gives zeros, not invented numbers", () => {
    const e = buildSpendingReport({ transactions: [], categories: cats, budgets: [], today: "2026-11-05", from: "2026-11-01", to: "2026-11-05" });
    expect([e.totalSpendPaise, e.totalIncomePaise, e.byCategory.length]).toEqual([0, 0, 0]);
  });

  it("named periods", () => {
    expect(periodRange("7d", "2026-11-05")).toEqual({ from: "2026-10-30", to: "2026-11-05" });
    expect(periodRange("month", "2026-11-05")).toEqual({ from: "2026-11-01", to: "2026-11-05" });
    expect(periodRange("lastmonth", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
