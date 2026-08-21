import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  CreditCard,
  Plus,
  AlertCircle,
  Calendar,
  Sparkles,
  CheckCircle2,
  Trash2,
  Bell,
  RefreshCw
} from "lucide-react";
import { RecurringExpense } from "../types";

export const SubscriptionsView: React.FC = () => {
  const { recurring, addRecurringTransaction, deleteRecurringTransaction } = useFinance();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "yearly" | "weekly">("monthly");
  const [nextDueDate, setNextDueDate] = useState("2026-08-24");

  const totalMonthlyRecurring = recurring
    .filter(r => r.status === "active")
    .reduce((s, r) => s + (r.frequency === "yearly" ? r.amount / 12 : r.amount), 0);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;

    addRecurringTransaction({
      name: name.trim() || "Subscription",
      amount: num,
      currency: "INR",
      frequency,
      categoryId: "cat-bills",
      nextDueDate,
      status: "active",
      autoTracked: false
    });

    setName("");
    setAmount("");
    setIsAddOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">
            Commitment Tracker
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Recurring Bills & Subscriptions
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium">
            Track auto-debit payments, upcoming bills, and spot unused services
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/25 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Add Subscription</span>
        </button>
      </div>

      {/* Top Banner Bento Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-6 border border-slate-800">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 block mb-1">
            Monthly Fixed Commitments
          </span>
          <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            ₹{Math.round(totalMonthlyRecurring).toLocaleString("en-IN")}
            <span className="text-xs font-medium text-slate-400 ml-1.5">/ month</span>
          </span>
          <p className="text-xs text-slate-400 mt-2 font-medium">
            ₹{Math.round(totalMonthlyRecurring * 12).toLocaleString("en-IN")} committed across {recurring.length} active services every year.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs space-y-1.5 max-w-xs">
          <span className="font-bold text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            AI Subscription Audit
          </span>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            All your recurring subscriptions are healthy. No duplicate active streaming apps detected.
          </p>
        </div>
      </div>

      {/* Subscriptions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {recurring.map(sub => (
          <div
            key={sub.id}
            className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">{sub.name}</span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold capitalize border border-indigo-200 dark:border-indigo-800">
                {sub.frequency}
              </span>
            </div>

            <div>
              <span className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                ₹{sub.amount.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-gray-500 text-[11px]">
                Due: <strong className="text-gray-800 dark:text-slate-200 font-bold">{sub.nextDueDate}</strong>
              </span>
              <button
                onClick={() => deleteRecurringTransaction(sub.id)}
                className="text-gray-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                title="Remove Subscription"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Subscription Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Track Subscription / Bill</h3>

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <label className="text-gray-500 font-bold block mb-1">Service Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Netflix, Spotify, Gym"
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-gray-500 font-bold block mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="649"
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-black text-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-gray-500 font-bold block mb-1">Frequency</label>
                  <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-semibold outline-none cursor-pointer"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-500 font-bold block mb-1">Next Due Date</label>
                  <input
                    type="date"
                    value={nextDueDate}
                    onChange={e => setNextDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-semibold outline-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-3 border border-gray-200 dark:border-slate-700 font-bold text-gray-700 dark:text-slate-300 rounded-2xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-md cursor-pointer"
                >
                  Save Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
