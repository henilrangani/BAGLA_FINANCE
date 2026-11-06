import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; path: string; body: any }[] = [];
let responses: ((path: string, body: any) => any)[] = [];
vi.mock("./client", () => ({
  api: vi.fn(async (method: string, path: string, body?: any) => {
    calls.push({ method, path, body });
    const r = responses.shift();
    return r ? r(path, body) : {};
  }),
  apiWithStatus: vi.fn(),
  ApiError: class extends Error {},
}));

import { addRemoteExpense, describeVoid, fromServerGroup } from "./groups";
import { migrateGroups, type MigrationReport } from "./sync";

const detail = {
  id: "g1", name: "Goa", description: "", cover_emoji: "🏖️", currency: "INR", budget_paise: 2000000, is_archived: false,
  members: [
    { id: "me", display_name: "Asha", upi_id: null, status: "active", is_me: true },
    { id: "r", display_name: "Ravi", upi_id: "ravi@okaxis", status: "active", is_me: false },
    { id: "x", display_name: "Gone", upi_id: null, status: "removed", is_me: false },
  ],
  expenses: [
    { id: "e1", description: "Dinner", amount_paise: 10001, category: "cat-food", paid_by_member_id: "me",
      expense_date: "2026-11-01", status: "posted",
      shares: [{ member_id: "me", share_paise: 5001 }, { member_id: "r", share_paise: 5000 }] },
    { id: "e2", description: "Void", amount_paise: 500, category: null, paid_by_member_id: "me",
      expense_date: "2026-11-01", status: "void", shares: [] },
  ],
  settlements: [{ id: "s1", from_member_id: "r", to_member_id: "me", amount_paise: 1000, method: "upi",
    status: "recorded", created_at: "2026-11-02T00:00:00Z" }],
  suggested_settlements: [{ from_member_id: "r", to_member_id: "me", amount_paise: 4000 }],
};

describe("fromServerGroup", () => {
  it("maps paise to rupees and hides removed members and void entries", () => {
    const g = fromServerGroup(detail);
    expect(g.members.map(m => m.id)).toEqual(["me", "r"]);
    expect(g.members[0]).toMatchObject({ isCurrentUser: true, name: "Asha" });
    expect(g.members[1].upiId).toBe("ravi@okaxis");
    expect(g.budget).toBe(20000);
    expect(g.expenses).toHaveLength(1);
    expect(g.expenses[0].amount).toBe(100.01);
    expect(g.expenses[0].participants.map(p => p.amountOwed)).toEqual([50.01, 50]);
    expect(g.settlements.map(s => [s.status, s.amount])).toEqual([["marked_paid", 10], ["suggested", 40]]);
  });
});

describe("addRemoteExpense", () => {
  beforeEach(() => { calls.length = 0; responses = []; });
  it("sends exact paise shares when they add up, else an equal split", async () => {
    const base = { description: "Cab", currency: "INR", categoryId: "cat-transport", paidByMemberId: "me",
      date: "2026-11-03", time: "10:00", splitType: "exact" as const };
    await addRemoteExpense("g1", { ...base, amount: 100.01,
      participants: [{ memberId: "me", amountOwed: 50.01 }, { memberId: "r", amountOwed: 50 }] }, "ge:1");
    expect(calls[0].body).toMatchObject({ amount_paise: 10001, split: "exact",
      shares: [{ member_id: "me", share_paise: 5001 }, { member_id: "r", share_paise: 5000 }] });
    await addRemoteExpense("g1", { ...base, amount: 100,
      participants: [{ memberId: "me", amountOwed: 33.33 }, { memberId: "r", amountOwed: 33.33 }] }, "ge:2");
    expect(calls[1].body).toMatchObject({ amount_paise: 10000, split: "equal", participant_ids: ["me", "r"] });
    expect(calls[1].body.shares).toBeUndefined();
  });
});

