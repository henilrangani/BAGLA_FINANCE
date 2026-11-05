/**
 * Map between the app's local shapes (rupee numbers, categoryId, paymentMethod)
 * and the FastAPI contract (integer paise, kind/direction, accounts).
 * Pure functions: unit-tested in mappers.test.ts.
 */
import type { Budget, FinancialGoal, PaymentMethod, Transaction } from "../types";
import { fromPaise, safeRupees, toPaise } from "../utils/money";

export interface ServerTx {
  id: string;
  account_id: string;
  amount_paise: number;
  currency: string;
  direction: "debit" | "credit";
  kind: string;
  status: "pending" | "posted" | "void";
  description: string;
  merchant: string | null;
  category: string | null;
  notes: string | null;
  occurred_at: string;
  local_date: string;
  source: string;
  needs_review: boolean;
  reverses_id: string | null;
  refund_of_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServerAccount {
  id: string;
  name: string;
  account_type: string;
  currency: string;
  balance_paise: number;
  opening_balance_paise: number;
  pending_paise: number;
  is_archived: boolean;
}

export interface AccountRefs {
  cashId: string;
  bankId: string;
  byId: Record<string, ServerAccount>;
}

const CLIENT_SOURCES = new Set(["manual", "voice", "receipt", "ai_suggested"]);

/** Local date + HH:mm in the device time zone → ISO instant with offset. */
export function toOccurredAt(date: string, time?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "12:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).toISOString();
}

export type CreateResult = { ok: true; body: Record<string, unknown> } | { ok: false; reason: string };

export function toServerCreate(tx: Transaction, refs: Pick<AccountRefs, "cashId" | "bankId">): CreateResult {
  const paise = toPaise(Math.abs(safeRupees(tx.amount)));
  if (paise <= 0) return { ok: false, reason: "amount must be greater than zero" };
  if (tx.type !== "income" && tx.type !== "expense") {
    return { ok: false, reason: `${tx.type} entries can't be synced from this screen yet` };
  }
  return {
    ok: true,
    body: {
      account_id: tx.paymentMethod === "cash" ? refs.cashId : refs.bankId,
      amount_paise: paise,
      kind: tx.type,
      description: (tx.description || tx.merchant || "Entry").slice(0, 500),
      merchant: tx.merchant ? tx.merchant.slice(0, 160) : null,
      category: tx.categoryId ? tx.categoryId.slice(0, 80) : null,
      notes: tx.notes ? tx.notes.slice(0, 1000) : null,
      occurred_at: toOccurredAt(tx.date, tx.time),
      status: "posted",
      source: CLIENT_SOURCES.has(tx.source) ? tx.source : "manual",
      needs_review: tx.status === "pending_review" || tx.status === "duplicate_flagged",
    },
  };
}

export function toServerUpdate(updates: Partial<Transaction>, current: Transaction): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (updates.amount !== undefined) out.amount_paise = toPaise(Math.abs(safeRupees(updates.amount)));
  if (updates.description !== undefined) out.description = updates.description.slice(0, 500) || "Entry";
  if (updates.merchant !== undefined) out.merchant = updates.merchant?.slice(0, 160) || null;
  if (updates.categoryId !== undefined) out.category = updates.categoryId?.slice(0, 80) || null;
  if (updates.notes !== undefined) out.notes = updates.notes?.slice(0, 1000) || null;
  if (updates.date !== undefined || updates.time !== undefined) {
    out.occurred_at = toOccurredAt(updates.date ?? current.date, updates.time ?? current.time);
  }
  if (updates.status !== undefined) out.needs_review = updates.status === "pending_review";
  return out;
}

/** Server-side import categoriser emits plain names; the app uses category ids. */
const CATEGORY_ID_BY_NAME: Record<string, string> = {
  food: "cat-food", groceries: "cat-groceries", transport: "cat-transport", fuel: "cat-fuel",
  shopping: "cat-shopping", bills: "cat-bills", electricity: "cat-electricity", internet: "cat-internet",
  subscriptions: "cat-subscriptions", healthcare: "cat-healthcare", rent: "cat-rent", insurance: "cat-insurance",
  education: "cat-education", travel: "cat-travel", entertainment: "cat-entertainment", salary: "cat-income-salary",
  other: "cat-other",
};

