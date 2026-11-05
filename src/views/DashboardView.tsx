import React, { useState, useMemo } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Receipt,
  Wallet,
  PiggyBank,
  Plus,
  Mic,
  FileText,
  Users,
  Sparkles,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Coffee,
  Car,
  ShoppingBag,
  Zap,
  Check,
  CreditCard,
  PieChart as PieChartIcon
} from "lucide-react";
import confetti from "canvas-confetti";
import { localDateString } from "../utils/dates";
import { countsTowardTotals, netSpend, spendByCategory, totalIncome } from "../utils/ledger";
import { normalizeRupees, subtractRupees, sumRupees } from "../utils/money";
import { computeGroupNetRupees } from "../services/data";
import type { Transaction } from "../types";
import { coachInsight } from "../utils/coach";

export const DashboardView: React.FC = () => {
  const {
    settings,
    transactions,
    categories,
    budgets,
    groups,
    selectedGroupId,
    setSelectedGroupId,
    anomalies,
    dismissAnomaly,
    setIsAddExpenseOpen,
    setIsVoiceModalOpen,
    setIsReceiptModalOpen,
    setIsAiChatOpen,
    setCurrentTab,
    setActiveGroup,
    addQuickExpense
  } = useFinance();

  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [quickAddedToast, setQuickAddedToast] = useState<string | null>(null);

  // Time & Greeting
  const now = new Date();
  const currentHour = now.getHours();
  const greeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 17
      ? "Good afternoon"
      : "Good evening";

  const todayStr = localDateString(now);
  const currentMonthPrefix = todayStr.substring(0, 7);

  // Dynamic Financial Calculations
  const {
    todayExpense,
    todayIncome,
    todayBalance,
    monthExpense,
    monthIncome,
    monthlySavings,
    savingsPct,
    barChartData,
    categoryChartData,
    recentTransactions
  } = useMemo(() => {
    const safeTxs = Array.isArray(transactions) ? transactions : [];
    // Exact paise arithmetic; flagged duplicates and deleted items never count;
    // refunds reduce spend; transfers are neither income nor expense.
    const counted = safeTxs.filter(countsTowardTotals);

    // Today's transactions
    const todayTxs = counted.filter(t => t.date === todayStr);
    const tExpense = netSpend(todayTxs);
    const tIncome = totalIncome(todayTxs);
    const tBalance = subtractRupees(tIncome, tExpense);

    // Monthly transactions
    const monthTxs = counted.filter(t => t.date && t.date.startsWith(currentMonthPrefix));
    const mExpense = netSpend(monthTxs);
    const mIncome = totalIncome(monthTxs);

    const mSavings = Math.max(0, subtractRupees(mIncome, mExpense));
    const sPct = mIncome > 0 ? ((mSavings / mIncome) * 100).toFixed(1) : "0";

    // Chart Data (Grouped by weeks of current month)
    const weekBuckets = [
      { label: "1-7", income: [] as Transaction[], spend: [] as Transaction[] },
      { label: "8-14", income: [] as Transaction[], spend: [] as Transaction[] },
      { label: "15-21", income: [] as Transaction[], spend: [] as Transaction[] },
      { label: "22-28", income: [] as Transaction[], spend: [] as Transaction[] },
      { label: "29-31", income: [] as Transaction[], spend: [] as Transaction[] }
    ];

    monthTxs.forEach(t => {
      const day = parseInt((t.date || "").split("-")[2] || "1", 10);
      const weekIdx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4;
      if (t.type === "income") weekBuckets[weekIdx].income.push(t);
      else if (t.type === "expense" || t.type === "refund") weekBuckets[weekIdx].spend.push(t);
    });

    const bChartData = weekBuckets.map(w => ({
      label: w.label,
      income: totalIncome(w.income),
      expense: Math.max(0, netSpend(w.spend))
    }));

    // Spending by Category Donut Data (net of refunds, positive only)
    const categoryTotals: { [key: string]: number } = Object.fromEntries(
      Object.entries(spendByCategory(monthTxs)).filter(([, v]) => v > 0)
    );

    const categoryColors: { [key: string]: string } = {
      "cat-food": "#3B82F6",
      "cat-transport": "#EC4899",
      "cat-shopping": "#8B5CF6",
      "cat-bills": "#F59E0B",
      "cat-education": "#06B6D4",
      "cat-entertainment": "#EF4444",
      "cat-groceries": "#10B981",
      "cat-other": "#F97316"
    };

    const categoryNames: { [key: string]: string } = {
      "cat-food": "Food & Dining",
      "cat-transport": "Transport & Fuel",
      "cat-shopping": "Shopping",
      "cat-bills": "Bills & Utilities",
      "cat-education": "Education",
      "cat-entertainment": "Entertainment",
      "cat-groceries": "Groceries",
      "cat-other": "Others"
    };

    const catChartData = Object.entries(categoryTotals).map(([catId, amount]) => {
      const pct = mExpense > 0 ? parseFloat(((amount / mExpense) * 100).toFixed(1)) : 0;
      return {
        name: categoryNames[catId] || "Other",
        amount,
        percentage: pct,
        color: categoryColors[catId] || "#94A3B8"
      };
    });

    // Recent 5 transactions
    const recents = safeTxs.filter(t => t && t.status !== "soft_deleted").slice(0, 5);

    return {
      todayExpense: tExpense,
      todayIncome: tIncome,
      todayBalance: tBalance,
      monthExpense: mExpense,
      monthIncome: mIncome,
      monthlySavings: mSavings,
      savingsPct: sPct,
      barChartData: bChartData,
      categoryChartData: catChartData,
      recentTransactions: recents
    };
  }, [transactions, todayStr, currentMonthPrefix]);

  // Handle 1-Tap Quick Spends
  const handleQuickAdd = (title: string, amount: number, categoryId: string) => {
    addQuickExpense(title, amount, categoryId, "upi");
    setQuickAddedToast(`Added ₹${amount} for ${title}! 🎉`);
    try {
      confetti({ particleCount: 30, spread: 45, origin: { y: 0.8 } });
    } catch {}
    setTimeout(() => setQuickAddedToast(null), 3000);
  };

  // Active Group Details for the Bento Card
  const activeGroup = useMemo(() => {
    return groups.find(g => g.id === selectedGroupId) || groups[0];
  }, [groups, selectedGroupId]);

  const activeGroupStats = useMemo(() => {
    if (!activeGroup) return { total: 0, perPerson: 0, youPaid: 0, net: 0 };
    const total = sumRupees(activeGroup.expenses.map(e => e.amount));
    const memberCount = Math.max(activeGroup.members.length, 1);
    // Average share, for display only (exact allocation lives in the settlement engine).
    const perPerson = normalizeRupees(total / memberCount);
    const currentMemberId = activeGroup.members.find(m => m.isCurrentUser)?.id || activeGroup.members[0]?.id;
    const youPaid = sumRupees(
      activeGroup.expenses.filter(e => e.paidByMemberId === currentMemberId).map(e => e.amount)
    );
    // Net position from the paise-exact engine (includes settlements already paid).
    const net = currentMemberId ? computeGroupNetRupees(activeGroup)[currentMemberId] || 0 : 0;
    return { total, perPerson, youPaid, net };
  }, [activeGroup]);

  // Key Budgets progress
  const budgetList = useMemo(() => {
    return budgets.slice(0, 4).map(b => {
      const pct = b.amount > 0 ? Math.min(Math.round((b.spent / b.amount) * 100), 100) : 0;
      let color = "bg-[#059669]";
      if (pct > 90) color = "bg-rose-500";
      else if (pct > 75) color = "bg-amber-500";
      else if (b.categoryId === "cat-transport") color = "bg-blue-500";
      else if (b.categoryId === "cat-shopping") color = "bg-purple-500";
      return {
        ...b,
        pct,
        color
      };
    });
  }, [budgets]);

  const handleOpenGroupTab = (groupId?: string) => {
    if (groupId) setSelectedGroupId(groupId);
    setCurrentTab("groups");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Confirmation for 1-Tap Quick Adds */}
      {quickAddedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0B2240] text-white px-4 py-3 rounded-2xl shadow-xl border border-emerald-500/40 flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{quickAddedToast}</span>
        </div>
      )}

      {/* Top Banner / Anomalies Alert (if any) */}
      {anomalies.length > 0 && (
        <div className="space-y-2">
          {anomalies.map(anom => (
            <div
              key={anom.id}
              className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex items-start justify-between gap-3 shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">{anom.title}</h4>
                  <p className="text-xs text-amber-800/90 dark:text-amber-300 mt-0.5">{anom.message}</p>
                </div>
              </div>
              <button
                onClick={() => dismissAnomaly(anom.id)}
                className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* FRIENDLY HERO WELCOME & 1-TAP QUICK SPENDS */}
      <div className="bg-gradient-to-r from-emerald-900 via-[#0B2240] to-[#0A192F] rounded-3xl p-6 sm:p-7 text-white shadow-md relative overflow-hidden border border-emerald-800/40">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Zero Headache Finance</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              {greeting}{settings.name ? `, ${settings.name.split(" ")[0]}` : ""}! ☀️
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed font-normal">
              Every rupee tracked effortlessly. Split trips with friends, monitor your cash flow, and achieve monthly savings without any stress.
            </p>

            {/* 1-Tap Preset Spend Chips */}
            <div className="pt-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-200 block mb-2">
                1-Tap Quick Spends (Try clicking one!)
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleQuickAdd("Masala Chai", 20, "cat-food")}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <span>☕</span>
                  <span>Chai ₹20</span>
                </button>

                <button
                  onClick={() => handleQuickAdd("Auto / Rickshaw", 60, "cat-transport")}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <span>🛺</span>
                  <span>Auto ₹60</span>
                </button>

                <button
                  onClick={() => handleQuickAdd("Lunch Meal", 140, "cat-food")}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <span>🍱</span>
                  <span>Lunch ₹140</span>
                </button>

                <button
                  onClick={() => handleQuickAdd("Groceries & Milk", 350, "cat-groceries")}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <span>🛒</span>
                  <span>Groceries ₹350</span>
                </button>

                <button
                  onClick={() => handleQuickAdd("Mobile Recharge", 299, "cat-bills")}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <span>⚡</span>
                  <span>Recharge ₹299</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Action Hub Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 shrink-0">
            <button
              onClick={() => setIsAddExpenseOpen(true)}
              className="p-3 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white flex flex-col items-center justify-center gap-1.5 shadow-md shadow-emerald-950/30 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-4 h-4 stroke-[3]" />
              </div>
              <span className="text-xs font-bold">+ Expense</span>
            </button>

            <button
              onClick={() => setIsVoiceModalOpen(true)}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex flex-col items-center justify-center gap-1.5 border border-white/15 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-500/30 text-blue-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Mic className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold">🎙 Voice</span>
            </button>

            <button
              onClick={() => setIsReceiptModalOpen(true)}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex flex-col items-center justify-center gap-1.5 border border-white/15 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-500/30 text-purple-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold">Scan Bill</span>
            </button>

            <button
              onClick={() => setCurrentTab("groups")}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex flex-col items-center justify-center gap-1.5 border border-white/15 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-teal-500/30 text-teal-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold">Split Hub</span>
            </button>

            <button
              onClick={() => setCurrentTab("cash")}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex flex-col items-center justify-center gap-1.5 border border-white/15 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-500/30 text-amber-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Wallet className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold">Cash Wallet</span>
            </button>

            <button
              onClick={() => setIsAiChatOpen(true)}
              className="p-3 rounded-2xl bg-emerald-600/30 hover:bg-emerald-600/50 text-white flex flex-col items-center justify-center gap-1.5 border border-emerald-400/30 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-500/40 text-emerald-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold">Bagla AI</span>
            </button>
          </div>
        </div>
      </div>

      {/* ROW 1: 4 FINANCIAL SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Today's Expense */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              Today's Expense
            </span>
            <div className="w-9 h-9 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              ₹{todayExpense.toLocaleString("en-IN")}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60">
                <TrendingDown className="w-3 h-3" />
                Live recorded
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Today's Income */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              Today's Income
            </span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-[#059669] dark:text-emerald-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              ₹{todayIncome.toLocaleString("en-IN")}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-[#059669] dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/60">
                <TrendingUp className="w-3 h-3" />
                Net incoming
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Today's Balance */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              Today's Balance
            </span>
            <div className="w-9 h-9 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              ₹{todayBalance.toLocaleString("en-IN")}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-[#059669] dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/60">
                <CheckCircle2 className="w-3 h-3" />
                Good going!
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Monthly Savings */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
              Monthly Savings
            </span>
            <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              ₹{monthlySavings.toLocaleString("en-IN")}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-[#059669] dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/60">
                <TrendingUp className="w-3 h-3" />
                {savingsPct}% of income
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: MONTHLY OVERVIEW CHART + SPENDING BY CATEGORY DONUT */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left: Monthly Overview Bar Chart */}
        <div className="col-span-12 lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">Monthly Overview</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                  Income vs Expense cash flow cycles
                </p>
              </div>

              {/* Sub-header Summary Stats */}
              <div className="flex items-center gap-3 text-xs font-semibold flex-wrap">
                <span className="text-gray-700 dark:text-slate-300">
                  Income: <strong className="text-[#059669] font-black">₹{monthIncome.toLocaleString("en-IN")}</strong>
                </span>
                <span className="text-gray-300 dark:text-slate-700">•</span>
                <span className="text-gray-700 dark:text-slate-300">
                  Expense: <strong className="text-rose-500 font-black">₹{monthExpense.toLocaleString("en-IN")}</strong>
                </span>
                <span className="text-gray-300 dark:text-slate-700">•</span>
                <span className="text-gray-700 dark:text-slate-300">
                  Savings: <strong className="text-emerald-600 font-black">₹{monthlySavings.toLocaleString("en-IN")}</strong>
                </span>
              </div>
            </div>

            {/* Recharts Dual Bar Chart */}
            <div className="h-64 sm:h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `₹${v / 1000}k`}
                  />
                  <Tooltip
                    formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, ""]}
                    contentStyle={{
                      backgroundColor: "#0B2240",
                      borderRadius: "16px",
                      color: "#fff",
                      border: "none",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)"
                    }}
                  />
                  <Bar
                    dataKey="income"
                    name="Income"
                    fill="#10B981"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="expense"
                    name="Expense"
                    fill="#F87171"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Legend */}
          <div className="flex items-center justify-center gap-6 pt-4 border-t border-gray-100 dark:border-slate-800 text-xs font-bold text-gray-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#10B981]"></span>
              <span>Income</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#F87171]"></span>
              <span>Expense</span>
            </div>
          </div>
        </div>

        {/* Right: Spending by Category Donut */}
        <div className="col-span-12 lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="border-b border-gray-100 dark:border-slate-800 pb-4 mb-4">
              <h3 className="text-base font-black text-gray-900 dark:text-white">Spending by Category</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                Portfolio distribution this month
              </p>
            </div>

            {/* Donut Chart with Center Total Label */}
            {categoryChartData.length === 0 ? (
              <div className="h-44 w-full flex flex-col items-center justify-center text-center p-4">
                <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-slate-800 text-gray-400 flex items-center justify-center mb-2">
                  <PieChartIcon className="w-5 h-5" />
                </div>
                <p className="text-xs text-gray-500 font-medium">No expenses logged this month yet.</p>
              </div>
            ) : (
              <div className="relative h-44 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="amount"
                      onMouseEnter={(_, idx) => setHoveredCategory(categoryChartData[idx]?.name || null)}
                      onMouseLeave={() => setHoveredCategory(null)}
                    >
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        `₹${Number(val).toLocaleString("en-IN")}`,
                        `${name}`
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Metric */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-black text-gray-900 dark:text-white tracking-tight">
                    ₹{monthExpense.toLocaleString("en-IN")}
                  </span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">
                    {hoveredCategory || "Total"}
                  </span>
                </div>
              </div>
            )}

            {/* Category Breakdown Rows */}
            {categoryChartData.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-4 pt-3 border-t border-gray-100 dark:border-slate-800">
                {categoryChartData.map((cat, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="font-semibold text-gray-700 dark:text-slate-300 truncate">{cat.name}</span>
                    </div>
                    <div className="text-right font-bold text-gray-900 dark:text-white">
                      <span>₹{cat.amount.toLocaleString("en-IN")}</span>
                      <span className="text-gray-400 text-[10px] ml-1 font-normal">({cat.percentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: 4 BENTO TILES (Recent Transactions, Budgets, Universal Group Hub, AI Insight) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Bento Tile 1: Recent Transactions */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3 mb-3">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Recent Transactions</h3>
              <button
                onClick={() => setCurrentTab("transactions")}
                className="text-xs font-bold text-[#059669] hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {recentTransactions.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400 font-medium">
                  No transactions recorded yet.
                </div>
              ) : (
                recentTransactions.map(tx => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold shrink-0">
                        {tx.type === "income" ? "↓" : "↑"}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                          {tx.merchant || tx.description}
                        </h4>
                        <p className="text-[10px] text-gray-400 font-medium truncate">
                          {tx.paymentMethod?.toUpperCase()} • {tx.time || "12:00"}
                        </p>
                      </div>
                    </div>

                    <span className={`font-black text-xs shrink-0 ${
                      tx.type === "income" ? "text-[#059669] dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}>
                      {tx.type === "income" ? "+" : "-"}₹{tx.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Bento Tile 2: Budgets */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3 mb-3">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Budgets Progress</h3>
              <button
                onClick={() => setCurrentTab("budgets")}
                className="text-xs font-bold text-[#059669] hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {budgetList.map((b, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-800 dark:text-slate-200">{b.name}</span>
                    <span className="font-semibold text-gray-600 dark:text-slate-400">
                      ₹{b.spent.toLocaleString("en-IN")} / ₹{b.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${b.color}`}
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bento Tile 3: Dynamic Universal Group Card */}
        <div
          onClick={() => handleOpenGroupTab(activeGroup?.id)}
          className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-[#059669] cursor-pointer group transition-all"
        >
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3 mb-3">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                  <span>{activeGroup?.coverEmoji || "👥"}</span>
                  <span className="truncate max-w-[130px]">{activeGroup?.name || "Active Group"}</span>
                </h3>
                <span className="text-[10px] text-gray-400 font-medium">
                  {activeGroup?.members.length || 0} members • Split Hub
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#059669] group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-2xl bg-[#F4F6F8] dark:bg-slate-800/60 border border-gray-200/60 dark:border-slate-700/60">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                  Total Spent
                </span>
                <span className="text-xs font-black text-gray-900 dark:text-white">
                  ₹{activeGroupStats.total.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-[#F4F6F8] dark:bg-slate-800/60 border border-gray-200/60 dark:border-slate-700/60">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                  Per Person
                </span>
                <span className="text-xs font-black text-gray-900 dark:text-white">
                  ₹{activeGroupStats.perPerson.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-[#F4F6F8] dark:bg-slate-800/60 border border-gray-200/60 dark:border-slate-700/60">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                  You Paid
                </span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                  ₹{activeGroupStats.youPaid.toLocaleString("en-IN")}
                </span>
              </div>

              <div className={`p-2.5 rounded-2xl border ${
                activeGroupStats.net >= 0
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60"
                  : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60"
              }`}>
                <span className={`text-[9px] font-bold uppercase tracking-wider block mb-0.5 ${
                  activeGroupStats.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                }`}>
                  {activeGroupStats.net >= 0 ? "You're Owed" : "You Owe"}
                </span>
                <span className={`text-xs font-black ${
                  activeGroupStats.net >= 0 ? "text-[#059669] dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}>
                  ₹{Math.abs(activeGroupStats.net).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-[#059669]">
            <span>View All {groups.length} Groups</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Bento Tile 4: AI Financial Coach */}
        <div className="bg-[#0B2240] rounded-3xl p-5 sm:p-6 text-white border border-navy-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-white">AI Coach</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Rule-based
              </span>
            </div>

            {/* Calculated from this month's ledger (not AI-generated, no invented claims). */}
            <p className="text-xs text-slate-200 leading-relaxed font-medium mt-2" role="status">
              {coachInsight(monthIncome, monthExpense, categoryChartData)}
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              Ask the AI assistant for a detailed explanation of your spending.
            </p>
          </div>

          <div className="mt-5 pt-3 border-t border-white/10">
            <button
              onClick={() => setIsAiChatOpen(true)}
              className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>Ask AI Coach</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