describe("migrateGroups", () => {
  beforeEach(() => { calls.length = 0; responses = []; });
  const report = (): MigrationReport => ({ at: "", transactions: { eligible: 0, created: 0, alreadyThere: 0, skipped: [] },
    budgets: { created: 0, alreadyThere: 0 }, goals: { created: 0, alreadyThere: 0 },
    groups: { created: 0, alreadyThere: 0 }, bills: { created: 0, alreadyThere: 0 },
    totals: { localIncomePaise: 0, localExpensePaise: 0, serverIncomePaise: 0, serverExpensePaise: 0, match: false },
    errors: [] });
  const local: any = {
    id: "grp-1", name: "Flat", description: "", coverEmoji: "🏠", currency: "INR", createdBy: "m-henil",
    inviteCode: "", createdAt: "",
    members: [{ id: "m-henil", name: "Me (You)", isCurrentUser: true }, { id: "m-1", name: "Ravi", upiId: "bad&am=9" }],
    expenses: [{ id: "ge-1", description: "Rent", amount: 300, paidByMemberId: "m-1", date: "2026-11-01",
      participants: [{ memberId: "m-henil", amountOwed: 150 }, { memberId: "m-1", amountOwed: 150 }] }],
    settlements: [{ id: "set-1", fromMemberId: "m-henil", toMemberId: "m-1", amount: 150, status: "marked_paid",
      paymentMethod: "upi" }, { id: "sg", fromMemberId: "m-henil", toMemberId: "m-1", amount: 1, status: "suggested" }],
  };

  it("maps local member ids to server ids, keeps idempotency keys and drops invalid UPI IDs", async () => {
    responses = [
      () => [],
      () => ({ id: "G", my_member_id: "ME", members: [{ id: "ME", is_me: true }, { id: "R", is_me: false }] }),
      () => ({}), () => ({}),
    ];
    const r = report();
    await migrateGroups([local], r);
    expect(r.groups).toEqual({ created: 1, alreadyThere: 0 });
    expect(calls[1].body.members).toEqual([{ display_name: "Ravi", upi_id: undefined }]);
    expect(calls[2]).toMatchObject({ path: "/api/v1/groups/G/expenses", body: { paid_by_member_id: "R",
      amount_paise: 30000, split: "exact", idempotency_key: "local:ge-1",
      shares: [{ member_id: "ME", share_paise: 15000 }, { member_id: "R", share_paise: 15000 }] } });
    expect(calls[3]).toMatchObject({ path: "/api/v1/groups/G/settlements", body: { from_member_id: "ME",
      to_member_id: "R", amount_paise: 15000, idempotency_key: "local:set-1" } });
    expect(calls).toHaveLength(4); // the suggested settlement is not recorded as a payment
    expect(r.errors).toEqual([]);
  });

  it("skips groups whose name is already in the account instead of duplicating them", async () => {
    responses = [() => [{ name: "flat" }]];
    const r = report();
    await migrateGroups([local], r);
    expect(r.groups).toEqual({ created: 0, alreadyThere: 1 });
    expect(calls).toHaveLength(1);
  });
});

describe("describeVoid", () => {
  const names: Record<string, string> = { a: "Asha", r: "Ravi" };
  const base = { can_void: true, status: "posted", amount_paise: 10000, recorded_settlements: 0, balance_flips: [],
    suggested_after: [], personal_entry: null, blocker: null };
  it("explains payback when recorded payments flip balances", () => {
    const text = describeVoid("Dinner", { ...base, recorded_settlements: 1,
      balance_flips: [{ member_id: "a", before_paise: 3333, after_paise: -3333 }],
      suggested_after: [{ from_member_id: "a", to_member_id: "r", amount_paise: 3333 }],
      personal_entry: "will_void" }, id => names[id]);
    expect(text).toContain("Delete \"Dinner\" (₹100");
    expect(text).toContain("1 payment(s) already recorded");
    expect(text).toContain("Asha will need to pay back Ravi ₹33.33");
    expect(text).toContain("entry in your own transactions will be removed");
  });
  it("explains that only my share leaves my transactions", () => {
    const text = describeVoid("Cab", { ...base, personal_entry: "share_ledger_updates" }, id => names[id]);
    expect(text).toContain("Your share of it will be removed from your own transactions");
  });
  it("stays short when nothing flips", () => {
    const text = describeVoid("Cab", base, id => names[id]);
    expect(text).not.toContain("pay back");
    expect(text.split("\n")).toHaveLength(2);
  });
});

describe("addRemoteExpense personal entry", () => {
  beforeEach(() => { calls.length = 0; responses = []; });
  it("passes my account only when given", async () => {
    const e = { description: "Fuel", currency: "INR", categoryId: "cat-transport", paidByMemberId: "me",
      date: "2026-11-03", time: "10:00", splitType: "equal" as const, amount: 50, participants: [] };
    await addRemoteExpense("g1", e, "ge:3", "acc-bank");
    await addRemoteExpense("g1", e, "ge:4");
    expect(calls[0].body.personal_account_id).toBe("acc-bank");
    expect(calls[1].body.personal_account_id).toBeUndefined();
    expect(calls[1].body.participant_ids).toBeUndefined();
  });
});
