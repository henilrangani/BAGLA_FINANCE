/**
 * Spending reports from recorded entries, in integer paise. Same counting rules as the rest of the app:
 * deleted and duplicate-flagged entries never count, transfers are neither income nor spending, refunds
 * reduce the spending of their category. Dates are YYYY-MM-DD local dates and are compared as strings
 * (no Date parsing, so no time-zone shifts).
 */
import type { Budget, Category, Transaction } from "../types";
import { countsTowardTotals } from "./ledger";
import { safeRupees, toPaise } from "./money";
import { csvCell } from "./csv";

const p = (t: Pick<Transaction, "amount">) => toPaise(Math.abs(safeRupees(t.amount)));
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface ReportInput { transactions: Transaction[]; categories: Category[]; budgets: Budget[]; today: string; from: string; to: string }

export interface SpendingReport {
  totalSpendPaise: number;
  totalIncomePaise: number;
  entryCount: number;
  byCategory: { categoryId: string; name: string; paise: number; count: number }[];
  daily: { date: string; paise: number }[];                // every day from..to, zero-filled
  monthly: { month: string; incomePaise: number; spendPaise: number }[]; // last 6 months ending at `to`
  budgets: { name: string; limitPaise: number; spentPaise: number }[];
}

/** Signed spend of one entry: expense +, refund −, everything else 0. */
function spendOf(t: Transaction): number {
  if (!countsTowardTotals(t)) return 0;
  if (t.type === "expense") return p(t);
  if (t.type === "refund") return -p(t);
  return 0;
}

export function buildSpendingReport({ transactions, categories, budgets, from, to }: ReportInput): SpendingReport {
  const inRange = transactions.filter(t => countsTowardTotals(t) && t.date >= from && t.date <= to);
  const name = (id: string) => categories.find(c => c.id === id)?.name || "Other";

  const cat = new Map<string, { paise: number; count: number }>();
  const day = new Map<string, number>();
  let spend = 0, income = 0, count = 0;
  for (const t of inRange) {
    const s = spendOf(t);
    if (t.type === "income") { income += p(t); count += 1; }
    if (s !== 0) {
      spend += s; count += 1;
      const c = cat.get(t.categoryId) || { paise: 0, count: 0 };
      c.paise += s; c.count += 1; cat.set(t.categoryId, c);
      day.set(t.date, (day.get(t.date) || 0) + s);
    }
  }

  const daily: { date: string; paise: number }[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  for (let d = new Date(fy, fm - 1, fd); ymd(d) <= to && daily.length < 400; d.setDate(d.getDate() + 1)) {
    daily.push({ date: ymd(d), paise: day.get(ymd(d)) || 0 });
  }

  const [ty, tm] = to.split("-").map(Number);
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const m = new Date(ty, tm - 1 - (5 - i), 1);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
    let inc = 0, sp = 0;
    for (const t of transactions) {
      if (!countsTowardTotals(t) || !t.date?.startsWith(key)) continue;
      if (t.type === "income") inc += p(t);
      sp += spendOf(t);
    }
    return { month: key, incomePaise: inc, spendPaise: sp };
  });

  return {
    totalSpendPaise: spend, totalIncomePaise: income, entryCount: count,
    byCategory: Array.from(cat.entries()).map(([id, v]) => ({ categoryId: id, name: name(id), ...v }))
      .filter(c => c.paise !== 0).sort((a, b) => b.paise - a.paise),
    daily, monthly,
    budgets: budgets.map(b => ({ name: b.name, limitPaise: toPaise(safeRupees(b.amount)), spentPaise: toPaise(safeRupees(b.spent)) })),
  };
}

/** CSV of the report (spreadsheet-safe cells), amounts in rupees with 2 decimals. */
export function reportToCsv(r: SpendingReport, from: string, to: string): string {
  const rs = (paise: number) => (paise / 100).toFixed(2);
  const lines = [
    ["Bagla Finance spending report", `${from} to ${to}`],
    [],
    ["Category", "Entries", "Spent (INR)"],
    ...r.byCategory.map(c => [c.name, String(c.count), rs(c.paise)]),
    ["Total", String(r.entryCount), rs(r.totalSpendPaise)],
    [],
    ["Month", "Income (INR)", "Spending (INR)"],
    ...r.monthly.map(m => [m.month, rs(m.incomePaise), rs(m.spendPaise)]),
  ];
  return lines.map(l => l.map(csvCell).join(",")).join("\n") + "\n";
}

/** Inclusive date range for a named period ending today. */
export function periodRange(kind: "7d" | "30d" | "month" | "lastmonth", today: string): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  if (kind === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (kind === "lastmonth") return { from: ymd(new Date(y, m - 2, 1)), to: ymd(new Date(y, m - 1, 0)) };
  const f = new Date(t); f.setDate(f.getDate() - (kind === "7d" ? 6 : 29));
  return { from: ymd(f), to: today };
}
