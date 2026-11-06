/** Spending reports on the Analytics screen: real recorded entries only (see utils/reports.ts). */
import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { useFinance } from "../context/FinanceContext";
import { buildSpendingReport, periodRange, reportToCsv } from "../utils/reports";
import { localDateString } from "../utils/dates";

const PERIODS = [
  { id: "7d", label: "Last 7 days" }, { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" }, { id: "lastmonth", label: "Last month" },
] as const;
type PeriodId = typeof PERIODS[number]["id"];

const inr = (paise: number) => `${paise < 0 ? "−" : ""}₹${(Math.abs(paise) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const compact = (rupees: number) => (rupees >= 100000 ? `₹${(rupees / 100000).toFixed(1)}L` : rupees >= 1000 ? `₹${(rupees / 1000).toFixed(1)}k` : `₹${Math.round(rupees)}`);
const card = "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs";

export const SpendingReports: React.FC = () => {
  const { transactions, categories, budgets } = useFinance();
  const [period, setPeriod] = useState<PeriodId>("30d");
  const today = localDateString();
  const { from, to } = periodRange(period, today);
  const r = useMemo(() => buildSpendingReport({ transactions, categories, budgets, today, from, to }),
    [transactions, categories, budgets, today, from, to]);
  const max = Math.max(1, ...r.byCategory.map(c => c.paise));

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([reportToCsv(r, from, to)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `bagla-spending-report-${from}-to-${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section aria-labelledby="reports-title" className="space-y-4" data-testid="spending-reports">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 id="reports-title" className="text-lg font-black text-gray-950 dark:text-white">Spending reports</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400">From your recorded entries. Transfers, deleted entries and duplicates are left out; refunds reduce spending.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="radiogroup" aria-label="Report period" className="flex flex-wrap gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
            {PERIODS.map(p => (
              <button key={p.id} role="radio" aria-checked={period === p.id} onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${period === p.id
                  ? "bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-xs" : "text-gray-600 dark:text-slate-300"}`}>{p.label}</button>
            ))}
          </div>
          <button onClick={exportCsv} disabled={r.entryCount === 0}
            className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-slate-600 text-xs font-bold text-gray-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {r.entryCount === 0 ? (
        <div className={`${card} text-sm text-gray-600 dark:text-slate-300`} data-testid="reports-empty">
          No income or spending recorded between {from} and {to}. Add entries or import a statement to see reports.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className={card}><span className="text-[11px] font-bold uppercase text-gray-500">Spent</span>
              <div className="text-xl font-black text-gray-900 dark:text-white" data-testid="report-spent">{inr(r.totalSpendPaise)}</div></div>
            <div className={card}><span className="text-[11px] font-bold uppercase text-gray-500">Recorded income</span>
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-400">{inr(r.totalIncomePaise)}</div></div>
            <div className={card}><span className="text-[11px] font-bold uppercase text-gray-500">Entries</span>
              <div className="text-xl font-black text-gray-900 dark:text-white">{r.entryCount}</div></div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">By category</h3>
              <ul className="space-y-2" aria-label="Spending by category">
                {r.byCategory.map(c => (
                  <li key={c.categoryId} className="text-xs">
                    <div className="flex justify-between gap-2 text-gray-800 dark:text-slate-200">
                      <span className="truncate">{c.name} <span className="text-gray-500">· {c.count}</span></span>
                      <span className="font-bold tabular-nums">{inr(c.paise)}</span>
                    </div>
                    <div className="h-2 mt-1 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
                      <div className="h-full bg-[#047857]" style={{ width: `${Math.max(2, Math.round((Math.max(0, c.paise) * 100) / max))}%` }} />
                    </div>
                  </li>
                ))}
                {r.byCategory.length === 0 && <li className="text-xs text-gray-500">No spending in this period.</li>}
              </ul>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Daily spending</h3>
              <div className="h-48" role="img" aria-label={`Daily spending from ${from} to ${to}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.daily.map(d => ({ day: d.date.slice(5), rupees: d.paise / 100 }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={compact} width={48} />
                    <Tooltip formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Spent"]} />
                    <Bar dataKey="rupees" fill="#047857" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Income vs spending, last 6 months</h3>
              <div className="h-48" role="img" aria-label="Income and spending for the last six months">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.monthly.map(m => ({ month: m.month, Income: m.incomePaise / 100, Spending: m.spendPaise / 100 }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={compact} width={48} />
                    <Tooltip formatter={(v: number, k: string) => [`₹${v.toLocaleString("en-IN")}`, k]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Income" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Spending" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Budgets vs actual (current period)</h3>
              {r.budgets.length === 0 ? <p className="text-xs text-gray-500">No budgets yet. Create one on the Budgets screen.</p> : (
                <ul className="space-y-2 text-xs" aria-label="Budgets versus actual">
                  {r.budgets.map(b => {
                    const over = b.spentPaise > b.limitPaise;
                    return (
                      <li key={b.name} className="flex justify-between gap-2 text-gray-800 dark:text-slate-200">
                        <span className="truncate">{b.name}</span>
                        <span className={`font-bold tabular-nums ${over ? "text-rose-600" : ""}`}>
                          {inr(b.spentPaise)} of {inr(b.limitPaise)} {over ? `(${inr(b.spentPaise - b.limitPaise)} over)` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
