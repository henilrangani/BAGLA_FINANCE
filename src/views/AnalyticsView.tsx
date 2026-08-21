import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  PieChart,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Calendar,
  CreditCard,
  Building,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Flame,
  ArrowUpRight
} from "lucide-react";

export const AnalyticsView: React.FC = () => {
  const { transactions, categories, healthScore, settings } = useFinance();

  const [timeframe, setTimeframe] = useState<"month" | "quarter" | "year">("month");

  // Merchant Analytics calculation
  const merchantTotals: Record<string, { merchant: string; amount: number; count: number; categoryName: string }> = {};
  for (const t of transactions.filter(t => t.type === "expense" && t.status !== "soft_deleted")) {
    const key = (t.merchant || t.description || "Other").trim();
    const cat = categories.find(c => c.id === t.categoryId)?.name || "General";
    if (!merchantTotals[key]) {
      merchantTotals[key] = { merchant: key, amount: 0, count: 0, categoryName: cat };
    }
    merchantTotals[key].amount += t.amount;
    merchantTotals[key].count += 1;
  }

  const topMerchants = Object.values(merchantTotals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Month-over-Month Simulated Comparison
  const currentMonthSpent = transactions
    .filter(t => t.date.startsWith("2026-08") && t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const lastMonthSpent = 28400; // Simulated benchmark for July 2026

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">
            Data & Insights
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Financial Intelligence & Reports
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium">
            Deep analytics, merchant breakdowns, health score, and spending patterns
          </p>
        </div>

        <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-gray-200/80 dark:border-slate-800 gap-1.5 shadow-xs text-xs font-bold">
          {(["month", "quarter", "year"] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 rounded-xl capitalize transition-all cursor-pointer ${
                timeframe === tf
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-gray-600 dark:text-slate-400 hover:text-indigo-600"
              }`}
            >
              This {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Financial Health Score Bento Box */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white shadow-md space-y-6 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-black tracking-tight">Bagla Financial Health Index</h2>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Evaluates savings discipline, fixed bill ratio, discretionary buffer, and consistency.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-4xl font-black text-indigo-400 tracking-tight">{healthScore.score}</span>
              <span className="text-xs text-slate-400 block font-medium">/ 100 ({healthScore.grade})</span>
            </div>
          </div>
        </div>

        {/* Health Score Pillar Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
          {healthScore.factors.map((factor, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-200">{factor.label}</span>
                <span className="text-indigo-400 font-black">
                  {factor.score}/{factor.maxScore}
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-400 h-full rounded-full transition-all"
                  style={{ width: `${(factor.score / factor.maxScore) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-medium">{factor.explanation}</p>
            </div>
          ))}
        </div>

        {/* AI Recommendations */}
        <div className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700 text-xs space-y-1.5">
          <span className="font-bold text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            AI Health Optimization Tip
          </span>
          <p className="text-slate-300 leading-relaxed font-medium">
            Your savings rate of 46% is outstanding. To further strengthen your position, automate a ₹5,000 monthly recurring transfer directly into a liquid emergency fund on salary day.
          </p>
        </div>
      </div>

      {/* 2-Column Bento Grid: Month Comparison & Top Merchants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Month-over-Month Comparison */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-5">
          <div className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Month-over-Month Comparison
            </h3>
            <p className="text-xs text-gray-500 font-medium">August 2026 vs July 2026</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-gray-500 block">July 2026</span>
              <span className="text-2xl font-black text-gray-900 dark:text-white mt-1 block tracking-tight">
                ₹{lastMonthSpent.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
              <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300 block">
                August 2026 (To Date)
              </span>
              <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block tracking-tight">
                ₹{currentMonthSpent.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700 text-xs text-gray-700 dark:text-slate-300 space-y-1.5">
            <span className="font-bold block">Key Variance Drivers:</span>
            <ul className="list-disc list-inside text-[11px] space-y-1 text-gray-500 dark:text-slate-400 font-medium">
              <li>Food & Dining is down by ₹1,400 due to fewer outside weekend dinners.</li>
              <li>Bills remained steady with on-time broadband & utility payments.</li>
            </ul>
          </div>
        </div>

        {/* Right: Top Payees & Merchants */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-5">
          <div className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Top Merchants & Payees
            </h3>
            <p className="text-xs text-gray-500 font-medium">Where most of your rupees flow</p>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {topMerchants.map((m, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs border border-indigo-200/60 dark:border-indigo-800">
                    {idx + 1}
                  </div>
                  <div>
                    <span className="font-bold text-sm text-gray-900 dark:text-white block">{m.merchant}</span>
                    <span className="text-gray-400 text-[11px] font-medium">{m.categoryName} • {m.count} txns</span>
                  </div>
                </div>

                <span className="font-black text-sm text-gray-900 dark:text-white">
                  ₹{m.amount.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
