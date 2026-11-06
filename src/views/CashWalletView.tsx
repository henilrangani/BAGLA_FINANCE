import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Wallet,
  Plus,
  Minus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Banknote,
  DollarSign
} from "lucide-react";
import { localDateString } from "../utils/dates";
import { countsTowardTotals } from "../utils/ledger";
import { parseRupeeInput } from "../utils/money";
import { CloseButton, Modal } from "../components/ui/Modal";

export const CashWalletView: React.FC = () => {
  const { cashWallet, updateCashBalance, transactions, addTransaction, settings } = useFinance();

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [actualBalanceInput, setActualBalanceInput] = useState(cashWallet.balance.toString());
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const [quickCashAmount, setQuickCashAmount] = useState("");
  const [quickCashMerchant, setQuickCashMerchant] = useState("");

  // Cash transactions
  const cashTransactions = transactions.filter(t => t.paymentMethod === "cash" && countsTowardTotals(t));

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedBal = parseRupeeInput(actualBalanceInput, { allowZero: true });
    if (parsedBal.ok === false) return;
    const newBal = parsedBal.rupees;
    if (isNaN(newBal)) return;

    updateCashBalance(newBal, adjustmentReason || "Manual Physical Wallet Count");
    setIsAdjustOpen(false);
  };

  const handleQuickCashExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQuick = parseRupeeInput(quickCashAmount);
    if (parsedQuick.ok === false) return;
    const num = parsedQuick.rupees;
    if (isNaN(num) || num <= 0) return;

    addTransaction({
      amount: num,
      type: "expense",
      currency: "INR",
      merchant: quickCashMerchant.trim() || "Cash Expense",
      description: quickCashMerchant.trim() || "Tea / Auto / Small cash",
      categoryId: "cat-food",
      date: localDateString(),
      time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      paymentMethod: "cash",
      source: "manual",
      status: "verified",
      confidence: 1.0,
      tags: ["cash-entry"]
    });

    setQuickCashAmount("");
    setQuickCashMerchant("");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">
            Cash Management
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Physical Cash Wallet
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium">
            Keep your physical pocket money reconciled with offline entries
          </p>
        </div>

        <button
          onClick={() => setIsAdjustOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-600/25 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reconcile / Count Cash</span>
        </button>
      </div>

      {/* Hero Cash Balance Bento Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-6 border border-slate-800">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 block mb-1">
            Current Physical Cash in Pocket
          </span>
          <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            ₹{cashWallet.balance.toLocaleString("en-IN")}
          </span>
          <span className="text-xs text-slate-400 block mt-2 font-medium">
            Last reconciled on {cashWallet.lastReconciledAt}
          </span>
        </div>

        {/* Quick Cash Entry Mini Bento */}
        <form
          onSubmit={handleQuickCashExpense}
          className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs space-y-3 max-w-sm w-full"
        >
          <span className="font-bold text-slate-200 block">Quick 1-Tap Cash Expense</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={quickCashMerchant}
              onChange={e => setQuickCashMerchant(e.target.value)}
              placeholder="e.g. Chai, Auto, Veggies"
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-indigo-500"
            />
            <input
              type="number"
              value={quickCashAmount}
              onChange={e => setQuickCashAmount(e.target.value)}
              placeholder="₹"
              className="w-20 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold text-xs outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!quickCashAmount}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold cursor-pointer transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      </div>

      {/* Cash Activity Stream Bento Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Cash Transactions History</h3>
          <span className="text-xs text-gray-500 font-semibold px-2.5 py-1 rounded-full bg-[#F2F4F7] dark:bg-slate-800">
            {cashTransactions.length} entries
          </span>
        </div>

        {cashTransactions.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {cashTransactions.map(tx => (
              <div key={tx.id} className="p-4 sm:p-5 flex items-center justify-between gap-3 text-xs hover:bg-[#F2F4F7]/40 dark:hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold border border-indigo-200/60 dark:border-indigo-800">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                      {tx.merchant || tx.description}
                    </h4>
                    <span className="text-[11px] text-gray-400 font-medium">{tx.date} • {tx.time || "12:00"}</span>
                  </div>
                </div>

                <span className="font-black text-base text-gray-900 dark:text-white">
                  -₹{tx.amount.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-xs text-gray-400 font-medium">
            No cash entries yet. Use the quick form above or select "Cash" payment method when adding transactions.
          </div>
        )}
      </div>

      {/* Cash Reconcile Modal */}
      {isAdjustOpen && (
        <Modal onClose={() => { setAdjustmentReason(""); setActualBalanceInput(cashWallet.balance.toString()); setIsAdjustOpen(false); }} dirty={actualBalanceInput !== cashWallet.balance.toString() || !!adjustmentReason.trim()} labelledBy="cash-adjust-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">{close => (<>
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 p-6 space-y-4 text-xs shadow-2xl">
            <h3 id="cash-adjust-title" className="font-bold text-base text-gray-900 dark:text-white">Reconcile Physical Cash</h3>
            <p className="text-gray-500 font-medium">
              Count the physical currency notes and coins in your wallet and enter the actual amount.
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-3.5">
              <div>
                <label className="text-gray-500 font-bold block mb-1">Actual Cash in Wallet (₹) *</label>
                <input
                  type="number"
                  value={actualBalanceInput}
                  onChange={e => setActualBalanceInput(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-black text-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-gray-500 font-bold block mb-1">Reason / Note</label>
                <input
                  type="text"
                  value={adjustmentReason}
                  onChange={e => setAdjustmentReason(e.target.value)}
                  placeholder="e.g. ATM withdrawal adjustment, petty tea change"
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
                  className="px-4 py-3 border border-gray-200 dark:border-slate-700 font-bold text-gray-700 dark:text-slate-300 rounded-2xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-md cursor-pointer"
                >
                  Update Balance
                </button>
              </div>
            </form>
          </div>
        </>)}</Modal>
      )}
    </div>
  );
};
