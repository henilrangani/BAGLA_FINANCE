import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  X,
  Sparkles,
  Zap,
  Check,
  Mic,
  FileText,
  Users,
  Calendar,
  CreditCard,
  Tag,
  AlertCircle,
  Clock,
  ArrowRight
} from "lucide-react";
import { PaymentMethod, TransactionType } from "../types";
import { localDateString } from "../utils/dates";
import { safeRupees, parseRupeeInput } from "../utils/money";

export const FastAddExpenseModal: React.FC = () => {
  const {
    isAddExpenseOpen,
    setIsAddExpenseOpen,
    setIsVoiceModalOpen,
    setIsReceiptModalOpen,
    categories,
    groups,
    addTransaction,
    parseNaturalLanguageExpense,
    settings
  } = useFinance();

  const [mode, setMode] = useState<"smart" | "manual">("smart");
  const [naturalText, setNaturalText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<any>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Manual Form States
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState("cat-food");
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [date, setDate] = useState(localDateString());
  const [time, setTime] = useState(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  const [isFamilyShared, setIsFamilyShared] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [taxCategory, setTaxCategory] = useState("");

  if (!isAddExpenseOpen) return null;

  // Handle Natural Language Input & Real-time AI Extract
  const handleSmartParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!naturalText.trim()) return;

    setIsParsing(true);
    try {
      const extracted = await parseNaturalLanguageExpense(naturalText);
      setParsedPreview(extracted);
    } catch (err) {
      console.error(err);
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmSmartSave = () => {
    if (!parsedPreview) return;

    const matchedCategory = categories.find(
      c => c.name.toLowerCase() === (parsedPreview.category || "").toLowerCase() ||
           c.id.includes((parsedPreview.category || "").toLowerCase())
    ) || categories[0];

    const result = addTransaction({
      amount: Math.abs(safeRupees(parsedPreview.amount)), // no invented default amount
      type: "expense",
      currency: settings.currency || "INR",
      merchant: parsedPreview.merchant || parsedPreview.description || "Expense",
      description: parsedPreview.description || naturalText,
      categoryId: matchedCategory.id,
      date: parsedPreview.date || localDateString(),
      time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      paymentMethod: (parsedPreview.paymentMethod as PaymentMethod) || "upi",
      source: "manual",
      // AI-parsed entries below 80% confidence go to review instead of the ledger as verified.
      status: (Number(parsedPreview.confidence) || 0) >= 0.8 ? "verified" : "pending_review",
      confidence: Number(parsedPreview.confidence) || 0,
      notes: parsedPreview.notes || "",
      tags: parsedPreview.tags || ["quick-entry"]
    });

    if (!result.success) {
      setDuplicateWarning(result.error || "Please enter a valid amount before saving.");
      return;
    }
    if (result.duplicateWarning) {
      setDuplicateWarning(result.duplicateWarning);
    }

    setSaveToast(`₹${parsedPreview.amount} added ✓`);
    setTimeout(() => {
      setNaturalText("");
      setParsedPreview(null);
      setSaveToast(null);
      setIsAddExpenseOpen(false);
    }, 900);
  };

  // Handle Manual Save
  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseRupeeInput(amount);
    if (parsedAmount.ok === false) {
      setDuplicateWarning(parsedAmount.error);
      return;
    }
    const numAmount = parsedAmount.rupees;
    if (isNaN(numAmount) || numAmount <= 0) return;

    const result = addTransaction({
      amount: numAmount,
      type,
      currency: settings.currency || "INR",
      merchant: merchant.trim() || description.trim() || (type === "expense" ? "Expense" : "Income"),
      description: description.trim() || merchant.trim() || "Transaction",
      categoryId,
      date,
      time,
      paymentMethod,
      source: "manual",
      groupId: selectedGroupId || undefined,
      isFamilyShared,
      status: "verified",
      confidence: 1.0,
      notes: notes.trim() || undefined,
      taxCategory: taxCategory.trim() || undefined
    });

    if (result.duplicateWarning) {
      setDuplicateWarning(result.duplicateWarning);
    }

    setSaveToast(`₹${numAmount} saved ✓`);
    setTimeout(() => {
      // Reset form
      setAmount("");
      setDescription("");
      setMerchant("");
      setNotes("");
      setSaveToast(null);
      setIsAddExpenseOpen(false);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 bg-[#F2F4F7]/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-base shadow-xs">
              ₹
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900 dark:text-white">Record Transaction</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Fast & seamless in less than 10 seconds</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Mode Switcher */}
            <div className="flex bg-gray-200/80 dark:bg-slate-700/80 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setMode("smart")}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                  mode === "smart"
                    ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "text-gray-600 dark:text-slate-300"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Smart AI</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  mode === "manual"
                    ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-xs"
                    : "text-gray-600 dark:text-slate-300"
                }`}
              >
                Standard
              </button>
            </div>

            <button
              onClick={() => setIsAddExpenseOpen(false)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Voice / Receipt Bar */}
        <div className="px-6 py-3 bg-[#F2F4F7] dark:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs font-medium">
          <span className="text-gray-500 dark:text-slate-400">Alternative fast inputs:</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setIsAddExpenseOpen(false);
                setIsVoiceModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice</span>
            </button>
            <span className="text-gray-300 dark:text-slate-600">•</span>
            <button
              type="button"
              onClick={() => {
                setIsAddExpenseOpen(false);
                setIsReceiptModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Scan Bill</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6">
          {saveToast && (
            <div className="mb-4 p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-sm font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{saveToast}</span>
            </div>
          )}

          {duplicateWarning && (
            <div className="mb-4 p-3.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-2xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Possible duplicate detected:</span> {duplicateWarning}. We flagged it for your review.
              </div>
            </div>
          )}

          {mode === "smart" ? (
            /* Smart AI Natural Language Mode */
            <div>
              <form onSubmit={handleSmartParse} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                    Type naturally (e.g., “₹120 auto to college” or “450 dinner with friends”)
                  </label>
                  <div className="relative">
                    <input
                      id="input-smart-expense"
                      type="text"
                      value={naturalText}
                      onChange={e => setNaturalText(e.target.value)}
                      placeholder="e.g. Spent 500 on groceries, or Paid 1200 electricity bill"
                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={isParsing || !naturalText.trim()}
                      className="absolute right-2 top-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      {isParsing ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Extract</span>
                          <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Example Quick Prompts */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] text-gray-400 mr-1 self-center font-medium">Try:</span>
                  {[
                    "₹120 auto to college",
                    "Dinner 850",
                    "Spent 500 on groceries",
                    "Paid 1200 electricity bill",
                    "350 coffee at Starbucks"
                  ].map((example, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setNaturalText(example);
                      }}
                      className="text-[11px] px-3 py-1.5 bg-[#F2F4F7] dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-xl transition-colors font-medium cursor-pointer"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </form>

              {/* Extracted Card Preview */}
              {parsedPreview && (
                <div className="mt-5 p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      AI Extracted Details
                    </span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 font-bold">
                      {Math.round((parsedPreview.confidence || 0.9) * 100)}% Confidence
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs">
                      <span className="text-gray-400 block text-[10px] font-bold">Amount</span>
                      <span className="text-lg font-black text-gray-900 dark:text-white">
                        ₹{Number(parsedPreview.amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs">
                      <span className="text-gray-400 block text-[10px] font-bold">Category</span>
                      <span className="font-bold text-sm text-gray-900 dark:text-slate-200">
                        {parsedPreview.category || "Food & Dining"}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs">
                      <span className="text-gray-400 block text-[10px] font-bold">Merchant / Payee</span>
                      <span className="font-bold text-sm text-gray-900 dark:text-slate-200">
                        {parsedPreview.merchant || parsedPreview.description}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs">
                      <span className="text-gray-400 block text-[10px] font-bold">Payment Method</span>
                      <span className="font-bold text-sm text-gray-900 dark:text-slate-200 uppercase">
                        {parsedPreview.paymentMethod || "UPI"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmSmartSave}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Confirm & Save Expense</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Standard Manual Form Mode */
            <form onSubmit={handleManualSave} className="space-y-4">
              {/* Type Switcher */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-2xl transition-colors cursor-pointer ${
                    type === "expense"
                      ? "bg-rose-500 text-white shadow-xs"
                      : "bg-[#F2F4F7] dark:bg-slate-800 text-gray-600 dark:text-slate-400"
                  }`}
                >
                  - Expense
                </button>
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-2xl transition-colors cursor-pointer ${
                    type === "income"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-[#F2F4F7] dark:bg-slate-800 text-gray-600 dark:text-slate-400"
                  }`}
                >
                  + Income
                </button>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                  Amount (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-gray-400 font-bold text-lg">₹</span>
                  <input
                    id="input-manual-amount"
                    type="number"
                    step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full pl-9 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white font-black text-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {/* Category & Payment Method Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                    Category *
                  </label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    {categories
                      .filter(c => c.defaultType === type)
                      .map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3.5 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="cash">Cash Wallet</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                    <option value="bank_transfer">Net Banking / IMPS</option>
                    <option value="wallet">Digital Wallet</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Merchant / Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                    Merchant / Store
                  </label>
                  <input
                    type="text"
                    value={merchant}
                    onChange={e => setMerchant(e.target.value)}
                    placeholder="e.g. Swiggy, Amazon, Uber"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                    Description / Note
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Dinner with team"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium outline-none"
                  />
                </div>
              </div>

              {/* Group / Trip Tagging */}
              {groups.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                    Assign to Group / Trip (Optional)
                  </label>
                  <select
                    value={selectedGroupId}
                    onChange={e => setSelectedGroupId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium outline-none cursor-pointer"
                  >
                    <option value="">Personal expense (Not in a group)</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.coverEmoji} {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Family Shared Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
                <div>
                  <span className="text-xs font-bold text-gray-900 dark:text-slate-200 block">
                    Share with Family Space
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">
                    Visible to family household members
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isFamilyShared}
                  onChange={e => setIsFamilyShared(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Pro / Freelance Tax Tag */}
              {settings.profileType === "freelancer" || settings.accessibilityMode === "pro" ? (
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1">
                    Tax / Client Category
                  </label>
                  <input
                    type="text"
                    value={taxCategory}
                    onChange={e => setTaxCategory(e.target.value)}
                    placeholder="e.g. Client Expense, Section 80C, Business Travel"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium outline-none"
                  />
                </div>
              ) : null}

              {/* Save Button */}
              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Save {type === "expense" ? "Expense" : "Income"}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
