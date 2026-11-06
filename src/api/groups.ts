/**
 * Server-backed group splitting for account mode. Maps the API's paise-based
 * group detail to the app's local Group shape so the existing Groups screen
 * works unchanged, and wraps the write endpoints.
 */
import type { Group, GroupExpense } from "../types";
import { ApiError, api } from "./client";
import { toCategoryId } from "./mappers";
import { formatINR, fromPaise, safeRupees, toPaise } from "../utils/money";

export function fromServerGroup(d: any): Group {
  const toMember = (m: any) => ({
    id: m.id,
    name: m.display_name,
    isCurrentUser: m.is_me,
    upiId: m.upi_id || undefined,
    role: m.role,
    linked: !!m.linked,
  });
  const members = d.members.filter((m: any) => m.status === "active").map(toMember);
  const formerMembers = d.members.filter((m: any) => m.status !== "active").map(toMember);
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
    myRole: d.my_role,
    formerMembers,
    myLedger: d.my_ledger?.linked
      ? { linked: true, inSync: !!d.my_ledger.in_sync, balance: fromPaise(d.my_ledger.balance_paise) }
      : { linked: false },
  } as Group;
}

/**
 * Loads my groups. A group whose share-based entries in my ledger are out of date (someone else
 * changed it) is synced first; onSynced lets the caller re-pull my transactions afterwards.
 */
export async function pullGroups(onSynced?: () => void): Promise<Group[]> {
  const list = await api<any[]>("GET", "/api/v1/groups");
  let synced = false;
  const details = await Promise.all(list.filter(g => !g.is_archived).map(async g => {
    const d = await api<any>("GET", `/api/v1/groups/${g.id}`);
    if (d.my_ledger?.linked && !d.my_ledger.in_sync) {
      try {
        const r = await api<any>("POST", `/api/v1/groups/${g.id}/ledger/sync`);
        synced = true;
        return r.group;
      } catch { /* keep the unsynced view; the next pull retries */ }
    }
    return d;
  }));
  if (synced) onSynced?.();
  return details.map(fromServerGroup);
}

/** Turn on share-based tracking for this group in my own transactions, paid from this account. */
export const linkRemoteLedger = (groupId: string, fundingAccountId: string) =>
  api<any>("POST", `/api/v1/groups/${groupId}/ledger`, { funding_account_id: fundingAccountId });

export async function createRemoteGroup(name: string, description: string, emoji: string, budgetRupees: number | undefined,
  members: { name: string; upiId?: string }[]): Promise<string> {
  const g = await api<any>("POST", "/api/v1/groups", {
    name: name.slice(0, 120), description: (description || "").slice(0, 500), cover_emoji: emoji || "👥",
    budget_paise: budgetRupees && budgetRupees > 0 ? toPaise(budgetRupees) : undefined,
    members: members.map(m => ({ display_name: m.name.slice(0, 120), upi_id: m.upiId || undefined })),
  });
  return g.id;
}

/**
 * Exact shares when the app supplies them (they already sum to the amount), else an equal split.
 * personalAccountId: when I paid, the server also records the full amount in my own ledger
 * (linked to the expense, voided with it). The app no longer creates that entry itself.
 */
export async function addRemoteExpense(groupId: string, e: Omit<GroupExpense, "id" | "groupId" | "createdAt">,
  idempotencyKey: string, personalAccountId?: string): Promise<void> {
  const amountPaise = toPaise(Math.abs(safeRupees(e.amount)));
  const shares = (e.participants || []).map(p => ({ member_id: p.memberId, share_paise: toPaise(safeRupees(p.amountOwed)) }));
  const exact = shares.length > 0 && shares.reduce((s, x) => s + x.share_paise, 0) === amountPaise;
  await api("POST", `/api/v1/groups/${groupId}/expenses`, {
    description: e.description.slice(0, 300), amount_paise: amountPaise, paid_by_member_id: e.paidByMemberId,
    category: e.categoryId, expense_date: e.date, idempotency_key: idempotencyKey,
    personal_account_id: personalAccountId,
    ...(exact ? { split: "exact", shares } : { split: "equal", participant_ids: shares.length ? shares.map(s => s.member_id) : undefined }),
  });
}

export const voidRemoteExpense = (groupId: string, expenseId: string, confirmBalanceChange = false) =>
  api("DELETE", `/api/v1/groups/${groupId}/expenses/${expenseId}${confirmBalanceChange ? "?confirm_balance_change=true" : ""}`);

export interface VoidPreview {
  can_void: boolean;
  status: string;
  amount_paise: number;
  balance_flips: { member_id: string; before_paise: number; after_paise: number }[];
  recorded_settlements: number;
  suggested_after: { from_member_id: string; to_member_id: string; amount_paise: number }[];
  personal_entry: "will_void" | "will_flag_for_payer" | "share_ledger_updates" | null;
  blocker: string | null;
}

