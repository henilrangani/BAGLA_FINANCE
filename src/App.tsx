import React, { useState } from "react";
import { FinanceProvider, useFinance } from "./context/FinanceContext";
import { Sidebar } from "./components/Sidebar";
import { TopHeader } from "./components/TopHeader";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { MoreDrawerModal } from "./components/MoreDrawerModal";
import { FooterBrandBanner } from "./components/FooterBrandBanner";
import { LandingPage } from "./components/LandingPage";

import { DashboardView } from "./views/DashboardView";
import { TransactionsView } from "./views/TransactionsView";
import { GroupsView } from "./views/GroupsView";
import { FamilyView } from "./views/FamilyView";
import { BudgetsGoalsView } from "./views/BudgetsGoalsView";
import { SubscriptionsView } from "./views/SubscriptionsView";
import { CashWalletView } from "./views/CashWalletView";
import { AnalyticsView } from "./views/AnalyticsView";
import { PrivacyCenterView } from "./views/PrivacyCenterView";
import { AdminDashboardView } from "./views/AdminDashboardView";
import { AccountSyncView } from "./views/AccountSyncView";
import { CloudHubView } from "./views/CloudHubView";

import { FastAddExpenseModal } from "./components/FastAddExpenseModal";
import { VoiceExpenseModal } from "./components/VoiceExpenseModal";
import { ReceiptScannerModal } from "./components/ReceiptScannerModal";
import { DailySummaryModal } from "./components/DailySummaryModal";
import { BaglaAiChat } from "./components/BaglaAiChat";
import { LivePaymentSyncBanner } from "./components/LivePaymentSyncBanner";
import { LivePaymentHubModal } from "./components/LivePaymentHubModal";
import { NightlyCashReminderModal } from "./components/NightlyCashReminderModal";
import { Lock, ShieldCheck } from "lucide-react";

function AppLockScreen() {
  const { settings, unlockApp } = useFinance();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    const result = await unlockApp(pin);
    setChecking(false);
    if (!result.ok) {
      setPin("");
      setError(
        result.retryInMs
          ? `Too many wrong attempts. Try again in ${Math.ceil(result.retryInMs / 1000)} seconds.`
          : "Incorrect PIN"
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white font-sans">
      <div className="w-full max-w-sm p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-[#047857]/15 text-[#047857] mx-auto flex items-center justify-center border border-[#047857]/30 shadow-lg">
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight text-white">Bagla Security Vault</h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">Enter your PIN to open the app</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            aria-label="App lock PIN"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            placeholder="••••"
            className={`w-40 mx-auto px-4 py-3 rounded-2xl bg-slate-800 border text-center font-mono text-2xl font-bold tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-[#047857] ${
              error ? "border-rose-500 bg-rose-950/20 text-rose-300" : "border-slate-700"
            }`}
          />
          {error && <p role="alert" className="text-xs text-rose-400 font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={pin.length < 4 || checking}
            className="w-full py-3.5 bg-[#047857] hover:bg-[#065f46] disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition-all shadow-lg shadow-emerald-600/25 cursor-pointer"
          >
            Unlock Ledger
          </button>
        </form>

        <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Privacy screen only &bull; data is stored unencrypted on this device</span>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const {
    currentTab,
    setCurrentTab,
    settings,
    cloud
  } = useFinance();

  const [showLanding, setShowLanding] = useState(false);
  const [isMoreModalOpen, setIsMoreModalOpen] = useState(false);

  // Only lock when a PIN actually exists (no default PIN to fall back on).
  if (settings.isAppLocked && settings.passcodeHash) {
    return <AppLockScreen />;
  }

  if (showLanding) {
    return <LandingPage onStart={() => setShowLanding(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8] dark:bg-slate-950 text-gray-900 dark:text-white transition-colors flex font-sans">
      {/* Desktop Left Sidebar (Image 2) */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenLanding={() => setShowLanding(true)}
      />

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header Bar */}
        <TopHeader onOpenLanding={() => setShowLanding(true)} />

        {/* View Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-12">
          {cloud.enabled && ["offline", "error", "signed_out"].includes(cloud.state) && currentTab !== "account" && (
            <button
              onClick={() => setCurrentTab("account")}
              role="status"
              className={`w-full mb-4 px-4 py-2.5 rounded-2xl text-xs font-bold text-left cursor-pointer border ${
                cloud.state === "offline"
                  ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200"
                  : "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200"
              }`}
            >
              {cloud.state === "offline"
                ? `Offline: ${cloud.pending} change(s) saved on this device will sync when you're back online.`
                : cloud.state === "signed_out"
                  ? "Your session ended. Tap to sign in again; your changes are kept."
                  : `Sync problem: ${cloud.message || "tap for details"}`}
            </button>
          )}
          {currentTab === "dashboard" && <DashboardView />}
          {currentTab === "transactions" && <TransactionsView />}
          {currentTab === "groups" && <GroupsView />}
          {currentTab === "family" && <FamilyView />}
          {(currentTab === "budgets" || currentTab === "goals") && (
            // Same screen; the sidebar's "Goals" opens it on the Goals tab.
            <BudgetsGoalsView key={currentTab} initialSubTab={currentTab === "goals" ? "goals" : "budgets"} />
          )}
          {currentTab === "subscriptions" && <SubscriptionsView />}
          {currentTab === "cash" && <CashWalletView />}
          {currentTab === "analytics" && <AnalyticsView />}
          {currentTab === "privacy" && <PrivacyCenterView />}
          {currentTab === "admin" && <AdminDashboardView />}
          {currentTab === "account" && <AccountSyncView />}
          {currentTab === "cloud" && <CloudHubView />}

          {/* Footer Brand Feature Banner (Image 2) */}
          <FooterBrandBanner />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Image 2) */}
      <MobileBottomNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenMore={() => setIsMoreModalOpen(true)}
      />

      {/* Mobile More Navigation Drawer */}
      <MoreDrawerModal
        isOpen={isMoreModalOpen}
        onClose={() => setIsMoreModalOpen(false)}
        onSelectTab={setCurrentTab}
        currentTab={currentTab}
      />

      {/* Global Modals & AI Drawers */}
      <LivePaymentSyncBanner />
      <LivePaymentHubModal />
      <NightlyCashReminderModal />
      <FastAddExpenseModal />
      <VoiceExpenseModal />
      <ReceiptScannerModal />
      <DailySummaryModal />
      <BaglaAiChat />
    </div>
  );
}

export default function App() {
  return (
    <FinanceProvider>
      <MainApp />
    </FinanceProvider>
  );
}
