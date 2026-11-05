import React from "react";
import {
  X,
  PieChart,
  Repeat,
  Wallet,
  Users,
  BarChart3,
  ShieldCheck,
  Activity,
  SlidersHorizontal,
  ChevronRight
} from "lucide-react";

interface MoreDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: string) => void;
  currentTab: string;
}

export const MoreDrawerModal: React.FC<MoreDrawerModalProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  currentTab
}) => {
  if (!isOpen) return null;

  const moreItems = [
    { id: "budgets", label: "Budgets & Goals", desc: "Monthly limits & financial goals", icon: PieChart, color: "text-[#059669]" },
    { id: "subscriptions", label: "Recurring & Subs", desc: "Auto-renewals & bills", icon: Repeat, color: "text-purple-500" },
    { id: "cash", label: "Cash Wallet", desc: "Physical currency tracker", icon: Wallet, color: "text-amber-500" },
    { id: "family", label: "Family Space", desc: "Household shared budgets", icon: Users, color: "text-blue-500" },
    { id: "analytics", label: "Analytics & Health", desc: "Deep financial intelligence", icon: BarChart3, color: "text-teal-500" },
    { id: "account", label: "Account & Sync", desc: "Sign in, sync, move your data", icon: ShieldCheck, color: "text-emerald-600" },
    { id: "cloud", label: "Account features", desc: "Import, family sharing, support", icon: Users, color: "text-blue-600" },
    { id: "privacy", label: "Settings & Privacy", desc: "Data isolation & security vault", icon: ShieldCheck, color: "text-emerald-500" },
    { id: "admin", label: "Telemetry & Logs", desc: "Performance & system status", icon: Activity, color: "text-indigo-500" }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 border-t sm:border border-gray-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
          <h3 className="text-base font-black text-gray-900 dark:text-white">More Modules</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {moreItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl text-left transition-all cursor-pointer ${
                  isActive
                    ? "bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800"
                    : "bg-[#F4F6F8] dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200/60 dark:border-slate-700/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-700 shadow-xs">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">{item.label}</h4>
                    <p className="text-[10px] text-gray-400 font-medium">{item.desc}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