export const previewRemoteVoid = (groupId: string, expenseId: string) =>
  api<VoidPreview>("GET", `/api/v1/groups/${groupId}/expenses/${expenseId}/void-preview`);

/** Plain-language confirmation text for voiding a group expense (account mode). */
export function describeVoid(description: string, pv: VoidPreview, nameOf: (id: string) => string): string {
  const lines = [`Delete "${description}" (${formatINR(fromPaise(pv.amount_paise))})?`,
    "It stays in the history as deleted, and everyone's balances are recalculated."];
  if (pv.balance_flips.length > 0) {
    lines.push("", `${pv.recorded_settlements} payment(s) already recorded in this group stay as they are, so afterwards:`);
    for (const s of pv.suggested_after) {
      lines.push(`• ${nameOf(s.from_member_id)} will need to pay back ${nameOf(s.to_member_id)} ${formatINR(fromPaise(s.amount_paise))}`);
    }
    lines.push("If a recorded payment never actually happened, undo that payment instead.");
  }
  if (pv.personal_entry === "will_void") lines.push("", "The matching entry in your own transactions will be removed too.");
  if (pv.personal_entry === "share_ledger_updates") {
    lines.push("", "Your share of it will be removed from your own transactions; recorded paybacks stay as they are.");
  }
  if (pv.personal_entry === "will_flag_for_payer") lines.push("", "The payer's own transactions aren't changed; their entry is flagged for them to review.");
  return lines.join("\n");
}

export const recordRemoteSettlement = (groupId: string, from: string, to: string, amountRupees: number,
  method: string, idempotencyKey: string) =>
  api("POST", `/api/v1/groups/${groupId}/settlements`, {
    from_member_id: from, to_member_id: to, amount_paise: toPaise(Math.abs(safeRupees(amountRupees))),
    method: ["upi", "cash", "bank_transfer"].includes(method) ? method : "other", idempotency_key: idempotencyKey,
  });

export const archiveRemoteGroup = (groupId: string) =>
  api("PATCH", `/api/v1/groups/${groupId}`, { is_archived: true });

// --------------------------------------------------------------------------- members & invitations

export const addRemoteMember = (groupId: string, name: string, upiId?: string) =>
  api("POST", `/api/v1/groups/${groupId}/members`, { display_name: name.trim().slice(0, 120), upi_id: upiId?.trim() || undefined });

export const updateRemoteMember = (groupId: string, memberId: string, changes: { display_name?: string; upi_id?: string | null }) =>
  api("PATCH", `/api/v1/groups/${groupId}/members/${memberId}`, changes);

/** One-time code for a named seat; only its SHA-256 is stored on the server, valid 7 days. */
export const inviteRemoteMember = (groupId: string, memberId: string) =>
  api<{ token: string; expires_on: string }>("POST", `/api/v1/groups/${groupId}/members/${memberId}/invite`);

export const removeRemoteMember = (groupId: string, memberId: string) =>
  api("DELETE", `/api/v1/groups/${groupId}/members/${memberId}`);

export const claimRemoteSeat = (code: string) =>
  api<{ group_id: string; member_id: string }>("POST", "/api/v1/groups/claim", { token: code.trim() });

export function inviteShareText(groupName: string, memberName: string, code: string, expiresOn: string): string {
  return [
    `${memberName}, join "${groupName}" on Bagla Finance to see and add our shared expenses.`,
    `Sign in, open Split Hub, tap "Join with a code" and enter:`,
    code,
    `The code works once and expires on ${expiresOn}.`,
  ].join("\n");
}

/** Clear, specific messages for the join flow. */
export function claimErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 400) return "This code is invalid, has already been used, or has expired. Ask the group admin for a new one.";
    if (e.status === 409) return "You're already a member of this group.";
    if (e.status === 422) return "That doesn't look like a complete code. Copy the whole code and try again.";
    if (e.status === 401) return "Sign in to your Bagla account first, then enter the code.";
    if (e.isOffline) return e.message;
  }
  return (e as Error)?.message || "Couldn't join right now. Please try again.";
}

/** Edit description/amount/date. A new amount is re-split equally among the same people (audited). */
export const editRemoteExpense = (groupId: string, expenseId: string,
  changes: { description?: string; amountRupees?: number; date?: string }) =>
  api("PATCH", `/api/v1/groups/${groupId}/expenses/${expenseId}`, {
    ...(changes.description !== undefined ? { description: changes.description.trim().slice(0, 300) } : {}),
    ...(changes.amountRupees !== undefined ? { amount_paise: toPaise(Math.abs(safeRupees(changes.amountRupees))) } : {}),
    ...(changes.date ? { expense_date: changes.date } : {}),
  });

/** Undo a recorded payback: it stays in the history as voided and balances are recalculated. */
export const undoRemoteSettlement = (groupId: string, settlementId: string) =>
  api("DELETE", `/api/v1/groups/${groupId}/settlements/${settlementId}`);
