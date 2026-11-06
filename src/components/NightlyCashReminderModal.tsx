import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Moon,
  X,
  Coins,
  CheckCircle2,
  Bell,
  Clock,
  Sparkles,
  Coffee,
  Car,
  ShoppingBag,
  Utensils,
  Plus,
  ArrowRight,
  ShieldCheck
} from "lucide-react";
import { parseRupeeInput } from "../utils/money";
import { CloseButton, Modal } from "./ui/Modal";

export const NightlyCashReminderModal: React.FC = () => {
  const {
    isNightlyCashModalOpen,
    setIsNightlyCashModalOpen,
    quickLogCash,
    cashWallet,
    settings,
    setSettings,
    categories
  } = useFinance();

  const [customAmount, setCustomAmount] = useState<number | string>("");
  const [customDesc, setCustomDesc] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("cat-food");
  const [reminderTime, setReminderTime] = useState(settings.nightlyCashReminderConfig?.time || "22:00");
  const [notificationStatus, setNotificationStatus] = useState<string>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const [successMessage, setSuccessMessage] = useState("");

  if (!isNightlyCashModalOpen) return null;

  const handleQuickLog = (amt: number, desc: string, catId: string) => {
    quickLogCash(amt, desc, catId);
    setSuccessMessage(`✅ Recorded ₹${amt} cash for ${desc}`);
    setTimeout(() => setSuccessMessage(""), 2500);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCash = parseRupeeInput(customAmount);
    if (parsedCash.ok === false) return;
    const amt = parsedCash.rupees;
    if (!amt || amt <= 0) return;
    const desc = customDesc.trim() || "Cash Expense";
    quickLogCash(amt, desc, selectedCategory);
    setCustomAmount("");
    setCustomDesc("");
    setSuccessMessage(`✅ Recorded ₹${amt} cash for ${desc}`);
    setTimeout(() => {
      setSuccessMessage("");
      setIsNightlyCashModalOpen(false);
    }, 1200);
  };

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const perm = await Notification.requestPermission();
      setNotificationStatus(perm);
      if (perm === "granted") {
        new Notification("🌙 Bagla Cash Reminder Enabled!", {
          body: "You will receive a gentle prompt every night at 10:00 PM to log offline cash spends."
        });
      }
    }
  };

  const handleSaveReminderTime = () => {
    setSettings(prev => ({
      ...prev,
      nightlyCashReminderConfig: {
        ...prev.nightlyCashReminderConfig,
        enabled: true,
        time: reminderTime,
        autoPromptInApp: true
      }
    }));
  };

  return (
    <Modal onClose={() => { setCustomAmount(""); setCustomDesc(""); setIsNightlyCashModalOpen(false); }} dirty={!successMessage && !!(String(customAmount).trim() || customDesc.trim())} labelledBy="nightly-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/75 backdrop-blur-sm animate-fadeIn">{close => (<>
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-800 bg-amber-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="nightly-title" className="font-black text-base text-gray-950 dark:text-white">
                  🌙 10:00 PM Nightly Cash Check
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  Daily Habit
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                Did you spend any physical cash today? Log it in seconds before sleeping.
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
          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Current Cash Wallet Status Card */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Coins className="w-5 h-5 text-amber-500" />
              <div>
                <span className="text-[11px] font-bold text-gray-500 dark:text-slate-400 block">
                  Estimated Physical Cash in Wallet
                </span>
                <span className="text-base font-black text-gray-900 dark:text-white">
                  ₹{cashWallet.currentBalance.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <span className="text-[10px] text-gray-400 font-medium">Auto-adjusts with spends</span>
          </div>

          {/* 1-Tap Quick Cash Spends Chips */}
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2.5">
              1-Tap Common Daily Cash Spends
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickLog(20, "Chai & Biscuits", "cat-food")}
                className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-gray-200 dark:border-slate-700 hover:border-amber-300 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <Coffee className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-black text-gray-900 dark:text-white">₹20</span>
                </div>
                <span className="text-[11px] font-bold text-gray-700 dark:text-slate-300">Chai & Snack</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLog(60, "Auto / Rickshaw fare", "cat-transport")}
                className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-gray-200 dark:border-slate-700 hover:border-amber-300 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <Car className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-black text-gray-900 dark:text-white">₹60</span>
                </div>
                <span className="text-[11px] font-bold text-gray-700 dark:text-slate-300">Auto / Bus</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLog(180, "Sabzi Market / Veggies", "cat-groceries")}
                className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-gray-200 dark:border-slate-700 hover:border-amber-300 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-black text-gray-900 dark:text-white">₹180</span>
                </div>
                <span className="text-[11px] font-bold text-gray-700 dark:text-slate-300">Local Sabzi</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLog(75, "Milk & Dairy packet", "cat-groceries")}
                className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-gray-200 dark:border-slate-700 hover:border-amber-300 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <Coins className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-black text-gray-900 dark:text-white">₹75</span>
                </div>
                <span className="text-[11px] font-bold text-gray-700 dark:text-slate-300">Milk / Bread</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLog(150, "Street Food & Dinner", "cat-food")}
                className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-gray-200 dark:border-slate-700 hover:border-amber-300 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <Utensils className="w-3.5 h-3.5 text-rose-600" />
                  <span className="font-black text-gray-900 dark:text-white">₹150</span>
                </div>
                <span className="text-[11px] font-bold text-gray-700 dark:text-slate-300">Street Food</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLog(50, "Parking / Toll tip", "cat-transport")}
                className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-gray-200 dark:border-slate-700 hover:border-amber-300 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-black text-gray-900 dark:text-white">₹50</span>
                </div>
                <span className="text-[11px] font-bold text-gray-700 dark:text-slate-300">Parking / Tip</span>
              </button>
            </div>
          </div>

          {/* Custom Cash Entry Form */}
          <form onSubmit={handleCustomSubmit} className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 block">
              Log Other Cash Amount
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="text-gray-500 dark:text-slate-400 font-bold block mb-1">Amount (₹)</label>
                <input
                  type="number"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  placeholder="e.g. 350"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="text-gray-500 dark:text-slate-400 font-bold block mb-1">Description</label>
                <input
                  type="text"
                  value={customDesc}
                  onChange={e => setCustomDesc(e.target.value)}
                  placeholder="e.g. Laundry, Medicine"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="text-gray-500 dark:text-slate-400 font-bold block mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-semibold"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={!customAmount}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-amber-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Cash Expense</span>
            </button>
          </form>

          {/* Browser Notification Permissions & Custom Time */}
          <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 dark:text-slate-400 font-bold">Reminder Time:</span>
              <input
                type="time"
                value={reminderTime}
                onChange={e => {
                  setReminderTime(e.target.value);
                  handleSaveReminderTime();
                }}
                className="px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-bold"
              />
            </div>

            {notificationStatus !== "granted" ? (
              <button
                type="button"
                onClick={requestNotificationPermission}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Enable 10 PM Desktop Alert</span>
              </button>
            ) : (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 10 PM Browser Alerts Active
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 flex items-center justify-between">
          <span className="text-[11px] text-gray-400 font-medium">No cash spent today? Simply close.</span>
          <button
            type="button"
            onClick={close}
            className="px-5 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-black text-white font-bold text-xs rounded-xl cursor-pointer"
          >
            All Done for Today
          </button>
        </div>
      </div>
    </>)}</Modal>
  );
};
