import React from "react";
import { useFinance } from "../context/FinanceContext";
import {
  LayoutDashboard,
  Receipt,
  Plus,
  Users,
  MoreHorizontal
} from "lucide-react";

interface MobileBottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenMore: () => void;
}

/**
 * Mobile Bottom Navigation Bar matching Image 2:
 * [ Home ] [ Transactions ] [ (+) Central Green FAB ] [ Groups ] [ More ]
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  onOpenMore
}) => {
  const { setIsAddExpenseOpen } = useFinance();

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-gray-200/80 dark:border-slate-800 px-4 py-2 flex items-center justify-around shadow-2xl safe-area-pb">
      {/* Home */}
      <button
        onClick={() => setCurrentTab("dashboard")}
        className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors cursor-pointer ${
          currentTab === "dashboard"
            ? "text-[#047857] dark:text-emerald-400"
            : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
        }`}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span>Home</span>
      </button>

      {/* Transactions */}
      <button
        onClick={() => setCurrentTab("transactions")}
        className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors cursor-pointer ${
          currentTab === "transactions"
            ? "text-[#047857] dark:text-emerald-400"
            : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
        }`}
      >
        <Receipt className="w-5 h-5" />
        <span>Transactions</span>
      </button>

      {/* Central Floating Green + Button (prominent in Image 2) */}
      <div className="relative -top-5 flex flex-col items-center">
        <button
          onClick={() => setIsAddExpenseOpen(true)}
          className="w-13 h-13 rounded-full bg-[#047857] hover:bg-[#065f46] text-white flex items-center justify-center shadow-lg shadow-emerald-600/35 active:scale-95 transition-all border-4 border-[#F4F6F8] dark:border-slate-950 cursor-pointer"
          aria-label="Add Expense"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
      </div>

      {/* Groups */}
      <button
        onClick={() => setCurrentTab("groups")}
        className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors cursor-pointer ${
          currentTab === "groups"
            ? "text-[#047857] dark:text-emerald-400"
            : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
        }`}
      >
        <Users className="w-5 h-5" />
        <span>Groups</span>
      </button>

      {/* More (Budgets, Goals, Family, Analytics, Privacy) */}
      <button
        onClick={onOpenMore}
        className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors cursor-pointer ${
          ["budgets", "family", "subscriptions", "cash", "analytics", "privacy", "admin"].includes(
            currentTab
          )
            ? "text-[#047857] dark:text-emerald-400"
            : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
        }`}
      >
        <MoreHorizontal className="w-5 h-5" />
        <span>More</span>
      </button>
    </div>
  );
};
