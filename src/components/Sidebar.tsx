import React from "react";
import { useFinance } from "../context/FinanceContext";
import { BaglaLogo } from "./BaglaLogo";
import {
  LayoutDashboard,
  Receipt,
  Users,
  PieChart,
  Target,
  Repeat,
  BarChart3,
  Sparkles,
  Home,
  Settings,
  ChevronRight,
  ShieldCheck,
  Zap,
  ArrowRight,
  Cloud,
  UserRound
} from "lucide-react";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenLanding?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, onOpenLanding }) => {
  const { settings, setIsAiChatOpen } = useFinance();

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", label: "Transactions", icon: Receipt },
    { id: "groups", label: "Groups", icon: Users },
    { id: "budgets", label: "Budgets", icon: PieChart },
    { id: "goals", label: "Goals", icon: Target },
    { id: "subscriptions", label: "Recurring", icon: Repeat },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "ai_assistant", label: "AI Assistant", icon: Sparkles, badge: "AI" },
    { id: "family", label: "Family", icon: Home },
    { id: "cloud", label: "Account features", icon: Cloud },
    { id: "account", label: "Account & Sync", icon: UserRound },
    { id: "privacy", label: "Settings", icon: Settings }
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-gray-200/80 dark:border-slate-800 shrink-0 select-none min-h-screen">
      {/* Brand Header */}
      <div
        className="p-6 border-b border-gray-100 dark:border-slate-800/60 cursor-pointer"
        onClick={() => {
          setCurrentTab("dashboard");
        }}
      >
        <BaglaLogo variant="horizontal" size="md" showTagline={true} />
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive =
            currentTab === item.id ||
            (item.id === "ai_assistant" && false) ||
            false;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "ai_assistant") {
                  setIsAiChatOpen(true);
                } else {
                  setCurrentTab(item.id);
                }
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-[#E8F7F0] dark:bg-emerald-950/40 text-[#047857] dark:text-emerald-400 shadow-xs"
                  : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800/60 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? "text-[#047857] dark:text-emerald-400" : "text-gray-400 dark:text-slate-500"
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* (Removed a "Go Premium / Upgrade Now" card: no paid plans exist; see RELEASE_READINESS.) */}

      {/* User Profile Footer (as in Image 2) */}
      <div className="p-3.5 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between mx-2 mb-2 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        onClick={() => setCurrentTab("privacy")}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0B2240] to-[#047857] p-0.5 shadow-sm">
            <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center font-bold text-xs text-[#0B2240] dark:text-emerald-400">
              HB
            </div>
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-gray-900 dark:text-white leading-tight">
              {settings.name || "Your profile"}
            </div>
            <div className="text-[10px] text-[#047857] dark:text-emerald-400 font-semibold">
              Premium User
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </aside>
  );
};
