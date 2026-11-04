/**
 * Pure ledger calculations. No React, no storage — everything here is
 * deterministic and unit-tested. Derived numbers (budget spent, totals) are
 * recomputed from transactions instead of being incremented, so editing or
 * deleting a transaction can never leave them out of sync.
 */
import type { Budget, BudgetPeriod, CashWallet, Transaction } from "../types";
import { fromPaise, safeRupees, toPaise } from "./money";

/** Soft-deleted and flagged duplicates must not count toward any total. */
export function countsTowardTotals(t: Pick<Transaction, "status"> | null | undefined): boolean {
  return !!t && t.status !== "soft_deleted" && t.status !== "duplicate_flagged";
}

function paiseOf(t: Pick<Transaction, "amount">): number {
  return toPaise(safeRupees(t.amount));
}

/** Sum of income (transfers and refunds excluded). */
export function totalIncome(txs: Transaction[]): number {
  let p = 0;
  for (const t of txs) if (countsTowardTotals(t) && t.type === "income") p += paiseOf(t);
  return fromPaise(p);
}

/** Expenses minus refunds. Transfers are neither income nor expense. */
export function netSpend(txs: Transaction[]): number {
  let p = 0;
  for (const t of txs) {
    if (!countsTowardTotals(t)) continue;
    if (t.type === "expense") p += paiseOf(t);
    else if (t.type === "refund") p -= paiseOf(t);
  }
  return fromPaise(p);
}

/** Net spend per category id (expenses minus refunds). */
export function spendByCategory(txs: Transaction[]): Record<string, number> {
  const p: Record<string, number> = {};
  for (const t of txs) {
    if (!countsTowardTotals(t)) continue;
    const sign = t.type === "expense" ? 1 : t.type === "refund" ? -1 : 0;
    if (!sign) continue;
    const key = t.categoryId || "cat-other";
    p[key] = (p[key] || 0) + sign * paiseOf(t);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) out[k] = fromPaise(v);
  return out;
}

function isoWeekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

/** Is `date` (YYYY-MM-DD) in the same budget period as `today`? */
export function isInPeriod(date: string, period: BudgetPeriod, today: string): boolean {
  if (!date) return false;
  switch (period) {
    case "daily":
      return date === today;
    case "weekly":
      return isoWeekStart(date) === isoWeekStart(today);
    case "monthly":
      return date.slice(0, 7) === today.slice(0, 7);
    case "yearly":
      return date.slice(0, 4) === today.slice(0, 4);
    default:
      return false;
  }
}

/** Does this transaction fall under this budget's scope (ignoring period)? */
export function budgetMatches(b: Budget, t: Transaction): boolean {
  if (b.categoryId) return t.categoryId === b.categoryId;
  if (b.type === "trip" && b.groupId) return t.groupId === b.groupId;
  if (b.type === "family") return !!t.isFamilyShared;
  return true; // overall daily / weekly / monthly budget
}

/** Net amount spent against a budget in its current period. */
export function computeBudgetSpent(b: Budget, txs: Transaction[], today: string): number {
  const scoped = txs.filter(
    t =>
      budgetMatches(b, t) &&
      isInPeriod(t.date, b.period || "monthly", today) &&
      (!b.startDate || t.date >= b.startDate) &&
      (!b.endDate || t.date <= b.endDate)
  );
  return Math.max(0, netSpend(scoped));
}

export function withDerivedSpent(budgets: Budget[], txs: Transaction[], today: string): Budget[] {
  return budgets.map(b => ({ ...b, spent: computeBudgetSpent(b, txs, today) }));
}

/**
 * Apply (sign = 1) or reverse (sign = -1) a transaction's effect on the cash wallet.
 * Only cash transactions that count toward totals affect it. The balance is
 * allowed to go negative: hiding a shortfall would misstate the user's cash.
 */
export function applyCashEffect(wallet: CashWallet, t: Transaction, sign: 1 | -1, today: string): CashWallet {
  if (t.paymentMethod !== "cash" || !countsTowardTotals(t)) return wallet;
  const amt = paiseOf(t) * sign;
  let spent = toPaise(safeRupees(wallet.cashSpent));
  let received = toPaise(safeRupees(wallet.cashReceived));
  let balance = toPaise(safeRupees(wallet.currentBalance));
  if (t.type === "expense") {
    spent += amt;
    balance -= amt;
  } else if (t.type === "income" || t.type === "refund") {
    received += amt;
    balance += amt;
  } else {
    return wallet; // transfers need a direction; not modelled in the cash wallet yet
  }
  return {
    ...wallet,
    cashSpent: fromPaise(spent),
    cashReceived: fromPaise(received),
    currentBalance: fromPaise(balance),
    lastAdjustedDate: today,
  };
}

/** Normalise legacy stored amounts to exact paise and coerce junk to 0. Idempotent. */
export function normalizeTransactions(txs: unknown): Transaction[] {
  if (!Array.isArray(txs)) return [];
  return txs
    .filter((t): t is Transaction => !!t && typeof t === "object")
    .map(t => ({ ...t, amount: Math.abs(safeRupees(t.amount)) }));
}
