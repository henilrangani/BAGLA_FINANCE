import { describe, expect, it } from "vitest";
import type { Budget, CashWallet, Transaction } from "../types";
import {
  applyCashEffect,
  computeBudgetSpent,
  isInPeriod,
  netSpend,
  normalizeTransactions,
  spendByCategory,
  totalIncome,
} from "./ledger";

let n = 0;
function tx(p: Partial<Transaction>): Transaction {
  return {
    id: `t${n++}`,
    userId: "u",
    amount: 100,
    type: "expense",
    currency: "INR",
    merchant: "m",
    description: "d",
    categoryId: "cat-food",
    date: "2026-11-04",
    time: "12:00",
    paymentMethod: "upi",
    source: "manual",
    status: "verified",
    confidence: 1,
    createdAt: "",
    updatedAt: "",
    ...p,
  };
}

function budget(p: Partial<Budget>): Budget {
  return {
    id: "b",
    name: "B",
    type: "category",
    amount: 1000,
    spent: 0,
    period: "monthly",
    alertThreshold: 0.8,
    startDate: "2026-01-01",
    ...p,
  };
}

describe("totals", () => {
  const txs = [
    tx({ amount: 0.1 }),
    tx({ amount: 0.2 }),
    tx({ amount: 50, type: "refund" }),
    tx({ amount: 1000, type: "income" }),
    tx({ amount: 5000, type: "transfer" }),
    tx({ amount: 999, status: "duplicate_flagged" }),
    tx({ amount: 999, status: "soft_deleted" }),
    tx({ amount: 200 }),
  ];

  it("excludes transfers, duplicates and deleted items; refunds reduce spend", () => {
    expect(netSpend(txs)).toBe(150.3);
    expect(totalIncome(txs)).toBe(1000);
  });

  it("groups by category", () => {
    expect(spendByCategory([tx({ amount: 10 }), tx({ amount: 5, categoryId: "cat-x" }), tx({ amount: 3, type: "refund" })])).toEqual({
      "cat-food": 7,
      "cat-x": 5,
    });
  });
});

describe("isInPeriod", () => {
  it("uses Monday-start weeks", () => {
    // 2026-11-04 is a Wednesday; week is 2026-11-02 .. 2026-11-08
    expect(isInPeriod("2026-11-02", "weekly", "2026-11-04")).toBe(true);
    expect(isInPeriod("2026-11-08", "weekly", "2026-11-04")).toBe(true);
    expect(isInPeriod("2026-11-01", "weekly", "2026-11-04")).toBe(false);
    expect(isInPeriod("2026-11-30", "monthly", "2026-11-04")).toBe(true);
    expect(isInPeriod("2026-10-31", "monthly", "2026-11-04")).toBe(false);
    expect(isInPeriod("2026-11-03", "daily", "2026-11-04")).toBe(false);
  });
});

describe("computeBudgetSpent", () => {
  const txs = [
    tx({ amount: 300, categoryId: "cat-food" }),
    tx({ amount: 200, categoryId: "cat-transport" }),
    tx({ amount: 50, categoryId: "cat-food", type: "refund" }),
    tx({ amount: 400, categoryId: "cat-food", date: "2026-10-30" }),
    tx({ amount: 700, categoryId: "cat-food", type: "transfer" }),
  ];

  it("only counts the budget's own category (no cross-budget double counting)", () => {
    expect(computeBudgetSpent(budget({ categoryId: "cat-food" }), txs, "2026-11-04")).toBe(250);
    expect(computeBudgetSpent(budget({ categoryId: "cat-transport" }), txs, "2026-11-04")).toBe(200);
  });

  it("an overall monthly budget counts all categories once", () => {
    expect(computeBudgetSpent(budget({ type: "monthly", categoryId: undefined }), txs, "2026-11-04")).toBe(450);
  });

  it("is recomputed from data, so deleting a transaction lowers spent", () => {
    const b = budget({ categoryId: "cat-food" });
    expect(computeBudgetSpent(b, txs.slice(1), "2026-11-04")).toBe(0);
  });
});

describe("applyCashEffect", () => {
  const wallet: CashWallet = { openingBalance: 100, cashReceived: 0, cashSpent: 0, currentBalance: 100, lastAdjustedDate: "" };

  it("applies and reverses exactly", () => {
    const t = tx({ amount: 150.55, paymentMethod: "cash" });
    const after = applyCashEffect(wallet, t, 1, "2026-11-04");
    expect(after.currentBalance).toBe(-50.55); // negative is shown, not clamped
    expect(after.cashSpent).toBe(150.55);
    const back = applyCashEffect(after, t, -1, "2026-11-04");
    expect(back.currentBalance).toBe(100);
    expect(back.cashSpent).toBe(0);
  });

  it("ignores non-cash and duplicate transactions", () => {
    expect(applyCashEffect(wallet, tx({ paymentMethod: "upi" }), 1, "x")).toBe(wallet);
    expect(applyCashEffect(wallet, tx({ paymentMethod: "cash", status: "duplicate_flagged" }), 1, "x")).toBe(wallet);
  });
});

describe("normalizeTransactions", () => {
  it("repairs legacy float and junk amounts", () => {
    const out = normalizeTransactions([{ amount: 30.300000000000004 }, { amount: "12.5" }, { amount: null }, null, { amount: -40 }]);
    expect(out.map(t => t.amount)).toEqual([30.3, 12.5, 0, 40]);
    expect(normalizeTransactions("garbage")).toEqual([]);
  });
});
