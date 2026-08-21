import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  PieChart,
  Target,
  Plus,
  Sparkles,
  Sliders,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Calendar,
  X
} from "lucide-react";
import { Budget, FinancialGoal } from "../types";
import confetti from "canvas-confetti";

export const BudgetsGoalsView: React.FC = () => {
  const {
    budgets,
    goals,
    transactions,
    categories,
    addBudget,
    addGoal,
    updateGoalAmount,
    settings
  } = useFinance();

  const [activeSubTab, setActiveSubTab] = useState<"budgets" | "simulator" | "goals">("budgets");
  const [isNewBudgetOpen, setIsNewBudgetOpen] = useState(false);
  const [isNewGoalOpen, setIsNewGoalOpen] = useState(false);

  // What-if Simulator States
  const [reductionPercent, setReductionPercent] = useState(20);
  const [simCategory, setSimCategory] = useState("cat-food");

  // New Budget Form
  const [budgetName, setBudgetName] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCategoryId, setBudgetCategoryId] = useState(categories[0]?.id || "cat-food");

  // New Goal Form
  const [goalName, setGoalName] = useState("");
  const [goalTargetAmount, setGoalTargetAmount] = useState("");
  const [goalCurrentAmount, setGoalCurrentAmount] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("2026-12-31");
  const [goalEmoji, setGoalEmoji] = useState("🎯");

  // Current month spending calculation for budgets
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthTransactions = transactions.filter(t => t.date.startsWith(currentMonth) && t.type === "expense" && t.status !== "soft_deleted");

  // What if calculations
  const simTargetTransactions = monthTransactions.filter(t => t.categoryId === simCategory);
  const simSpentAmount = simTargetTransactions.reduce((s, t) => s + t.amount, 0) || 5800;
  const potentialMonthlySavings = Math.round(simSpentAmount * (reductionPercent / 100));
  const potentialAnnualSavings = potentialMonthlySavings * 12;

  const handleAddBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(budgetAmount);
    if (isNaN(amount) || amount <= 0) return;

    addBudget({
      name: budgetName.trim() || "Monthly Budget",
      type: budgetCategoryId ? "category" : "monthly",
      categoryId: budgetCategoryId || undefined,
      amount,
      period: "monthly",
      alertThreshold: 0.8,
      startDate: new Date().toISOString().split("T")[0]
    });

    setBudgetName("");
    setBudgetAmount("");
    setIsNewBudgetOpen(false);
  };

  const handleAddGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(goalTargetAmount);
    if (isNaN(target) || target <= 0) return;

    addGoal({
      name: goalName.trim() || "Savings Goal",
      targetAmount: target,
      currentAmount: parseFloat(goalCurrentAmount) || 0,
      currency: "INR",
      deadline: goalDeadline,
      color: "#10b981",
      iconEmoji: goalEmoji
    });

    setGoalName("");
    setGoalTargetAmount("");
    setGoalCurrentAmount("");
    setIsNewGoalOpen(false);
  };

  const handleTopUpGoal = (goalId: string, added: number) => {
    updateGoalAmount(goalId, added);
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 }
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">
            Financial Planning
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Budgets, Goals & Simulator
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium">
            Plan spending thresholds, simulate compound savings, and hit milestones
          </p>
        </div>

        {/* Sub-tab switcher */}
        <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-gray-200/80 dark:border-slate-800 gap-1.5 shadow-xs text-xs font-bold">
          <button
            onClick={() => setActiveSubTab("budgets")}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeSubTab === "budgets"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-gray-600 dark:text-slate-400 hover:text-indigo-600"
            }`}
          >
            Budgets
          </button>
          <button
            onClick={() => setActiveSubTab("simulator")}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === "simulator"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-gray-600 dark:text-slate-400 hover:text-indigo-600"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simulator</span>
          </button>
          <button
            onClick={() => setActiveSubTab("goals")}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeSubTab === "goals"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-gray-600 dark:text-slate-400 hover:text-indigo-600"
            }`}
          >
            Goals ({goals.length})
          </button>
        </div>
      </div>

      {/* Sub-Tab 1: Budgets */}
      {activeSubTab === "budgets" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setIsNewBudgetOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/25 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Create Budget</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {budgets.map(b => {
              const cat = categories.find(c => c.id === b.categoryId);
              const spent = b.categoryId
                ? monthTransactions.filter(t => t.categoryId === b.categoryId).reduce((s, t) => s + t.amount, 0)
                : monthTransactions.reduce((s, t) => s + t.amount, 0);

              const percent = Math.min(100, Math.round((spent / b.amount) * 100));
              const isOver = spent > b.amount;

              return (
                <div
                  key={b.id}
                  className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">{b.name}</span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                        isOver
                          ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                          : percent > 80
                          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300"
                      }`}
                    >
                      {percent}% Used
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-gray-500">Spent: ₹{spent.toLocaleString("en-IN")}</span>
                      <span className="text-gray-900 dark:text-white">Cap: ₹{b.amount.toLocaleString("en-IN")}</span>
                    </div>

                    <div className="w-full bg-[#F2F4F7] dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOver ? "bg-rose-500" : percent > 80 ? "bg-amber-500" : "bg-indigo-600"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex justify-between text-[11px] text-gray-500 font-semibold">
                    <span className="capitalize">{b.period}</span>
                    <span className="text-gray-800 dark:text-slate-200 font-bold">
                      Remaining: ₹{Math.max(0, b.amount - spent).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-Tab 2: What-If Simulator */}
      {activeSubTab === "simulator" && (
        <div className="max-w-3xl mx-auto p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="text-center space-y-1.5 max-w-lg mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Interactive What-If Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Simulate Your Potential Savings
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              See what happens to your annual wealth when you make small lifestyle optimizations.
            </p>
          </div>

          {/* Controls Bento Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-xs">
            <div>
              <label className="text-gray-500 font-bold block mb-2">Target Category</label>
              <select
                value={simCategory}
                onChange={e => setSimCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-semibold outline-none cursor-pointer"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-gray-500 font-bold">Reduction: {reductionPercent}%</label>
              </div>
              <input
                type="range"
                min="5"
                max="60"
                step="5"
                value={reductionPercent}
                onChange={e => setReductionPercent(parseInt(e.target.value))}
                className="w-full accent-indigo-600 mt-2 cursor-pointer"
              />
            </div>
          </div>

          {/* Simulator Results Highlight */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-6 rounded-3xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 text-center space-y-1">
              <span className="text-xs uppercase font-bold text-indigo-700 dark:text-indigo-300">
                Monthly Extra Saved
              </span>
              <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 block tracking-tight">
                ₹{potentialMonthlySavings.toLocaleString("en-IN")}
              </span>
              <span className="text-[11px] text-gray-500">Every single month added to your bank</span>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900 text-white border border-slate-800 text-center space-y-1">
              <span className="text-xs uppercase font-bold text-indigo-400">
                1-Year Compounded Impact
              </span>
              <span className="text-3xl font-black text-white block tracking-tight">
                ₹{potentialAnnualSavings.toLocaleString("en-IN")}
              </span>
              <span className="text-[11px] text-slate-400">Can fully fund your next vacation or investment</span>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Goals */}
      {activeSubTab === "goals" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setIsNewGoalOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/25 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Create Savings Target</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {goals.map(g => {
              const percent = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));

              return (
                <div
                  key={g.id}
                  className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{g.iconEmoji || "🎯"}</span>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">{g.name}</h4>
                    </div>
                    <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                      {percent}%
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-gray-500">Saved: ₹{g.currentAmount.toLocaleString("en-IN")}</span>
                      <span className="text-gray-900 dark:text-white">Target: ₹{g.targetAmount.toLocaleString("en-IN")}</span>
                    </div>

                    <div className="w-full bg-[#F2F4F7] dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 font-semibold">Due: {g.deadline}</span>
                    <button
                      onClick={() => handleTopUpGoal(g.id, 1000)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs cursor-pointer transition-colors"
                    >
                      + Top-Up ₹1,000
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Budget Modal */}
      {isNewBudgetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Create New Budget</h3>
            <form onSubmit={handleAddBudgetSubmit} className="space-y-3.5">
              <div>
                <label className="text-gray-500 font-bold block mb-1">Budget Name *</label>
                <input
                  type="text"
                  value={budgetName}
                  onChange={e => setBudgetName(e.target.value)}
                  placeholder="e.g. Monthly Dining Out"
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-gray-500 font-bold block mb-1">Limit (₹) *</label>
                <input
                  type="number"
                  value={budgetAmount}
                  onChange={e => setBudgetAmount(e.target.value)}
                  placeholder="8000"
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-black text-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-gray-500 font-bold block mb-1">Category</label>
                <select
                  value={budgetCategoryId}
                  onChange={e => setBudgetCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-semibold outline-none cursor-pointer"
                >
                  <option value="">Overall Total Budget</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewBudgetOpen(false)}
                  className="px-4 py-3 border border-gray-200 dark:border-slate-700 font-bold text-gray-700 dark:text-slate-300 rounded-2xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-md cursor-pointer"
                >
                  Save Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Goal Modal */}
      {isNewGoalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Create Savings Target</h3>
            <form onSubmit={handleAddGoalSubmit} className="space-y-3.5">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-gray-500 font-bold block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={goalEmoji}
                    onChange={e => setGoalEmoji(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-center text-xl font-bold"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-gray-500 font-bold block mb-1">Goal Name *</label>
                  <input
                    type="text"
                    value={goalName}
                    onChange={e => setGoalName(e.target.value)}
                    placeholder="e.g. Goa Vacation Fund"
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-500 font-bold block mb-1">Target Amount (₹) *</label>
                <input
                  type="number"
                  value={goalTargetAmount}
                  onChange={e => setGoalTargetAmount(e.target.value)}
                  placeholder="50000"
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-black text-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-gray-500 font-bold block mb-1">Target Date</label>
                <input
                  type="date"
                  value={goalDeadline}
                  onChange={e => setGoalDeadline(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-semibold outline-none cursor-pointer"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewGoalOpen(false)}
                  className="px-4 py-3 border border-gray-200 dark:border-slate-700 font-bold text-gray-700 dark:text-slate-300 rounded-2xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-md cursor-pointer"
                >
                  Save Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
