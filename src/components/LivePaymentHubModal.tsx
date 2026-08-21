import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Zap,
  X,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Radio,
  Sparkles,
  RefreshCw,
  CreditCard,
  ShieldCheck,
  Building,
  BellRing,
  ArrowRight
} from "lucide-react";

export const LivePaymentHubModal: React.FC = () => {
  const {
    isLiveSyncModalOpen,
    setIsLiveSyncModalOpen,
    simulateIncomingPayment,
    settings,
    setSettings,
    categories
  } = useFinance();

  const [testAmount, setTestAmount] = useState<number | string>(340);
  const [testMerchant, setTestMerchant] = useState("Swiggy Biryani");
  const [testProvider, setTestProvider] = useState<"GPay" | "PhonePe" | "Paytm" | "CRED" | "HDFC">("GPay");
  const [testCategory, setTestCategory] = useState("cat-food");
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  if (!isLiveSyncModalOpen) return null;

  const webhookEndpoint = `${window.location.origin}/api/webhooks/payment-sync`;
  const samplePayload = JSON.stringify(
    {
      event: "payment_success",
      provider: testProvider,
      vpa: "user@okhdfcbank",
      merchant: testMerchant,
      amount: Number(testAmount) || 340,
      currency: "INR",
      referenceId: `UPI-${Date.now().toString().slice(-8)}`,
      timestamp: new Date().toISOString()
    },
    null,
    2
  );

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(testAmount);
    if (!amt || amt <= 0) return;
    simulateIncomingPayment(testProvider, amt, testMerchant || "Online Merchant", testCategory);
    setIsLiveSyncModalOpen(false);
  };

  const handleQuickTrigger = (
    provider: "GPay" | "PhonePe" | "Paytm" | "CRED" | "HDFC",
    amt: number,
    merchant: string,
    catId: string
  ) => {
    simulateIncomingPayment(provider, amt, merchant, catId);
    setIsLiveSyncModalOpen(false);
  };

  const copyToClipboard = (text: string, type: "endpoint" | "payload") => {
    navigator.clipboard?.writeText(text);
    if (type === "endpoint") {
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    } else {
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-gray-950 dark:text-white">
                  Live Payment Sync & Auto-Ingestion Hub
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live Active
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                Automatic ledger entry whenever an online UPI, Card, or NetBanking spend occurs.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsLiveSyncModalOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Active Connector Channels */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-3">
              Connected Online Payment Streamers
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-gray-900 dark:text-white">Google Pay (GPay)</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Listening</span>
              </div>

              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-gray-900 dark:text-white">PhonePe</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Listening</span>
              </div>

              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-gray-900 dark:text-white">Paytm UPI / Bank</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Listening</span>
              </div>

              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-gray-900 dark:text-white">CRED / Amazon</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Listening</span>
              </div>

              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-gray-900 dark:text-white">Bank SMS Parser</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Listening</span>
              </div>

              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span className="font-bold text-gray-900 dark:text-white">Account Aggregator</span>
                </div>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">Synced</span>
              </div>
            </div>
          </div>

          {/* 1-Tap Live Simulation Triggers */}
          <div className="p-5 rounded-3xl bg-slate-950 text-white border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                1-Tap Live Incoming Payment Simulator
              </span>
              <span className="text-[10px] text-slate-400">Instant real-time test</span>
            </div>
            <p className="text-xs text-slate-300 font-medium">
              Click any sample payment below to test instant automatic ledger recording without manual input:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleQuickTrigger("GPay", 420, "Swiggy Restaurant", "cat-food")}
                className="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-left flex items-center justify-between text-xs transition-all cursor-pointer hover:border-emerald-500/50"
              >
                <div>
                  <span className="font-bold text-white block">GPay &bull; Swiggy Lunch</span>
                  <span className="text-[10px] text-slate-400">Food &bull; Auto-parsed</span>
                </div>
                <span className="text-sm font-black text-emerald-400">₹420</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickTrigger("PhonePe", 160, "Uber Auto Ride", "cat-transport")}
                className="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-left flex items-center justify-between text-xs transition-all cursor-pointer hover:border-emerald-500/50"
              >
                <div>
                  <span className="font-bold text-white block">PhonePe &bull; Uber Auto</span>
                  <span className="text-[10px] text-slate-400">Transport &bull; Auto-parsed</span>
                </div>
                <span className="text-sm font-black text-emerald-400">₹160</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickTrigger("Paytm", 850, "Blinkit Quick Groceries", "cat-groceries")}
                className="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-left flex items-center justify-between text-xs transition-all cursor-pointer hover:border-emerald-500/50"
              >
                <div>
                  <span className="font-bold text-white block">Paytm &bull; Blinkit Grocery</span>
                  <span className="text-[10px] text-slate-400">Groceries &bull; Auto-parsed</span>
                </div>
                <span className="text-sm font-black text-emerald-400">₹850</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickTrigger("HDFC", 2499, "Amazon India Order", "cat-shopping")}
                className="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-left flex items-center justify-between text-xs transition-all cursor-pointer hover:border-emerald-500/50"
              >
                <div>
                  <span className="font-bold text-white block">HDFC Card &bull; Amazon India</span>
                  <span className="text-[10px] text-slate-400">Shopping &bull; Auto-parsed</span>
                </div>
                <span className="text-sm font-black text-emerald-400">₹2,499</span>
              </button>
            </div>
          </div>

          {/* Custom Simulation Form */}
          <form onSubmit={handleSimulate} className="p-5 rounded-3xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 block">
              Simulate Custom Incoming Online Payment
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-gray-600 dark:text-slate-400 font-bold block mb-1">Provider App</label>
                <select
                  value={testProvider}
                  onChange={e => setTestProvider(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold"
                >
                  <option value="GPay">Google Pay (GPay UPI)</option>
                  <option value="PhonePe">PhonePe UPI</option>
                  <option value="Paytm">Paytm UPI / Wallet</option>
                  <option value="CRED">CRED Pay</option>
                  <option value="HDFC">HDFC Bank Debit Card</option>
                </select>
              </div>

              <div>
                <label className="text-gray-600 dark:text-slate-400 font-bold block mb-1">Amount (₹ INR)</label>
                <input
                  type="number"
                  value={testAmount}
                  onChange={e => setTestAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="text-gray-600 dark:text-slate-400 font-bold block mb-1">Merchant / Recipient Name</label>
                <input
                  type="text"
                  value={testMerchant}
                  onChange={e => setTestMerchant(e.target.value)}
                  placeholder="e.g. Starbucks, Zomato, Petrol Pump"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="text-gray-600 dark:text-slate-400 font-bold block mb-1">Category</label>
                <select
                  value={testCategory}
                  onChange={e => setTestCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>Simulate Real-Time Ingestion (Auto-Record)</span>
            </button>
          </form>

          {/* Webhook Developer Endpoint Information */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700/80 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Building className="w-4 h-4 text-indigo-500" />
                Live Webhook Ingestion API Endpoint
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(webhookEndpoint, "endpoint")}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
              >
                {copiedEndpoint ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedEndpoint ? "Copied" : "Copy URL"}
              </button>
            </div>
            <p className="text-[11px] font-mono bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 break-all">
              {webhookEndpoint}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">
              External SMS forwarding apps (like SMS to Webhook or Account Aggregator webhooks) can POST directly to this endpoint.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 flex justify-end">
          <button
            type="button"
            onClick={() => setIsLiveSyncModalOpen(false)}
            className="px-5 py-2.5 bg-slate-900 dark:bg-slate-700 hover:bg-black text-white font-bold text-xs rounded-2xl cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
