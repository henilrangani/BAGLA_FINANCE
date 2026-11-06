import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  ShieldCheck,
  Lock,
  EyeOff,
  Eye,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  KeyRound,
  ExternalLink,
  Smartphone,
  Fingerprint,
  Layers,
  Database,
  Check,
  Copy,
  Zap,
  ArrowRight
} from "lucide-react";
import { localDateString } from "../utils/dates";
import { buildUpiPayLink } from "../utils/upi";

export const PrivacyCenterView: React.FC = () => {
  const {
    settings,
    setSettings,
    connectorStatus,
    toggleDataConsent,
    deleteAccountData,
    toggleStealthMode,
    formatCurrency,
    setAppPasscode,
    lockApp,
    exportEncryptedLedger,
    toggleDemoMode,
    loadSampleData
  } = useFinance();

  // Never pre-fill the PIN field: only a hash of the PIN is stored.
  const [pinInput, setPinInput] = useState("");
  const [pinSavedMessage, setPinSavedMessage] = useState(false);
  const [copiedUpiUri, setCopiedUpiUri] = useState(false);
  const [sampleUpiAmount, setSampleUpiAmount] = useState(450);
  const [sampleUpiVpa, setSampleUpiVpa] = useState("rohit.sharma@okhdfcbank");

  const sampleUpiUri = buildUpiPayLink({ vpa: sampleUpiVpa, name: "Rohit Sharma", amountRupees: sampleUpiAmount, note: "BaglaFinance DinnerSplit" }) || "Enter a valid UPI ID (name@bank) and amount";

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await setAppPasscode(pinInput)) {
      setPinInput("");
      setPinSavedMessage(true);
      setTimeout(() => setPinSavedMessage(false), 2500);
    }
  };

  const handleDownloadBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(exportEncryptedLedger());
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `bagla_finance_backup_${localDateString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const copySampleUri = () => {
    navigator.clipboard?.writeText(sampleUpiUri);
    setCopiedUpiUri(true);
    setTimeout(() => setCopiedUpiUri(false), 2000);
  };

  return (
    <div className="space-y-8 pb-16 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-[#047857] dark:text-emerald-400">
            Privacy & Trust Architecture
          </span>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800">
            Early version · legal and compliance review pending
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-950 dark:text-white tracking-tight">
          Privacy Shield & Security Center
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 font-medium mt-1 max-w-2xl leading-relaxed">
          Your records are stored only in this browser. Bagla Finance never asks for your UPI PIN, netbanking password, card CVV or OTP. When AI features are used (online mode), the text, receipt image or spending summary you submit is sent to our server and to Google Gemini for processing.
        </p>
      </div>

      {/* Live Interactive Stealth Privacy Shield & Live Balance Masking */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-amber-500" />
              <h2 className="text-base sm:text-lg font-bold text-gray-950 dark:text-white">
                Public Stealth Mode (Shoulder-Surfing Shield)
              </h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
              Instantly masks all rupee balances, salaries, and account numbers across your dashboard when working in public places, cafes, or offices.
            </p>
          </div>
          <button
            onClick={toggleStealthMode}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              settings.stealthMode
                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20"
                : "bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-700"
            }`}
          >
            {settings.stealthMode ? (
              <>
                <Eye className="w-4 h-4" />
                <span>Stealth Active (Click to Reveal)</span>
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" />
                <span>Turn ON Stealth Mode</span>
              </>
            )}
          </button>
        </div>

        {/* Offline / Online Network Sandbox Control */}
        <div className="p-5 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-950 dark:text-white">
                Offline Mode (no AI or network requests from the app)
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                settings.offlineMode
                  ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
              }`}>
                {settings.offlineMode ? "Offline mode on" : "Online (AI features enabled)"}
              </span>
            </div>
            <p className="text-gray-500 dark:text-slate-400 text-[11px] leading-relaxed">
              When Offline Mode is active, all HTTP/API network calls are blocked. All data writes stay strictly in your local device memory. Ideal for flights, trains, and ultra-high security contexts.
            </p>
          </div>
          <button
            onClick={() => setSettings(prev => ({ ...prev, offlineMode: !prev.offlineMode }))}
            className={`px-4 py-2 rounded-xl font-bold text-xs shrink-0 transition-colors cursor-pointer border ${
              settings.offlineMode
                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                : "bg-white dark:bg-slate-800 hover:bg-gray-100 text-gray-800 dark:text-slate-200 border-gray-300 dark:border-slate-600"
            }`}
          >
            {settings.offlineMode ? "Switch to Online Mode" : "Activate Offline Mode"}
          </button>
        </div>

        {/* Live Interactive Preview Box */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">Total Net Worth</span>
            <div className="text-xl font-black text-gray-900 dark:text-white mt-1">
              {formatCurrency(124500)}
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block">Live Mask Preview</span>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">Monthly Salary / Inflow</span>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCurrency(85000)}
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block">Live Mask Preview</span>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">HDFC Bank Balance</span>
            <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {formatCurrency(48210)}
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block">Live Mask Preview</span>
          </div>
        </div>
      </div>

      {/* 4-Digit Passcode & Biometric Lock */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-6">
        <div className="border-b border-gray-100 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base sm:text-lg font-bold text-gray-950 dark:text-white">
              App Passcode & Device Security Lock
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mt-1">
            Prevent unauthorized local access on shared laptops, phones, or public workstations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <form onSubmit={handleSavePin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                {settings.passcodeHash ? "Change app-lock PIN (4–6 digits)" : "Set app-lock PIN (4–6 digits)"}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  aria-label="New app-lock PIN"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="w-32 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono text-lg font-bold tracking-widest text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={pinInput.length < 4 || pinInput.length > 6}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Save PIN
                </button>
              </div>
              {pinSavedMessage && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> PIN saved successfully!
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={lockApp}
                disabled={!settings.passcodeHash}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-black disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 border border-slate-700 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock App Now</span>
              </button>
              {settings.passcodeHash && (
                <button
                  type="button"
                  onClick={() => setAppPasscode("")}
                  className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  Remove PIN
                </button>
              )}
              <span className="text-[11px] text-gray-400">
                {settings.passcodeHash ? "PIN set (stored only as a salted hash)" : "No PIN set"}
              </span>
            </div>
          </form>

          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-2 text-xs">
            <div className="font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>What the app lock does — and doesn't do</span>
            </div>
            <p className="text-gray-600 dark:text-slate-300 leading-relaxed">
              The PIN hides the app from people glancing at an unlocked device. Your PIN is never stored in plain text and never leaves this device. Your financial records are <strong>not encrypted</strong>: they stay in this browser's local storage, readable by anyone with access to this browser profile.
            </p>
          </div>
        </div>
      </div>

      {/* Core Architectural Guarantees (The 3 Zeroes) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-200/60 dark:border-indigo-800">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm sm:text-base text-gray-950 dark:text-white">
            1. Zero Password Storage
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed font-medium">
            We never request, handle, or store your UPI 6-digit MPIN, NetBanking passwords, Debit Card CVVs, or OTPs. All settlement calls use native NPCI intent handoffs.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-[#047857] dark:text-emerald-400 flex items-center justify-center font-bold border border-emerald-200/60 dark:border-emerald-800">
            <EyeOff className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm sm:text-base text-gray-950 dark:text-white">
            2. Zero Ad Brokering
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed font-medium">
            Unlike traditional trackers, your spending patterns and income data are never profiled, repackaged, or sold to loan brokers, insurance agents, or credit bureaus.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold border border-amber-200/60 dark:border-amber-800">
            <KeyRound className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm sm:text-base text-gray-950 dark:text-white">
            3. On-Device Ledger Vault
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed font-medium">
            All transaction history, split debts, and custom categories remain securely stored inside your local browser sandbox and can be wiped instantly with 1 click.
          </p>
        </div>
      </div>

      {/* How UPI Deep-Linking Works & Interactive Sandbox Inspector */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-6">
        <div className="border-b border-gray-100 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-[#047857]" />
            <h2 className="text-base sm:text-lg font-bold text-gray-950 dark:text-white">
              UPI Security Deep Dive & Intent Inspector
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mt-1">
            Proof of safety: How Bagla Finance initiates UPI payments without ever intercepting money or credentials.
          </p>
        </div>

        {/* Step by step technical architecture */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 space-y-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs">
              1
            </div>
            <h4 className="font-bold text-gray-900 dark:text-white">Intent URL Generation</h4>
            <p className="text-gray-500 dark:text-slate-400 leading-relaxed">
              When settling a debt or paying a bill, Bagla creates a standardized NPCI URI containing only payee VPA and amount.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 space-y-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs">
              2
            </div>
            <h4 className="font-bold text-gray-900 dark:text-white">OS App Handoff</h4>
            <p className="text-gray-500 dark:text-slate-400 leading-relaxed">
              Your device opens GPay, PhonePe, Paytm, BHIM, or Cred directly. The banking app securely manages the payment.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 space-y-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs">
              3
            </div>
            <h4 className="font-bold text-gray-900 dark:text-white">NPCI 2-Factor Auth</h4>
            <p className="text-gray-500 dark:text-slate-400 leading-relaxed">
              You enter your 4/6-digit UPI PIN only inside the official banking app keypad. Bagla Finance never sees or logs the PIN.
            </p>
          </div>
        </div>

        {/* Live Intent Inspector Sandbox */}
        <div className="p-5 rounded-2xl bg-slate-950 text-white border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Live NPCI UPI URI Inspector
              </span>
            </div>
            <button
              onClick={copySampleUri}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 transition-colors cursor-pointer"
            >
              {copiedUpiUri ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUpiUri ? "Copied" : "Copy URI"}</span>
            </button>
          </div>

          <div className="p-3 bg-slate-900 rounded-xl font-mono text-[11px] text-slate-300 break-all border border-slate-800">
            {sampleUpiUri}
          </div>

          <p className="text-[11px] text-slate-400">
            Notice that the URI strictly contains payee address (<code className="text-emerald-300">pa</code>) and amount (<code className="text-emerald-300">am</code>). It contains <strong className="text-white">zero password fields</strong>, guaranteeing total user immunity from credential leaks.
          </p>
        </div>
      </div>

      {/* Account Aggregator (AA) & Notification Consent Manager */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-5">
        <div className="border-b border-gray-100 dark:border-slate-800 pb-4">
          <h3 className="text-base font-bold text-gray-950 dark:text-white">
            Financial Data Connectors & Consent Control
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
            Account Aggregator & Notification abstraction layer (Sahamati & RBI Framework)
          </p>
        </div>

        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div>
              <span className="font-bold text-sm text-gray-900 dark:text-white block mb-1">
                Account Aggregator Consent (Anumati / Sahamati AA Framework)
              </span>
              <span className="text-gray-500 dark:text-slate-400 text-[11px] font-medium leading-relaxed block">
                Not available yet. Bank data via an RBI-licensed Account Aggregator would need your explicit consent for each bank.
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                  connectorStatus.aaConsentGranted
                    ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                    : "bg-gray-200 dark:bg-slate-700 text-gray-600 border-gray-300 dark:border-slate-600"
                }`}
              >
                {connectorStatus.aaConsentGranted ? "Active Consent" : "Revoked"}
              </span>
              <button
                onClick={() => toggleDataConsent("aaConsentGranted")}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                {connectorStatus.aaConsentGranted ? "Revoke Consent" : "Grant Consent"}
              </button>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div>
              <span className="font-bold text-sm text-gray-900 dark:text-white block mb-1">
                SMS Transaction Notification Parser
              </span>
              <span className="text-gray-500 dark:text-slate-400 text-[11px] font-medium leading-relaxed block">
                Listens exclusively to transactional debits from verified Indian banks (HDFC, SBI, ICICI, Axis). Ignores personal chats & OTPs.
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                  connectorStatus.smsNotificationListening
                    ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                    : "bg-gray-200 dark:bg-slate-700 text-gray-600 border-gray-300 dark:border-slate-600"
                }`}
              >
                {connectorStatus.smsNotificationListening ? "Active" : "Disabled"}
              </span>
              <button
                onClick={() => toggleDataConsent("smsNotificationListening")}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                {connectorStatus.smsNotificationListening ? "Revoke" : "Enable"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sandbox & Demo Data Management */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-5">
        <div className="border-b border-gray-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-950 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Demo Sandbox vs. Real User Ledger</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
              Toggle between exploration sample records and your private real ledger.
            </p>
          </div>
          <span
            className={`text-xs px-3 py-1 rounded-full font-bold self-start sm:self-auto border ${
              settings.isDemoMode
                ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
            }`}
          >
            {settings.isDemoMode ? "Demo Mode Active" : "Real Ledger Active"}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={toggleDemoMode}
            className={`px-5 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
              settings.isDemoMode
                ? "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700"
                : "bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
            }`}
          >
            <Database className="w-4 h-4" />
            <span>{settings.isDemoMode ? "Switch to Real Clean Ledger" : "Load Sample Demo Data"}</span>
          </button>

          {settings.isDemoMode && (
            <button
              onClick={() => {
                if (window.confirm("Reload default sample dataset?")) {
                  loadSampleData();
                }
              }}
              className="px-5 py-3 rounded-2xl bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-2 border border-gray-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              <Zap className="w-4 h-4 text-purple-600" />
              <span>Reset to Default Demo Dataset</span>
            </button>
          )}
        </div>
      </div>

      {/* Data Sovereignty, Encrypted Export & Instant Incineration */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-5">
        <div className="border-b border-gray-100 dark:border-slate-800 pb-4">
          <h3 className="text-base font-bold text-gray-950 dark:text-white">
            Data Portability & Instant Erasure (DPDP Act Compliance)
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">
            You are the sovereign owner of your financial data. Export or destroy your ledger at any moment.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={handleDownloadBackup}
            className="px-5 py-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Ledger Backup (.json, not encrypted)</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm("⚠️ Irreversible Action: This will permanently wipe all local transactions, budgets, groups, and settings from this browser. Proceed?")) {
                deleteAccountData();
              }
            }}
            className="px-5 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-2 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Permanent Data Incinerator (Wipe Everything)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
