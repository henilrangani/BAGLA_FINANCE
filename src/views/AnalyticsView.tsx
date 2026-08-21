import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  ShieldCheck,
  Building,
  CreditCard,
  PieChart,
  BarChart3,
  Calendar,
  AlertCircle
} from "lucide-react";

export const AnalyticsView: React.FC = () => {
  const { transactions = [], categories = [], healthScore, settings } = useFinance();

  const [timeframe, setTimeframe] = useState<"month" | "quarter" | "year">("month");

  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  const currentQuarter = Math.floor(currentMonth / 3); // 0, 1, 2, 3

  // Helper to determine if a date string falls in the current / previous timeframe
  const isDateInTimeframe = (dateStr: string, tf: "month" | "quarter" | "year", period: "current" | "previous"): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;

    const y = d.getFullYear();
    const m = d.getMonth();
    const q = Math.floor(m / 3);

    if (tf === "month") {
      if (period === "current") {
        return y === currentYear && m === currentMonth;
      } else {
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return y === prevYear && m === prevMonth;
      }
    } else if (tf === "quarter") {
      if (period === "current") {
        return y === currentYear && q === currentQuarter;
      } else {
        const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
        const prevYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
        return y === prevYear && q === prevQuarter;
      }
    } else {
      // "year"
      if (period === "current") {
        return y === currentYear;
      } else {
        return y === currentYear - 1;
      }
    }
  };

  // Filter transactions by selected timeframe
  const currentPeriodExpenses = safeTransactions.filter(
    t => t && t.type === "expense" && t.status !== "soft_deleted" && isDateInTimeframe(t.date, timeframe, "current")
  );
  const currentPeriodIncome = safeTransactions.filter(
    t => t && t.type === "income" && t.status !== "soft_deleted" && isDateInTimeframe(t.date, timeframe, "current")
  );

  const previousPeriodExpenses = safeTransactions.filter(
    t => t && t.type === "expense" && t.status !== "soft_deleted" && isDateInTimeframe(t.date, timeframe, "previous")
  );

  // Scaled monthly income based on timeframe
  const incomeMultiplier = timeframe === "month" ? 1 : timeframe === "quarter" ? 3 : 12;
  const baseSettingsIncome = (Number(settings?.monthlyIncome) || 0) * incomeMultiplier;

  // Real financial aggregates for the selected timeframe
  const totalExpenseAmount = currentPeriodExpenses.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalIncomeAmount = currentPeriodIncome.reduce((s, t) => s + (Number(t.amount) || 0), 0) + baseSettingsIncome;
  const netSavingsAmount = Math.max(0, totalIncomeAmount - totalExpenseAmount);
  const savingsRate = totalIncomeAmount > 0 ? Math.round((netSavingsAmount / totalIncomeAmount) * 100) : 0;

  // Previous period spending comparison
  const currentPeriodSpent = totalExpenseAmount;
  const previousPeriodSpent = previousPeriodExpenses.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const hasPreviousPeriodData = previousPeriodExpenses.length > 0;

  // Timeframe label descriptors
  const timeframeLabels = {
    month: {
      current: `${now.toLocaleString("default", { month: "short" })} ${currentYear}`,
      previous: `${new Date(currentYear, currentMonth - 1, 1).toLocaleString("default", { month: "short" })} ${currentMonth === 0 ? currentYear - 1 : currentYear}`,
      unit: "Month"
    },
    quarter: {
      current: `Q${currentQuarter + 1} ${currentYear}`,
      previous: `Q${currentQuarter === 0 ? 4 : currentQuarter} ${currentQuarter === 0 ? currentYear - 1 : currentYear}`,
      unit: "Quarter"
    },
    year: {
      current: `${currentYear}`,
      previous: `${currentYear - 1}`,
      unit: "Year"
    }
  };

  const currentLabel = timeframeLabels[timeframe].current;
  const previousLabel = timeframeLabels[timeframe].previous;

  // Merchant Analytics calculation (strictly from current timeframe expenses)
  const merchantTotals: Record<string, { merchant: string; amount: number; count: number; categoryName: string }> = {};
  for (const t of currentPeriodExpenses) {
    const key = (t.merchant || t.description || "Other").trim();
    const cat = safeCategories.find(c => c && c.id === t.categoryId)?.name || "General";
    if (!merchantTotals[key]) {
      merchantTotals[key] = { merchant: key, amount: 0, count: 0, categoryName: cat };
    }
    merchantTotals[key].amount += Number(t.amount) || 0;
    merchantTotals[key].count += 1;
  }

  const topMerchants = Object.values(merchantTotals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Health score calculation with authentic data-driven states
  const hasTransactionsData = safeTransactions.length > 0;
  const hasHealthScoreData = hasTransactionsData && healthScore && typeof healthScore.score === "number";

  const scoreDisplay = hasHealthScoreData ? `${healthScore.score}` : "—";
  const gradeDisplay = hasHealthScoreData ? healthScore.grade : "Not enough data";

  const healthFactors = [
    {
      label: "Budget Adherence",
      score: hasHealthScoreData ? (healthScore.breakdown?.budgetAdherence ?? 0) : 0,
      maxScore: 25,
      explanation: hasHealthScoreData ? "Tracking within category spending limits" : "Requires active category budgets & transactions"
    },
    {
      label: "Savings Consistency",
      score: hasHealthScoreData ? (healthScore.breakdown?.savingsConsistency ?? 0) : 0,
      maxScore: 25,
      explanation: hasHealthScoreData ? "Monthly income vs expense savings allocation" : "Requires logged income & expense flow"
    },
    {
      label: "Recurring Expense Burden",
      score: hasHealthScoreData ? (healthScore.breakdown?.recurringBurden ?? 0) : 0,
      maxScore: 25,
      explanation: hasHealthScoreData ? "Subscriptions & fixed bill discipline" : "Evaluates fixed recurring commitments"
    },
    {
      label: "Spending Stability",
      score: hasHealthScoreData ? (healthScore.breakdown?.spendingStability ?? 0) : 0,
      maxScore: 25,
      explanation: hasHealthScoreData ? "Balanced day-to-day cash flow rhythm" : "Assesses expense consistency over time"
    }
  ];

  const insightText = hasHealthScoreData && Array.isArray(healthScore.insights) && healthScore.insights.length > 0
    ? healthScore.insights[0]
    : "Log your income, recurring subscriptions, and expenses to calculate your AI Financial Health Score and receive personalized optimization recommendations.";

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

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 block mb-1">
            Total Inflow
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
            ₹{totalIncomeAmount.toLocaleString("en-IN")}
          </div>
          <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium mt-1 block">
            {timeframe === "month" ? "Monthly income" : timeframe === "quarter" ? "Quarterly income" : "Annual income"} + credits
          </span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 block mb-1">
            Total Outflow
          </span>
          <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
            ₹{totalExpenseAmount.toLocaleString("en-IN")}
          </div>
          <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium mt-1 block">
            {currentPeriodExpenses.length} transactions logged
          </span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 block mb-1">
            Net Savings
          </span>
          <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
            ₹{netSavingsAmount.toLocaleString("en-IN")}
          </div>
          <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium mt-1 block">
            Savings rate: {totalIncomeAmount > 0 ? `${savingsRate}%` : "—"}
          </span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 block mb-1">
            Health Index
          </span>
          <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
            {hasHealthScoreData ? `${scoreDisplay}/100` : "—"}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-1 block">
            Status: {gradeDisplay}
          </span>
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
              <span className="text-4xl font-black text-indigo-400 tracking-tight">{scoreDisplay}</span>
              <span className="text-xs text-slate-400 block font-medium">
                {hasHealthScoreData ? `/ 100 (${gradeDisplay})` : `(${gradeDisplay})`}
              </span>
            </div>
          </div>
        </div>

        {/* Health Score Pillar Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
          {healthFactors.map((factor, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-200">{factor.label}</span>
                <span className="text-indigo-400 font-black">
                  {hasHealthScoreData ? `${factor.score}/${factor.maxScore}` : "—"}
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-400 h-full rounded-full transition-all"
                  style={{ width: `${hasHealthScoreData ? Math.min(100, Math.max(0, (factor.score / factor.maxScore) * 100)) : 0}%` }}
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
            {insightText}
          </p>
        </div>
      </div>

      {/* 2-Column Bento Grid: Period Comparison & Top Merchants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Period-over-Period Comparison */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-5">
          <div className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {timeframeLabels[timeframe].unit}-over-{timeframeLabels[timeframe].unit} Comparison
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              {currentLabel} vs {previousLabel}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-gray-500 block">
                {previousLabel}
              </span>
              <span className="text-2xl font-black text-gray-900 dark:text-white mt-1 block tracking-tight">
                {hasPreviousPeriodData ? `₹${previousPeriodSpent.toLocaleString("en-IN")}` : "₹0"}
              </span>
              {!hasPreviousPeriodData && (
                <span className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 block font-medium">
                  No previous-period data
                </span>
              )}
            </div>
            <div className="p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
              <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300 block">
                {currentLabel}
              </span>
              <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block tracking-tight">
                ₹{currentPeriodSpent.toLocaleString("en-IN")}
              </span>
              <span className="text-[10px] text-indigo-500 dark:text-indigo-300 mt-0.5 block font-medium">
                {currentPeriodExpenses.length} transactions
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700 text-xs text-gray-700 dark:text-slate-300 space-y-1.5">
            <span className="font-bold block">Period Insights:</span>
            {currentPeriodExpenses.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                No transactions recorded for {currentLabel} yet. Period trends and variance drivers will calculate automatically as you log expenses.
              </p>
            ) : hasPreviousPeriodData && previousPeriodSpent > 0 ? (
              <ul className="list-disc list-inside text-[11px] space-y-1 text-gray-500 dark:text-slate-400 font-medium">
                <li>
                  Spending in {currentLabel} is{" "}
                  {currentPeriodSpent >= previousPeriodSpent ? "up" : "down"} by{" "}
                  ₹{Math.abs(currentPeriodSpent - previousPeriodSpent).toLocaleString("en-IN")} (
                  {Math.abs(Math.round(((currentPeriodSpent - previousPeriodSpent) / previousPeriodSpent) * 100))}
                  %) compared to {previousLabel}.
                </li>
                <li>
                  Total transactions logged: {currentPeriodExpenses.length} (vs {previousPeriodExpenses.length} in {previousLabel}).
                </li>
              </ul>
            ) : (
              <ul className="list-disc list-inside text-[11px] space-y-1 text-gray-500 dark:text-slate-400 font-medium">
                <li>Total spending recorded in {currentLabel}: ₹{currentPeriodSpent.toLocaleString("en-IN")}.</li>
                <li>No previous period transactions recorded to calculate variance percentage.</li>
              </ul>
            )}
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

          {topMerchants.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <Building className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-gray-700 dark:text-slate-300">
                No merchant data available yet
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 max-w-xs mx-auto">
                Add an expense with a merchant name to view your top spending destinations.
              </p>
            </div>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
};

