import React from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Bell,
  Moon,
  Sun,
  Plus,
  Sparkles,
  SlidersHorizontal,
  GraduationCap,
  Briefcase,
  Users,
  Compass,
  Laptop,
  Eye,
  EyeOff,
  ShieldCheck,
  Lock,
  Zap,
  Coins,
  Wifi,
  WifiOff,
  Database
} from "lucide-react";
import { ProfileType } from "../types";

interface TopHeaderProps {
  onOpenLanding?: () => void;
}

/**
 * Official Bagla Finance Desktop & Mobile Top Header
 */
export const TopHeader: React.FC<TopHeaderProps> = ({ onOpenLanding }) => {
  const {
    settings,
    setSettings,
    setIsAddExpenseOpen,
    setIsDailySummaryOpen,
    setIsAiChatOpen,
    setIsLiveSyncModalOpen,
    setIsNightlyCashModalOpen,
    anomalies,
    toggleStealthMode,
    toggleDemoMode,
    setCurrentTab
  } = useFinance();

  const now = new Date();
  const currentHour = now.getHours();
  const greeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 17
      ? "Good afternoon"
      : "Good evening";

  const toggleDarkMode = () => {
    setSettings(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  const toggleOfflineMode = () => {
    setSettings(prev => ({ ...prev, offlineMode: !prev.offlineMode }));
  };

  const personaLabels: Record<ProfileType, string> = {
    student: "Student Mode",
    professional: "Professional",
    family: "Family Head",
    traveller: "Traveller / Nomad",
    freelancer: "Freelancer / Pro"
  };

  const personaIcons: Record<ProfileType, React.ReactNode> = {
    student: <GraduationCap className="w-3.5 h-3.5 text-blue-500" />,
    professional: <Briefcase className="w-3.5 h-3.5 text-emerald-500" />,
    family: <Users className="w-3.5 h-3.5 text-amber-500" />,
    traveller: <Compass className="w-3.5 h-3.5 text-purple-500" />,
    freelancer: <Laptop className="w-3.5 h-3.5 text-teal-500" />
  };

  return (
    <header className="h-16 lg:h-18 px-4 sm:px-6 lg:px-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-200/80 dark:border-slate-800 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Left: Greeting (Desktop) / Mobile Mini Title */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span>{greeting}, {settings.name}</span>
            <span className="text-sm">👋</span>
          </h1>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium hidden sm:block">
            Every Rupee. Clearly Managed.
          </p>
        </div>

        {/* Live Network / Offline Mode Switcher */}
        <button
          onClick={toggleOfflineMode}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
            settings.offlineMode
              ? "bg-slate-800 text-amber-300 border-amber-500/40 hover:bg-slate-700"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
          }`}
          title={settings.offlineMode ? "Offline mode: the app makes no AI or network requests. Click to go online" : "Online: AI features enabled - Click to Switch to Offline"}
        >
          {settings.offlineMode ? (
            <>
              <WifiOff className="w-3 h-3 text-amber-400" />
              <span>Offline Vault</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Online</span>
            </>
          )}
        </button>

        {/* Demo / Real User Sandbox Switcher */}
        <button
          onClick={toggleDemoMode}
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
            settings.isDemoMode
              ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800/80 hover:bg-purple-100 dark:hover:bg-purple-900/50"
              : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900/50"
          }`}
          title={settings.isDemoMode ? "Demo Mode (Sample Data Loaded) - Click to switch to Real Private Ledger" : "Real Ledger Mode (Clean Data) - Click to load Demo Data"}
        >
          <Database className="w-3 h-3" />
          <span>{settings.isDemoMode ? "Demo Mode" : "Real Ledger"}</span>
        </button>
      </div>

      {/* Right: Controls & CTAs */}
      <div className="flex items-center gap-2">
        {/* Live Auto-Sync UPI Hub Button */}
        <button
          onClick={() => setIsLiveSyncModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors shadow-xs cursor-pointer"
          title="Payment sync demo (simulated — no bank or UPI app is connected)"
        >
          <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">Sync Demo</span>
        </button>

        {/* 10 PM Nightly Cash Logger Button */}
        <button
          onClick={() => setIsNightlyCashModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shadow-xs cursor-pointer"
          title="10:00 PM Nightly Cash Spend Checker"
        >
          <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className="hidden sm:inline">10 PM Cash</span>
        </button>

        {/* Persona Switcher (Desktop) */}
        <div className="relative group hidden xl:block">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200/80 dark:border-slate-700 cursor-pointer">
            {personaIcons[settings.profileType]}
            <span>{personaLabels[settings.profileType]}</span>
          </button>
          <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 py-1.5 hidden group-hover:block z-50 animate-fadeIn">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              User Persona
            </div>
            {(["student", "professional", "family", "traveller", "freelancer"] as ProfileType[]).map(
              p => (
                <button
                  key={p}
                  onClick={() => setSettings(prev => ({ ...prev, profileType: p }))}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                    settings.profileType === p
                      ? "bg-emerald-50 dark:bg-emerald-950/50 text-[#059669] dark:text-emerald-400 font-bold"
                      : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {personaIcons[p]}
                  <span>{personaLabels[p]}</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Privacy Stealth Shield Mode Toggle */}
        <button
          onClick={toggleStealthMode}
          className={`p-2.5 rounded-xl transition-all border cursor-pointer flex items-center gap-1.5 ${
            settings.stealthMode
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700/60 font-bold"
              : "text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 border-gray-200/80 dark:border-slate-700/80"
          }`}
          title={settings.stealthMode ? "Stealth Mode Active (Balances Masked) - Click to Reveal" : "Enable Stealth Mode (Mask Balances in Public)"}
        >
          {settings.stealthMode ? (
            <>
              <EyeOff className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-pulse" />
              <span className="text-[10px] font-bold hidden sm:inline text-amber-700 dark:text-amber-300">Stealth ON</span>
            </>
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>

        {/* Daily 11 PM Summary Bell */}
        <button
          onClick={() => setIsDailySummaryOpen(true)}
          className="relative p-2.5 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-gray-200/80 dark:border-slate-700/80 cursor-pointer"
          title="Daily 11 PM Financial Digest"
        >
          <Bell className="w-4 h-4" />
          {anomalies.length > 0 ? (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
          ) : (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#059669] rounded-full" />
          )}
        </button>

        {/* Ask AI quick pill */}
        <button
          onClick={() => setIsAiChatOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#0B2240] dark:text-white bg-[#F4F6F8] dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#059669]" />
          <span>Ask AI</span>
        </button>

        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2.5 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-gray-200/80 dark:border-slate-700/80 cursor-pointer"
          title="Toggle Theme"
        >
          {settings.darkMode ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {/* Primary CTA: + Add Expense */}
        <button
          id="btn-add-expense-header"
          onClick={() => setIsAddExpenseOpen(true)}
          className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-white bg-[#059669] hover:bg-[#047857] rounded-xl shadow-md shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Add Expense</span>
        </button>
      </div>
    </header>
  );
};

