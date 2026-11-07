import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import {
  fromServerBudget,
  fromServerGoal,
  fromServerTx,
  toServerBudget,
  toServerCreate,
  toServerGoal,
  toCategoryId,
  toServerUpdate,
  type ServerTx,
} from "./mappers";

const local = (p: Partial<Transaction> = {}): Transaction => ({
  id: "tx-1", userId: "u", amount: 1250.5, type: "expense", currency: "INR", merchant: "Swiggy",
  description: "Dinner", categoryId: "cat-food", date: "2026-11-04", time: "21:30", paymentMethod: "upi",
  source: "voice", status: "verified", confidence: 1, createdAt: "", updatedAt: "", ...p,
});

const refs = { cashId: "acc-cash", bankId: "acc-bank" };

describe("toServerCreate", () => {
  it("converts rupees to integer paise and picks the account from the payment method", () => {
    const r = toServerCreate(local(), refs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toMatchObject({ account_id: "acc-bank", amount_paise: 125050, kind: "expense", source: "voice",
      category: "cat-food", needs_review: false });
    expect(new Date(r.body.occurred_at as string).getHours()).toBe(21);
    const cash = toServerCreate(local({ paymentMethod: "cash", source: "imported" }), refs);
    expect(cash.ok && cash.body.account_id).toBe("acc-cash");
    expect(cash.ok && cash.body.source).toBe("manual"); // server only accepts client sources
  });

  it("never sends float noise and flags entries needing review", () => {
    const r = toServerCreate(local({ amount: 0.1 + 0.2, status: "duplicate_flagged" }), refs);
    expect(r.ok && r.body.amount_paise).toBe(30);
    expect(r.ok && r.body.needs_review).toBe(true);
  });

  it("refuses zero amounts and unsupported kinds instead of guessing", () => {
    expect(toServerCreate(local({ amount: 0 }), refs).ok).toBe(false);
    expect(toServerCreate(local({ type: "transfer" }), refs).ok).toBe(false);
  });
});

describe("toServerUpdate", () => {
  it("only sends changed fields, in paise", () => {
    expect(toServerUpdate({ amount: 99.99 }, local())).toEqual({ amount_paise: 9999 });
    expect(Object.keys(toServerUpdate({ time: "08:00" }, local()))).toEqual(["occurred_at"]);
  });
});

describe("fromServerTx", () => {
  const s = (p: Partial<ServerTx> = {}): ServerTx => ({
    id: "s1", account_id: "acc-cash", amount_paise: 4999, currency: "INR", direction: "debit", kind: "expense",
    status: "posted", description: "Chai", merchant: null, category: "cat-food", notes: null,
    occurred_at: "2026-11-04T10:00:00Z", local_date: "2026-11-04", source: "manual", needs_review: false,
    reverses_id: null, refund_of_id: null, created_at: "c", updated_at: "u", ...p,
  });
  const accounts = { "acc-cash": { id: "acc-cash", account_type: "cash" } as any };

  it("maps paise back to exact rupees and the account to a payment method", () => {
    const t = fromServerTx(s(), accounts, new Set());
    expect(t).toMatchObject({ amount: 49.99, type: "expense", paymentMethod: "cash", status: "verified", merchant: "Chai" });
  });

  it("keeps transfers, savings, voids and reversed pairs out of income/expense", () => {
    expect(fromServerTx(s({ kind: "transfer" }), accounts, new Set()).type).toBe("transfer");
    expect(fromServerTx(s({ kind: "savings_contribution" }), accounts, new Set()).type).toBe("transfer");
    expect(fromServerTx(s({ status: "void" }), accounts, new Set()).status).toBe("soft_deleted");
    expect(fromServerTx(s(), accounts, new Set(["s1"])).type).toBe("transfer");
    expect(fromServerTx(s({ kind: "reversal", direction: "credit" }), accounts, new Set()).type).toBe("transfer");
    expect(fromServerTx(s({ needs_review: true }), accounts, new Set()).status).toBe("pending_review");
    expect(fromServerTx(s({ kind: "refund", refund_of_id: "x" }), accounts, new Set())).toMatchObject({
      type: "refund", refundOfId: "x" });
  });
});

describe("toCategoryId", () => {
  it("maps import category names to app ids and keeps ids as-is", () => {
    expect(toCategoryId("Food")).toBe("cat-food");
    expect(toCategoryId("Salary")).toBe("cat-income-salary");
    expect(toCategoryId("cat-groceries")).toBe("cat-groceries");
    expect(toCategoryId("Crypto")).toBe("cat-other");
    expect(toCategoryId(null)).toBe("cat-other");
  });
});

describe("budgets and goals", () => {
  it("round-trips budgets in paise", () => {
    const body = toServerBudget({ name: "Food", type: "category", categoryId: "cat-food", amount: 8000.5,
      period: "monthly", alertThreshold: 0.8, startDate: "2026-11-01" });
    expect(body).toMatchObject({ amount_paise: 800050, alert_threshold_pct: 80, category: "cat-food" });
    const b = fromServerBudget({ id: "b", name: "Food", category: "cat-food", period: "monthly", amount_paise: 800050,
      alert_threshold_pct: 80, start_date: "2026-11-01", end_date: null, spent_paise: 12345 });
    expect(b).toMatchObject({ amount: 8000.5, spent: 123.45, alertThreshold: 0.8, type: "category" });
  });

  it("maps a category NAME from the server to the app's category id (budgets created via the API)", async () => {
    const { withDerivedSpent } = await import("../utils/ledger");
    const b = fromServerBudget({ id: "b", name: "Groceries", category: "Groceries", period: "monthly", amount_paise: 900000,
      alert_threshold_pct: 80, start_date: "2026-11-01", end_date: null, spent_paise: 0 });
    expect(b.categoryId).toBe("cat-groceries");
    const tx: any = { id: "t", amount: 120.5, type: "expense", categoryId: "cat-groceries", date: "2026-11-05", status: "verified" };
    expect(withDerivedSpent([b], [tx], "2026-11-07")[0].spent).toBe(120.5); // was 0: "Groceries" never matched "cat-groceries"
  });

  it("accepts both goal field spellings", () => {
    expect(toServerGoal({ title: "Trip", targetAmount: 50000, targetDate: "2027-01-01" })).toEqual({
      name: "Trip", target_paise: 5000000, deadline: "2027-01-01" });
    expect(toServerGoal({ name: "Laptop", targetAmount: 1, deadline: "soon" }).deadline).toBeNull();
    const g: any = fromServerGoal({ id: "g", name: "Trip", target_paise: 5000000, deadline: null, saved_paise: 125 });
    expect(g.title).toBe("Trip");
    expect(g.name).toBe("Trip");
    expect(g.currentAmount).toBe(1.25);
  });
});
