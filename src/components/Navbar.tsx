import React from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Sparkles,
  Sun,
  Moon,
  Mic,
  FileText,
  Plus,
  Bell,
  SlidersHorizontal,
  GraduationCap,
  Briefcase,
  Users,
  Compass,
  Building,
  ShieldCheck,
  Zap,
  WifiOff,
  LayoutDashboard,
  Receipt,
  Home,
  PieChart,
  Repeat,
  Wallet,
  BarChart3,
  Shield,
  Layers
} from "lucide-react";
import { ProfileType } from "../types";

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  setShowLanding: (show: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, setShowLanding }) => {
  const {
    settings,
    setSettings,
    setIsAddExpenseOpen,
    setIsVoiceModalOpen,
    setIsReceiptModalOpen,
    setIsDailySummaryOpen,
    setIsAiChatOpen,
    anomalies,
    isOnline
  } = useFinance();

  const handleProfileChange = (newProfile: ProfileType) => {
    setSettings(prev => ({ ...prev, profileType: newProfile }));
  };

  const handleAccessibilityChange = (mode: "default" | "child_friendly" | "elder_friendly" | "pro") => {
    setSettings(prev => ({ ...prev, accessibilityMode: mode }));
  };

  const toggleDarkMode = () => {
    setSettings(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  const personaIcons: Record<ProfileType, React.ReactNode> = {
    student: <GraduationCap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
    professional: <Briefcase className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />,
    family: <Users className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
    traveller: <Compass className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />,
    freelancer: <Building className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
  };

  const personaLabels: Record<ProfileType, string> = {
    student: "Student",
    professional: "Professional",
    family: "Family",
    traveller: "Traveller",
    freelancer: "Freelancer"
  };

  const navTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", label: "Ledger", icon: Receipt },
    { id: "groups", label: "Goa Trip", icon: Users },
    { id: "family", label: "Family Space", icon: Home },
    { id: "budgets", label: "Budgets & Sim", icon: PieChart },
    { id: "subscriptions", label: "Recurring", icon: Repeat },
    { id: "cash", label: "Cash Wallet", icon: Wallet },
    { id: "analytics", label: "Intelligence", icon: BarChart3 },
    { id: "privacy", label: "Trust Center", icon: ShieldCheck }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 transition-colors">
      {!isOnline && (
        <div className="bg-amber-500 text-slate-900 text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5" />
          <span>You're offline. Changes are kept on this device; in a signed-in account they sync when you're back online.</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & Brand */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none shrink-0"
            onClick={() => {
              setCurrentTab("dashboard");
              setShowLanding(false);
            }}
          >
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white font-black text-lg transition-transform hover:scale-105">
              ₹
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-base sm:text-lg text-gray-900 dark:text-white">
                  BAGLA <span className="text-indigo-600 dark:text-indigo-400">FINANCE</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Bento MVP
                </span>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-slate-400 hidden sm:block font-medium">
                Every Rupee. Clearly Managed.
              </p>
            </div>
          </div>

          {/* Persona Switcher & Accessibility Controls */}
          <div className="hidden xl:flex items-center gap-2 bg-gray-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-gray-200/80 dark:border-slate-700/80">
            {/* Persona Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-xl bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-200 shadow-xs border border-gray-200 dark:border-slate-600">
                {personaIcons[settings.profileType]}
                <span>{personaLabels[settings.profileType]}</span>
              </button>
              <div className="absolute left-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 py-1.5 hidden group-hover:block z-50 animate-fadeIn">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  User Persona
                </div>
                {(["student", "professional", "family", "traveller", "freelancer"] as ProfileType[]).map(p => (
                  <button
                    key={p}
                    onClick={() => handleProfileChange(p)}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                      settings.profileType === p
                        ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold"
                        : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    {personaIcons[p]}
                    <span>{personaLabels[p]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Accessibility Mode */}
            <div className="relative group">
              <button className="px-2.5 py-1 text-xs font-medium rounded-xl text-gray-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors">
                <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
                <span className="capitalize">{settings.accessibilityMode.replace("_", " ")}</span>
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 py-1.5 hidden group-hover:block z-50 animate-fadeIn">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Accessibility Mode
                </div>
                {[
                  { id: "default", label: "Standard UI" },
                  { id: "child_friendly", label: "👶 Child Friendly" },
                  { id: "elder_friendly", label: "👓 Elder Friendly" },
                  { id: "pro", label: "⚡ Pro Mode" }
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleAccessibilityChange(m.id as any)}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      settings.accessibilityMode === m.id
                        ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold"
                        : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Systems Normal Status Pill */}
            <div className="hidden lg:flex bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 items-center gap-2 text-xs font-semibold text-gray-700 dark:text-slate-300 shadow-xs">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
              <span>Systems Online</span>
            </div>

            {/* Daily 11 PM Summary Button */}
            <button
              onClick={() => setIsDailySummaryOpen(true)}
              className="relative p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-gray-200/80 dark:border-slate-700"
              title="View Daily 11 PM Financial Summary"
            >
              <Bell className="w-4 h-4" />
              {anomalies.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
              )}
            </button>

            {/* Ask Bagla AI */}
            <button
              onClick={() => setIsAiChatOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors shadow-xs"
              title="Ask Bagla AI"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden sm:inline">Ask AI</span>
            </button>

            {/* Voice Input Quick Action */}
            <button
              onClick={() => setIsVoiceModalOpen(true)}
              className="p-2 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-gray-200 dark:border-slate-700"
              title="Add Expense by Voice"
            >
              <Mic className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </button>

            {/* Scan Receipt Quick Action */}
            <button
              onClick={() => setIsReceiptModalOpen(true)}
              className="p-2 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-gray-200 dark:border-slate-700"
              title="Scan a bill"
            >
              <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-gray-200 dark:border-slate-700"
              title="Toggle Theme"
            >
              {settings.darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-600" />}
            </button>

            {/* Primary CTA: New Entry */}
            <button
              id="btn-add-expense-main"
              onClick={() => setIsAddExpenseOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/25 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span className="font-extrabold whitespace-nowrap">New Entry +</span>
            </button>
          </div>
        </div>

        {/* Bento Subnav Navigation Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-2 scrollbar-none border-t border-gray-100 dark:border-slate-800/80">
          {navTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setCurrentTab(tab.id);
                  setShowLanding(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs shadow-indigo-600/20"
                    : "text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-gray-400 dark:text-slate-500"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