export function toCategoryId(category: string | null | undefined): string {
  if (!category) return "cat-other";
  if (category.startsWith("cat-")) return category;
  return CATEGORY_ID_BY_NAME[category.trim().toLowerCase()] || "cat-other";
}

const METHOD_BY_ACCOUNT: Record<string, PaymentMethod> = {
  cash: "cash",
  credit_card: "credit_card",
  wallet: "wallet",
  bank: "bank_transfer",
  savings: "bank_transfer",
};

export function fromServerTx(s: ServerTx, accounts: Record<string, ServerAccount>, reversed: Set<string>): Transaction {
  const acc = accounts[s.account_id];
  const isReversalPair = s.kind === "reversal" || reversed.has(s.id);
  // Reversed pairs, transfers, savings/loan/investment and adjustments are not
  // income or expense; the local UI excludes "transfer" from all totals.
  const type: Transaction["type"] = isReversalPair
    ? "transfer"
    : s.kind === "income" || s.kind === "expense" || s.kind === "refund"
      ? (s.kind as Transaction["type"])
      : "transfer";
  const t = new Date(s.occurred_at);
  return {
    id: s.id,
    userId: "account",
    amount: fromPaise(s.amount_paise),
    type,
    currency: s.currency,
    merchant: s.merchant || s.description,
    description: s.description,
    categoryId: toCategoryId(s.category),
    date: s.local_date,
    time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
    paymentMethod: (acc && METHOD_BY_ACCOUNT[acc.account_type]) || "upi",
    source: s.source === "import" ? "imported" : s.source === "voice" || s.source === "receipt" ? s.source : "manual",
    accountId: s.account_id,
    status: s.status === "void" ? "soft_deleted" : s.status === "pending" || s.needs_review ? "pending_review" : "verified",
    confidence: 1,
    notes: s.notes || undefined,
    tags: isReversalPair ? ["reversed"] : undefined,
    refundOfId: s.refund_of_id || undefined,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  } as Transaction;
}

export interface ServerBudget {
  id: string;
  name: string;
  category: string | null;
  period: Budget["period"];
  amount_paise: number;
  alert_threshold_pct: number;
  start_date: string;
  end_date: string | null;
  spent_paise: number;
}

export function fromServerBudget(b: ServerBudget): Budget {
  return {
    id: b.id,
    name: b.name,
    type: b.category ? "category" : (b.period as Budget["type"]),
    categoryId: b.category || undefined,
    amount: fromPaise(b.amount_paise),
    spent: fromPaise(b.spent_paise),
    period: b.period,
    alertThreshold: b.alert_threshold_pct / 100,
    startDate: b.start_date,
    endDate: b.end_date || undefined,
  };
}

export function toServerBudget(b: Omit<Budget, "id" | "spent">): Record<string, unknown> {
  return {
    name: (b.name || "Budget").slice(0, 160),
    category: b.categoryId || null,
    period: b.period || "monthly",
    amount_paise: toPaise(Math.abs(safeRupees(b.amount))),
    alert_threshold_pct: Math.min(100, Math.max(1, Math.round((b.alertThreshold || 0.8) * 100))),
    start_date: b.startDate || undefined,
    end_date: b.endDate || undefined,
  };
}

export interface ServerGoal {
  id: string;
  name: string;
  target_paise: number;
  deadline: string | null;
  saved_paise: number;
  created_at?: string;
}

/** Emits both field spellings used in the app (title/name, targetDate/deadline). */
export function fromServerGoal(g: ServerGoal): FinancialGoal {
  return {
    id: g.id,
    title: g.name,
    name: g.name,
    targetAmount: fromPaise(g.target_paise),
    currentAmount: fromPaise(g.saved_paise),
    targetDate: g.deadline || "",
    deadline: g.deadline || "",
    category: "Savings",
    icon: "Target",
    color: "#10b981",
    monthlyRecommended: 0,
    createdAt: (g.created_at || "").slice(0, 10),
  } as FinancialGoal;
}

export function toServerGoal(g: any): Record<string, unknown> {
  const deadline = g.deadline || g.targetDate;
  return {
    name: String(g.name || g.title || "Savings goal").slice(0, 160),
    target_paise: toPaise(Math.abs(safeRupees(g.targetAmount))),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline || "") ? deadline : null,
  };
}
