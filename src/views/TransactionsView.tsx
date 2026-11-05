import React, { useState, useMemo } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Search,
  Filter,
  Download,
  Upload,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  CreditCard,
  Tag,
  CheckCircle2,
  AlertCircle,
  FileText,
  Mic,
  Bell,
  ShieldCheck,
  X,
  ExternalLink,
  ChevronDown
} from "lucide-react";
import { Transaction, PaymentMethod, TransactionSource, TransactionType } from "../types";
import { localDateString } from "../utils/dates";
import { parseStatementCsv } from "../utils/csv";
import { TransactionEditForm } from "../components/TransactionEditForm";

export const TransactionsView: React.FC = () => {
  const {
    transactions,
    categories,
    groups,
    deleteTransaction,
    updateTransaction,
    addTransaction,
    setIsAddExpenseOpen,
    setIsReceiptModalOpen,
    settings
  } = useFinance();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");
  const [selectedType, setSelectedType] = useState<"all" | "expense" | "income">("all");
  const [selectedTransaction, setSelectedTransactionRaw] = useState<Transaction | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setSelectedTransaction = (t: Transaction | null) => {
    setSelectedTransactionRaw(t);
    if (!t || t.id !== selectedTransaction?.id) {
      setIsEditing(false);
      setConfirmDelete(false);
    }
  };
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  // Filter Logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (t.status === "soft_deleted") return false;

      // Type
      if (selectedType !== "all" && t.type !== selectedType) return false;

      // Category
      if (selectedCategory !== "all" && t.categoryId !== selectedCategory) return false;

      // Payment Method
      if (selectedPaymentMethod !== "all" && t.paymentMethod !== selectedPaymentMethod) return false;

      // Source
      if (selectedSource !== "all" && t.source !== selectedSource) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchMerchant = (t.merchant || "").toLowerCase().includes(q);
        const matchDesc = (t.description || "").toLowerCase().includes(q);
        const matchNotes = (t.notes || "").toLowerCase().includes(q);
        const matchTags = (t.tags || []).some(tag => tag.toLowerCase().includes(q));
        const matchAmount = t.amount.toString().includes(q);
        if (!matchMerchant && !matchDesc && !matchNotes && !matchTags && !matchAmount) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, searchQuery, selectedCategory, selectedPaymentMethod, selectedSource, selectedType]);

  // Handle CSV Import Demo
  const handleImportCsv = () => {
    if (!importCsvText.trim()) return;
    // Quote-aware parser: handles "1,250.00", Indian dates, signed amounts and
    // an optional Type column. Bad rows are reported, never guessed.
    const { rows, errors } = parseStatementCsv(importCsvText);
    let addedCount = 0;
    let flaggedCount = 0;
    const fallbackCat = categories.find(c => c.id === "cat-other") || categories[0];

    for (const row of rows) {
      const matchedCat = categories.find(c => c.name.toLowerCase() === row.categoryName.toLowerCase());
      const result = addTransaction({
        amount: row.amount,
        type: row.type,
        currency: "INR",
        merchant: row.merchant,
        description: row.merchant,
        categoryId: (matchedCat || fallbackCat).id,
        date: row.date,
        time: "12:00",
        paymentMethod: row.paymentMethod,
        source: "imported",
        // Unknown category -> ask the user to review instead of silently filing it.
        status: matchedCat ? "verified" : "pending_review",
        confidence: matchedCat ? 1.0 : 0.5,
        tags: ["bank-statement-import"]
      });
      if (result.success) addedCount++;
      if (result.duplicateWarning) flaggedCount++;
    }

    setImportSuccessCount(addedCount);
    setImportErrors([
      ...(flaggedCount ? [`${flaggedCount} possible duplicate(s) flagged for review and excluded from totals`] : []),
      ...errors.slice(0, 20).map(e => `Line ${e.line}: ${e.message}`),
      ...(errors.length > 20 ? [`…and ${errors.length - 20} more problems`] : [])
    ]);
    if (errors.length === 0 && flaggedCount === 0) {
      setTimeout(() => {
        setImportCsvText("");
        setImportSuccessCount(null);
        setIsImportModalOpen(false);
      }, 1200);
    }
  };

  const loadSampleCsv = () => {
    const sample = `2026-08-18, Fresh To Home Fish & Meat, 640, Food & Dining, upi
2026-08-17, Amazon Online Shopping, 1499, Shopping, credit_card
2026-08-16, Airtel Broadband Bill, 999, Bills & Utilities, net_banking
2026-08-15, Cult.fit Gym Subscription, 1200, Health & Fitness, upi`;
    setImportCsvText(sample);
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = "ID,Date,Time,Merchant,Description,Category,Type,Amount,Currency,PaymentMethod,Source,Status\n";
    const rows = filteredTransactions.map(t => {
      const cat = categories.find(c => c.id === t.categoryId)?.name || "General";
      return `"${t.id}","${t.date}","${t.time || ""}","${t.merchant || ""}","${t.description}","${cat}","${t.type}","${t.amount}","${t.currency}","${t.paymentMethod}","${t.source}","${t.status}"`;
    }).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Bagla_Finance_Transactions_${localDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">
            Historical Ledger
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Transaction Ledger
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium">
            Search, filter, audit, and import bank & statement data seamlessly
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setImportErrors([]); setIsImportModalOpen(true); }}
            className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-800 rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-600" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-800 rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setIsAddExpenseOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/25 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Add Entry</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar Bento Box */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Field */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by merchant, note, amount, or tag..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800/70 text-gray-900 dark:text-white placeholder-gray-400 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Type Filter */}
          <div className="flex bg-[#F2F4F7] dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold shrink-0">
            {(["all", "expense", "income"] as const).map(t => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-4 py-2 rounded-xl capitalize transition-all cursor-pointer ${
                  selectedType === t
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-gray-600 dark:text-slate-400 hover:text-indigo-600"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdown Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-800 dark:text-slate-200 font-semibold outline-none cursor-pointer"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedPaymentMethod}
              onChange={e => setSelectedPaymentMethod(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-800 dark:text-slate-200 font-semibold outline-none cursor-pointer"
            >
              <option value="all">All Payment Methods</option>
              <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
              <option value="cash">Cash Wallet</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="bank_transfer">Net Banking / IMPS</option>
            </select>
          </div>

          <div>
            <select
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-800 dark:text-slate-200 font-semibold outline-none cursor-pointer"
            >
              <option value="all">All Entry Sources</option>
              <option value="manual">Manual Entry</option>
              <option value="voice">AI Voice Entry</option>
              <option value="receipt">AI Receipt Scan</option>
              <option value="notification">SMS / Notification</option>
              <option value="connected">Connected Account</option>
              <option value="imported">Statement Import</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table / List Bento Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs text-gray-500 font-bold">
          <span>Showing {filteredTransactions.length} of {transactions.length} entries</span>
          <span className="text-gray-400">Click any row for full audit</span>
        </div>

        {filteredTransactions.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {filteredTransactions.map(tx => {
              const cat = categories.find(c => c.id === tx.categoryId);
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTransaction(tx)}
                  className="p-4 sm:px-6 flex items-center justify-between gap-3 hover:bg-[#F2F4F7]/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    {/* Category Icon indicator */}
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0"
                      style={{ backgroundColor: `${cat?.color || "#4f46e5"}1a`, color: cat?.color || "#4f46e5" }}
                    >
                      {cat?.icon || "₹"}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                          {tx.merchant || tx.description}
                        </h4>
                        {tx.isRecurring && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-800">
                            Recurring
                          </span>
                        )}
                        {tx.groupId && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800">
                            Trip Split
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                        <span>{tx.date}</span>
                        <span>•</span>
                        <span className="font-medium text-gray-700 dark:text-slate-300">{cat?.name || "General"}</span>
                        <span>•</span>
                        <span className="uppercase font-bold text-gray-500">{tx.paymentMethod}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`font-black text-sm sm:text-base ${
                        tx.type === "expense" ? "text-gray-900 dark:text-white" : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {tx.type === "expense" ? `-₹${tx.amount.toLocaleString("en-IN")}` : `+₹${tx.amount.toLocaleString("en-IN")}`}
                    </span>
                    <span className="block text-[10px] text-gray-400 capitalize font-medium">{tx.source}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-xs text-gray-400">
            No transactions match the selected filters.
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/60 dark:bg-slate-800/40">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Transaction Details</h3>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="text-center py-3">
                <span className="text-3xl font-black text-gray-900 dark:text-white block tracking-tight">
                  ₹{selectedTransaction.amount.toLocaleString("en-IN")}
                </span>
                <span className="text-xs text-gray-500 font-medium mt-1 block">
                  {selectedTransaction.merchant || selectedTransaction.description}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Date & Time</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">
                    {selectedTransaction.date} {selectedTransaction.time || ""}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Payment Method</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200 uppercase">
                    {selectedTransaction.paymentMethod}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Category</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">
                    {categories.find(c => c.id === selectedTransaction.categoryId)?.name || "General"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Entry Mode</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200 capitalize">
                    {selectedTransaction.source}
                  </span>
                </div>
              </div>

              {selectedTransaction.notes && (
                <div>
                  <span className="text-gray-400 font-bold block mb-1">Notes:</span>
                  <p className="p-3 rounded-xl bg-[#F2F4F7] dark:bg-slate-800 text-gray-700 dark:text-slate-300">
                    {selectedTransaction.notes}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              {isEditing ? (
                <TransactionEditForm
                  tx={selectedTransaction}
                  categories={categories}
                  onCancel={() => setIsEditing(false)}
                  onSave={updates => {
                    updateTransaction(selectedTransaction.id, updates);
                    setSelectedTransaction({ ...selectedTransaction, ...updates });
                    setIsEditing(false);
                  }}
                />
              ) : confirmDelete ? (
                <div className="space-y-2 pt-2" role="alertdialog" aria-label="Confirm delete">
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">
                    Delete this entry? It stops counting in your totals. When you're signed in, it's kept in your account history as "voided".
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        deleteTransaction(selectedTransaction.id);
                        setSelectedTransaction(null);
                        setConfirmDelete(false);
                      }}
                      className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl cursor-pointer"
                    >
                      Yes, delete
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 border border-gray-300 dark:border-slate-700 font-bold rounded-2xl cursor-pointer">
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex-1 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 font-bold rounded-2xl flex items-center justify-center gap-1.5 transition-colors border border-rose-200 dark:border-rose-800 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                  {(selectedTransaction.type === "income" || selectedTransaction.type === "expense") && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex-1 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 font-bold rounded-2xl border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedTransaction(null)}
                    className="flex-1 py-3 bg-gray-900 hover:bg-black text-white dark:bg-white dark:text-gray-900 font-bold rounded-2xl transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSV Importer Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Import Bank Statement CSV</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-gray-600 dark:text-slate-300">
                Paste raw statement lines: <code className="font-mono bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded">Date, Merchant, Amount, Category, Method[, Type]</code>
                <br />
                Type is optional: expense / income / refund / transfer (or debit / credit). Negative amounts need a Type.
              </p>

              <textarea
                rows={5}
                value={importCsvText}
                onChange={e => setImportCsvText(e.target.value)}
                placeholder="2026-08-18, Starbucks Coffee, 350, Food & Dining, upi"
                className="w-full p-3.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-mono text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={loadSampleCsv}
                  className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                >
                  Load Sample Statement Data
                </button>

                {importSuccessCount !== null && (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {importSuccessCount} entries imported!
                  </span>
                )}
              </div>

              {importErrors.length > 0 && (
                <ul role="alert" className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1 max-h-40 overflow-y-auto">
                  {importErrors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-3 border border-gray-200 dark:border-slate-700 rounded-2xl font-bold text-gray-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportCsv}
                  disabled={!importCsvText.trim()}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  Process & Import Records
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
