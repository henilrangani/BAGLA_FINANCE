/**
 * Server-backed group splitting for account mode. Maps the API's paise-based
 * group detail to the app's local Group shape so the existing Groups screen
 * works unchanged, and wraps the write endpoints.
 */
import type { Group, GroupExpense } from "../types";
import { api } from "./client";
import { toCategoryId } from "./mappers";
import { fromPaise, safeRupees, toPaise } from "../utils/money";

export function fromServerGroup(d: any): Group {
  const members = d.members.filter((m: any) => m.status === "active").map((m: any) => ({
    id: m.id,
    name: m.display_name,
    isCurrentUser: m.is_me,
    upiId: m.upi_id || undefined,
  }));
  const expenses: GroupExpense[] = d.expenses.filter((e: any) => e.status === "posted").map((e: any) => ({
    id: e.id,
    groupId: d.id,
    description: e.description,
    amount: fromPaise(e.amount_paise),
    currency: d.currency,
    categoryId: toCategoryId(e.category),
    paidByMemberId: e.paid_by_member_id,
    splitType: "exact",
    participants: e.shares.map((s: any) => ({ memberId: s.member_id, amountOwed: fromPaise(s.share_paise) })),
    date: e.expense_date,
    time: "12:00",
    createdAt: e.expense_date,
  })) as GroupExpense[];
  const paid = d.settlements.filter((s: any) => s.status === "recorded").map((s: any) => ({
    id: s.id, groupId: d.id, fromMemberId: s.from_member_id, toMemberId: s.to_member_id,
    amount: fromPaise(s.amount_paise), currency: d.currency, status: "marked_paid" as const,
    settledAt: s.created_at, paymentMethod: s.method,
  }));
  const suggested = d.suggested_settlements.map((s: any, i: number) => ({
    id: `sugg-${d.id}-${i}`, groupId: d.id, fromMemberId: s.from_member_id, toMemberId: s.to_member_id,
    amount: fromPaise(s.amount_paise), currency: d.currency, status: "suggested" as const,
  }));
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    coverEmoji: d.cover_emoji,
    budget: d.budget_paise != null ? fromPaise(d.budget_paise) : undefined,
    currency: d.currency,
    createdBy: "",
    members,
    expenses,
    settlements: [...paid, ...suggested],
    inviteCode: "",
    createdAt: "",
    archived: d.is_archived,
  } as Group;
}

export async function pullGroups(): Promise<Group[]> {
  const list = await api<any[]>("GET", "/api/v1/groups");
  const details = await Promise.all(list.filter(g => !g.is_archived).map(g => api<any>("GET", `/api/v1/groups/${g.id}`)));
  return details.map(fromServerGroup);
}

export async function createRemoteGroup(name: string, description: string, emoji: string, budgetRupees: number | undefined,
  members: { name: string; upiId?: string }[]): Promise<string> {
  const g = await api<any>("POST", "/api/v1/groups", {
    name: name.slice(0, 120), description: (description || "").slice(0, 500), cover_emoji: emoji || "👥",
    budget_paise: budgetRupees && budgetRupees > 0 ? toPaise(budgetRupees) : undefined,
    members: members.map(m => ({ display_name: m.name.slice(0, 120), upi_id: m.upiId || undefined })),
  });
  return g.id;
}

/** Exact shares when the app supplies them (they already sum to the amount), else an equal split. */
export async function addRemoteExpense(groupId: string, e: Omit<GroupExpense, "id" | "groupId" | "createdAt">,
  idempotencyKey: string): Promise<void> {
  const amountPaise = toPaise(Math.abs(safeRupees(e.amount)));
  const shares = (e.participants || []).map(p => ({ member_id: p.memberId, share_paise: toPaise(safeRupees(p.amountOwed)) }));
  const exact = shares.length > 0 && shares.reduce((s, x) => s + x.share_paise, 0) === amountPaise;
  await api("POST", `/api/v1/groups/${groupId}/expenses`, {
    description: e.description.slice(0, 300), amount_paise: amountPaise, paid_by_member_id: e.paidByMemberId,
    category: e.categoryId, expense_date: e.date, idempotency_key: idempotencyKey,
    ...(exact ? { split: "exact", shares } : { split: "equal", participant_ids: shares.length ? shares.map(s => s.member_id) : undefined }),
  });
}

export const voidRemoteExpense = (groupId: string, expenseId: string) =>
  api("DELETE", `/api/v1/groups/${groupId}/expenses/${expenseId}`);

export const recordRemoteSettlement = (groupId: string, from: string, to: string, amountRupees: number,
  method: string, idempotencyKey: string) =>
  api("POST", `/api/v1/groups/${groupId}/settlements`, {
    from_member_id: from, to_member_id: to, amount_paise: toPaise(Math.abs(safeRupees(amountRupees))),
    method: ["upi", "cash", "bank_transfer"].includes(method) ? method : "other", idempotency_key: idempotencyKey,
  });

export const archiveRemoteGroup = (groupId: string) =>
  api("PATCH", `/api/v1/groups/${groupId}`, { is_archived: true });
