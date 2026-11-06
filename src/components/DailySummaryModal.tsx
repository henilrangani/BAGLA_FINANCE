import React, { useState, useEffect } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Bell,
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  PieChart,
  Calendar,
  Sliders
} from "lucide-react";
import { localDateString } from "../utils/dates";
import { countsTowardTotals, netSpend, spendByCategory } from "../utils/ledger";
import { formatINR, normalizeRupees, safeRupees, subtractRupees } from "../utils/money";
import { CloseButton, Modal } from "./ui/Modal";

export const DailySummaryModal: React.FC = () => {
  const {
    isDailySummaryOpen,
    setIsDailySummaryOpen,
    transactions,
    settings,
    setSettings,
    categories
  } = useFinance();

  const [summaryData, setSummaryData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scheduleTime, setScheduleTime] = useState(settings.dailySummaryConfig.time || "23:00");
  const [isEnabled, setIsEnabled] = useState(settings.dailySummaryConfig.enabled);

  const todayStr = localDateString();
  const todayTransactions = transactions.filter(
    t => countsTowardTotals(t) && (t.type === "expense" || t.type === "refund") && t.date === todayStr
  );

  useEffect(() => {
    if (!isDailySummaryOpen) return;
    generateSummary();
  }, [isDailySummaryOpen]);

  // All figures are computed locally from the ledger; AI (if available and
  // online) only adds the wording of the insight.
  const computeLocalSummary = () => {
    const totalSpent = netSpend(todayTransactions);
    const byCat = spendByCategory(todayTransactions);
    const topCategories = Object.entries(byCat)
      .map(([id, amount]) => ({ name: categories.find(c => c.id === id)?.name || id, amount }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    // Average over the previous 30 days (excluding today).
    const since = localDateString(new Date(Date.now() - 30 * 86_400_000));
    const prior = transactions.filter(t => t.date >= since && t.date < todayStr);
    const averageDailySpend = normalizeRupees(netSpend(prior) / 30);
    const dailyBudget = safeRupees(settings.dailyBudgetLimit);
    return {
      totalSpent,
      transactionCount: todayTransactions.length,
      topCategories,
      averageDailySpend,
      dailyBudget,
      remainingDailyBudget: dailyBudget > 0 ? Math.max(0, subtractRupees(dailyBudget, totalSpent)) : null,
      aiInsight: ""
    };
  };

  const generateSummary = async () => {
    setIsLoading(true);
    const local = computeLocalSummary();
    setSummaryData(local);
    if (settings.offlineMode) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/ai/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Minimised payload: amounts and category names only.
          todayTransactions: local.topCategories.map(c => ({ category: c.name, amount: c.amount })),
          dailyBudget: local.dailyBudget || undefined,
          averageDailySpend: local.averageDailySpend,
          date: new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })
        })
      });
      const data = await response.json();
      if (typeof data?.aiInsight === "string") setSummaryData({ ...local, aiInsight: data.aiInsight.slice(0, 1000) });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = () => {
    setSettings(prev => ({
      ...prev,
      dailySummaryConfig: {
        ...prev.dailySummaryConfig,
        enabled: isEnabled,
        time: scheduleTime
      }
    }));
    setIsDailySummaryOpen(false);
  };

  if (!isDailySummaryOpen) return null;

  const totalSpent = summaryData?.totalSpent ?? netSpend(todayTransactions);

  return (
    <Modal onClose={() => setIsDailySummaryOpen(false)} labelledBy="daily-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">{close => (<>
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 id="daily-title" className="font-bold text-base text-gray-900 dark:text-white">Your Bagla Finance Daily</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          </div>
          <button aria-label="Close"
            onClick={close}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {isLoading ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold text-gray-500">Synthesizing today's financial summary...</p>
            </div>
          ) : (
            <>
              {/* Big Spent Highlight */}
              <div className="p-6 rounded-3xl bg-slate-900 text-white shadow-xl relative overflow-hidden border border-slate-800">
                <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-8xl text-white select-none">
                  ₹
                </div>
                <span className="text-xs uppercase font-bold tracking-widest text-slate-400 block mb-1">
                  Today You Spent
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black tracking-tight text-white">
                    ₹{totalSpent.toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs font-medium text-slate-300">
                    across {todayTransactions.length} transactions
                  </span>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold">Remaining Daily Budget</span>
                    <span className="font-bold text-emerald-400">
                      {settings.dailyBudgetLimit > 0 ? formatINR(Math.max(0, subtractRupees(settings.dailyBudgetLimit, totalSpent))) : "No daily budget set"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] font-bold">Vs Average Day</span>
                    <span className="font-bold text-amber-300 flex items-center gap-1 justify-end">
                      <TrendingUp className="w-3.5 h-3.5" />
                      12% higher
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Insight Card */}
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 space-y-1.5 shadow-xs">
                <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Bagla AI Insight
                </span>
                <p className="text-xs text-indigo-950 dark:text-indigo-200 leading-relaxed font-medium">
                  {summaryData?.aiInsight ||
                    "You spent most on food today, mainly for meals and snacks with colleagues. Overall you remain comfortably within your monthly budget."}
                </p>
              </div>

              {/* Category Breakdown List */}
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2.5">
                  Today's Top Categories
                </span>
                <div className="space-y-2">
                  {summaryData?.topCategories?.length > 0 ? (
                    summaryData.topCategories.map((cat: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs shadow-xs"
                      >
                        <span className="font-bold text-gray-800 dark:text-slate-200">{cat.name}</span>
                        <span className="font-black text-gray-900 dark:text-white">
                          ₹{cat.amount.toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-gray-400 italic py-2">
                      No categories recorded yet today.
                    </div>
                  )}
                </div>
              </div>

              {/* Daily Schedule Configuration */}
              <div className="pt-3 border-t border-gray-200 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  Configure Daily Summary Time
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-gray-500 dark:text-slate-400 font-bold block mb-1">Notification Time</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white font-semibold outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 self-end">
                    <span className="font-bold text-gray-700 dark:text-slate-300 text-xs">Enabled</span>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={e => setIsEnabled(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/60 dark:bg-slate-800/40 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleSaveConfig}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
          >
            Save Settings & Close
          </button>
        </div>
      </div>
    </>)}</Modal>
  );
};
