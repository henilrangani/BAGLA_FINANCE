import { describe, expect, it } from "vitest";
import type { Group, GroupExpense, Settlement } from "../types";
import { computeGroupNetPaise, detectDuplicateTransaction, optimizeSettlements, recomputeSettlements } from "./data";

const members = ["a", "b", "c"].map(id => ({ id, name: id.toUpperCase() })) as Group["members"];

function exp(p: Partial<GroupExpense>): GroupExpense {
  return {
    id: Math.random().toString(36),
    groupId: "g",
    description: "x",
    amount: 100,
    currency: "INR",
    categoryId: "cat-food",
    paidByMemberId: "a",
    splitType: "equal",
    participants: [],
    date: "2026-11-04",
    time: "12:00",
    createdAt: "",
    ...p,
  } as GroupExpense;
}

function group(expenses: GroupExpense[], settlements: Settlement[] = []): Group {
  return { id: "g", name: "Trip", members, expenses, settlements, currency: "INR" } as unknown as Group;
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe("computeGroupNetPaise", () => {
  it("balances to exactly zero for ₹100 split three ways", () => {
    const net = computeGroupNetPaise(group([exp({ amount: 100 })]));
    expect(sum(net)).toBe(0);
    expect(net.a).toBe(6666); // paid 10000, owes 3334
    expect(net.b + net.c).toBe(-6666);
  });

  it("repairs legacy shares that were rounded to whole rupees", () => {
    // Old code stored 33 each for ₹100 → ₹1 vanished.
    const legacy = exp({ amount: 100, participants: members.map(m => ({ memberId: m.id, amountOwed: 33 })) });
    expect(sum(computeGroupNetPaise(group([legacy])))).toBe(0);
  });

  it("stays exact over many awkward expenses", () => {
    const expenses = Array.from({ length: 50 }, (_, i) =>
      exp({ amount: 10.01 + i * 0.37, paidByMemberId: members[i % 3].id })
    );
    expect(sum(computeGroupNetPaise(group(expenses)))).toBe(0);
  });

  it("accounts for settlements already paid", () => {
    const paid: Settlement = { id: "s1", groupId: "g", fromMemberId: "b", toMemberId: "a", amount: 33.33, currency: "INR", status: "marked_paid" } as Settlement;
    const net = computeGroupNetPaise(group([exp({ amount: 100 })], [paid]));
    expect(net.b).toBe(0);
    expect(sum(net)).toBe(0);
  });
});

describe("optimizeSettlements / recomputeSettlements", () => {
  it("suggested transfers clear every balance to the paisa", () => {
    const g = group([exp({ amount: 100 }), exp({ amount: 45.5, paidByMemberId: "b" })]);
    const transfers = optimizeSettlements(g);
    const net = computeGroupNetPaise(g);
    for (const t of transfers) {
      net[t.fromMemberId] += Math.round(t.amount * 100);
      net[t.toMemberId] -= Math.round(t.amount * 100);
    }
    expect(Object.values(net).every(v => v === 0)).toBe(true);
  });

  it("keeps paid history and does not re-create a paid debt", () => {
    const g0 = group([exp({ amount: 100 })]);
    const first = recomputeSettlements(g0);
    const paidOne = first.map((s, i) => (i === 0 ? { ...s, status: "marked_paid" as const } : s));
    const after = recomputeSettlements({ ...g0, settlements: paidOne });
    expect(after.filter(s => s.status === "marked_paid")).toHaveLength(1);
    expect(after.filter(s => s.status === "suggested")).toHaveLength(1);
    // ids stay unique
    expect(new Set(after.map(s => s.id)).size).toBe(after.length);
  });
});

describe("detectDuplicateTransaction", () => {
  const existing = [{ id: "1", amount: 250, type: "expense", merchant: "Swiggy", description: "", date: "2026-11-04", status: "verified" }] as any;

  it("matches same paisa amount, ±1 day, similar merchant", () => {
    expect(detectDuplicateTransaction({ amount: 250, type: "expense", merchant: "swiggy", date: "2026-11-05" }, existing).isDuplicate).toBe(true);
  });

  it("does not match different amounts, far dates or different types", () => {
    expect(detectDuplicateTransaction({ amount: 250.01, type: "expense", merchant: "Swiggy", date: "2026-11-04" }, existing).isDuplicate).toBe(false);
    expect(detectDuplicateTransaction({ amount: 250, type: "expense", merchant: "Swiggy", date: "2026-11-07" }, existing).isDuplicate).toBe(false);
    expect(detectDuplicateTransaction({ amount: 250, type: "refund", merchant: "Swiggy", date: "2026-11-04" }, existing).isDuplicate).toBe(false);
  });
});
