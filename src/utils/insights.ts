/**
 * Built-in answers from the person's own records: no AI, no network, nothing invented.
 * Every number is an integer-paise sum over recorded entries (transfers, voided and duplicate-flagged
 * entries excluded), and every answer says which period and how many entries it used.
 * It answers a fixed set of question types; anything else gets an honest "I can't answer that" plus examples.
 */
import type { Budget, Category, Transaction } from "../types";
import { countsTowardTotals } from "./ledger";
import { safeRupees, toPaise } from "./money";

export interface InsightData {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  today?: string; // YYYY-MM-DD, for tests
}

export interface InsightAnswer {
  answer: string;
  /** Which records the answer used, shown under it. */
  basis: string;
  /** False when the question wasn't understood or there's no data to answer it. */
  answered: boolean;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DISCRETIONARY = /(food|dining|restaurant|shopping|entertainment|travel|transport|fuel|subscription|personal|coffee|snack|leisure|gift)/i;

export const inr = (paise: number) => {
  const neg = paise < 0;
  const r = Math.abs(paise);
  const whole = Math.floor(r / 100).toLocaleString("en-IN");
  const frac = r % 100 ? `.${String(r % 100).padStart(2, "0")}` : "";
  return `${neg ? "−" : ""}₹${whole}${frac}`;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDay = (s: string) => parseIso(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export interface Range { from: string; to: string; label: string }

/** Date range named in the question; defaults to this month. */
export function rangeFor(question: string, today: string): Range {
  const q = question.toLowerCase();
  const t = parseIso(today);
  const startOfMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  const days = (n: number): Range => { const f = new Date(t); f.setDate(f.getDate() - (n - 1)); return { from: iso(f), to: today, label: `the last ${n} days` }; };
  if (/\btoday\b/.test(q)) return { from: today, to: today, label: "today" };
  if (/\byesterday\b/.test(q)) { const y = new Date(t); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y), label: "yesterday" }; }
  const lastN = /last\s+(\d{1,3})\s+days?/.exec(q);
  if (lastN) return days(Math.max(1, Math.min(366, Number(lastN[1]))));
  if (/\b(this|current) week\b/.test(q)) {
    const f = new Date(t); f.setDate(f.getDate() - ((f.getDay() + 6) % 7)); // Monday
    return { from: iso(f), to: today, label: "this week" };
  }
  if (/\blast week\b/.test(q)) return days(7);
  if (/\blast month\b|\bprevious month\b/.test(q)) {
    const f = new Date(t.getFullYear(), t.getMonth() - 1, 1), e = new Date(t.getFullYear(), t.getMonth(), 0);
    return { from: iso(f), to: iso(e), label: f.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }
  if (/\b(this|current) year\b/.test(q)) return { from: `${t.getFullYear()}-01-01`, to: today, label: `${t.getFullYear()} so far` };
  if (/\blast year\b/.test(q)) return { from: `${t.getFullYear() - 1}-01-01`, to: `${t.getFullYear() - 1}-12-31`, label: String(t.getFullYear() - 1) };
  const mi = MONTHS.findIndex(m => new RegExp(`\\b${m}\\b|\\b${m.slice(0, 3)}\\b`).test(q));
  if (mi >= 0) {
    const y = mi > t.getMonth() ? t.getFullYear() - 1 : t.getFullYear();
    const f = new Date(y, mi, 1), e = new Date(y, mi + 1, 0);
    return { from: iso(f), to: iso(e) < today ? iso(e) : today, label: f.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }
  return { from: iso(startOfMonth), to: today, label: "this month" };
}

const GLOSSARY: [RegExp, string, string][] = [
  [/\bemi\b/, "EMI", "An Equated Monthly Instalment is the fixed amount you pay every month on a loan. Part of it pays interest and part reduces the loan itself; early EMIs are mostly interest."],
  [/\bsip\b/, "SIP", "A Systematic Investment Plan puts a fixed amount into a mutual fund at regular intervals (often monthly), so you buy more units when prices are low and fewer when they're high."],
  [/credit score|cibil/, "Credit score", "A 3-digit number (300–900 in India, e.g. CIBIL) that lenders use to judge how reliably you repay. Paying EMIs and card bills on time and using a small part of your credit limit help it."],
  [/compound/, "Compound interest", "Interest earned on your interest as well as on what you put in. ₹10,000 at 8% a year becomes about ₹21,589 in 10 years, not ₹18,000."],
  [/inflation/, "Inflation", "The rise in prices over time. With 6% inflation, something that costs ₹100 today costs about ₹106 next year, so money kept idle buys less."],
  [/emergency fund/, "Emergency fund", "Money kept aside, easy to withdraw, for job loss or medical bills. A common rule of thumb is 3–6 months of essential expenses."],
  [/net worth/, "Net worth", "Everything you own (bank balances, investments, property) minus everything you owe (loans, card dues)."],
  [/\bbudget\b.*\b(mean|what)|what is a budget/, "Budget", "A spending limit you set for a category and period, e.g. ₹8,000 a month on food. Bagla compares your recorded spending with it."],
  [/\bfd\b|fixed deposit/, "Fixed deposit (FD)", "Money deposited with a bank for a fixed period at a fixed interest rate. Breaking it early usually means a small penalty."],
  [/mutual fund/, "Mutual fund", "A pool of many people's money that a professional invests in shares, bonds or both. Its value goes up and down with the market."],
  [/\bupi\b/, "UPI", "Unified Payments Interface: instant bank-to-bank payments with a UPI ID or QR code. Bagla doesn't make UPI payments; it only records what you tell it."],
  [/\bgst\b/, "GST", "Goods and Services Tax, added to the price of most things you buy in India, at 5%, 12%, 18% or 28% depending on the item."],
  [/savings rate/, "Savings rate", "The share of your income you don't spend: (income − spending) ÷ income. Saving ₹15,000 of a ₹60,000 income is a 25% savings rate."],
  [/interest rate|\binterest\b/, "Interest", "What a lender charges you for borrowing, or a bank pays you for saving, as a yearly percentage of the amount."],
];

export function answerFromRecords(question: string, data: InsightData): InsightAnswer {
  const q = question.toLowerCase().trim();
  const today = data.today || iso(new Date());

  // Financial terms (no data needed).
  if (/(what is|what's|what are|explain|meaning of|define|kya hai)/.test(q)) {
    const hit = GLOSSARY.find(([re]) => re.test(q));
    if (hit) return { answered: true, answer: `**${hit[1]}**: ${hit[2]}`, basis: "General explanation, not advice for your situation." };
  }

  const r = rangeFor(q, today);
  const catName = (id: string) => data.categories.find(c => c.id === id)?.name || "Other";
  const inRange = data.transactions.filter(t => countsTowardTotals(t) && t.date >= r.from && t.date <= r.to);
  const expenses = inRange.filter(t => t.type === "expense");
  const incomeTx = inRange.filter(t => t.type === "income");
  const p = (t: Transaction) => toPaise(Math.abs(safeRupees(t.amount)));
  const sum = (ts: Transaction[]) => ts.reduce((s, t) => s + p(t), 0);
  const basis = `From ${expenses.length + incomeTx.length} recorded ${expenses.length + incomeTx.length === 1 ? "entry" : "entries"}, ${r.label} (${fmtDay(r.from)}${r.from !== r.to ? ` – ${fmtDay(r.to)}` : ""}). Transfers and deleted entries are excluded.`;

  const byCat = new Map<string, number>();
  expenses.forEach(t => byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + p(t)));
  const ranked = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
  const total = sum(expenses);

  const noData = (what: string): InsightAnswer => ({ answered: false, basis,
    answer: `I don't see any recorded ${what} for ${r.label}. Add entries (or import a statement) and ask again.` });

  // A specific category.
  const cat = data.categories.find(c => {
    const n = c.name.toLowerCase();
    return q.includes(n) || n.split(/[\s&/]+/).some(w => w.length > 3 && new RegExp(`\\b${w}\\b`).test(q));
  });

  if (/(budget|over.?spen|limit)/.test(q)) {
    if (!data.budgets.length) return { answered: false, basis: "No budgets set.", answer: "You haven't set any budgets yet. Create one on the Budgets screen and I can compare your spending with it." };
    const lines = data.budgets.map(b => {
      const lim = toPaise(safeRupees(b.amount)), spent = toPaise(safeRupees(b.spent));
      const diff = lim - spent;
      return `- **${b.name}**: spent ${inr(spent)} of ${inr(lim)} → ${diff >= 0 ? `${inr(diff)} left` : `**${inr(-diff)} over**`}`;
    });
    const over = data.budgets.filter(b => toPaise(safeRupees(b.spent)) > toPaise(safeRupees(b.amount))).length;
    return { answered: true, basis: "From your budgets' current periods (as shown on the Budgets screen).",
      answer: `${over ? `${over} of your ${data.budgets.length} budgets ${over === 1 ? "is" : "are"} over the limit.` : "All your budgets are within their limits."}\n${lines.join("\n")}` };
  }

  if (/(save|saving|reduce|cut|lower|less|tips?)\b/.test(q) && !/savings rate/.test(q)) {
    if (!expenses.length) return noData("spending");
    const flex = ranked.filter(([id]) => DISCRETIONARY.test(catName(id))).slice(0, 3);
    const pick = flex.length ? flex : ranked.slice(0, 2);
    const lines = pick.map(([id, v]) => `- **${catName(id)}**: ${inr(v)}. Cutting it by 10% saves ${inr(Math.floor(v / 10))}.`);
    return { answered: true, basis,
      answer: `Your spending ${r.label} was ${inr(total)}. The categories where small cuts add up:\n${lines.join("\n")}\nSetting a budget for one of them makes the limit visible as you spend. These are suggestions from your own records, not financial advice.` };
  }

  if (/(pattern|habit|weekend|weekday|which day|trend)/.test(q)) {
    if (!expenses.length) return noData("spending");
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const byDay = new Array(7).fill(0);
    expenses.forEach(t => { byDay[parseIso(t.date).getDay()] += p(t); });
    const topDay = byDay.indexOf(Math.max(...byDay));
    const weekend = byDay[0] + byDay[6];
    const merchants = new Map<string, number>();
    expenses.forEach(t => { const m = (t.merchant || t.description || "").trim(); if (m) merchants.set(m, (merchants.get(m) || 0) + 1); });
    const repeat = Array.from(merchants.entries()).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { answered: true, basis,
      answer: [`You spend the most on **${days[topDay]}s** (${inr(byDay[topDay])} ${r.label}).`,
        `Weekends were ${total ? Math.round((weekend * 100) / total) : 0}% of your spending (${inr(weekend)} of ${inr(total)}).`,
        repeat.length ? `Places you paid more than once: ${repeat.map(([m, n]) => `${m} (${n}×)`).join(", ")}.` : ""].filter(Boolean).join("\n") };
  }

  if (/(income|earn|salary)/.test(q)) {
    if (!incomeTx.length) return noData("income");
    const inc = sum(incomeTx);
    return { answered: true, basis,
      answer: `Income ${r.label}: ${inr(inc)}. Spending: ${inr(total)}. ${inc >= total ? `You kept ${inr(inc - total)} (${Math.round(((inc - total) * 100) / inc)}%).` : `You spent ${inr(total - inc)} more than you earned.`}` };
  }

  if (cat && /(spen|spent|cost|pay|paid|how much)/.test(q)) {
    const v = byCat.get(cat.id) || 0;
    const n = expenses.filter(t => t.categoryId === cat.id).length;
    if (!n) return { answered: true, basis, answer: `No ${cat.name} spending recorded ${r.label}.` };
    return { answered: true, basis, answer: `You spent **${inr(v)}** on ${cat.name} ${r.label}, across ${n} ${n === 1 ? "entry" : "entries"}${total ? ` (${Math.round((v * 100) / total)}% of all spending)` : ""}.` };
  }

  if (/(most|top|biggest|highest|where|break.?down|categor|summar|how much|spen|spent|total)/.test(q)) {
    if (!expenses.length) return noData("spending");
    const lines = ranked.slice(0, 5).map(([id, v], i) => `${i + 1}. **${catName(id)}**: ${inr(v)} (${Math.round((v * 100) / total)}%)`);
    return { answered: true, basis, answer: `You spent **${inr(total)}** ${r.label}. By category:\n${lines.join("\n")}` };
  }

  return { answered: false, basis: "",
    answer: "I can only answer a few kinds of questions from your records without AI. Try: “How much did I spend on food last month?”, “Where did I spend the most this month?”, “Am I over any budget?”, “What are my spending patterns?”, “How can I spend less?” or “What is an EMI?”." };
}
