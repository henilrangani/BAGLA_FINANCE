import React, { useMemo } from "react";
import { useFinance } from "../context/FinanceContext";
import { Shield, Users } from "lucide-react";
import { FamilySpaceAccount } from "./FamilySpaceAccount";
import { formatINR, sumRupees } from "../utils/money";

/**
 * Family Space. Signed in: the real, server-backed space (members, sharing, budgets,
 * goals, activity). On this device only: a private view of entries you marked
 * "Share with Family", with an honest note that inviting people needs an account.
 */
export const FamilyView: React.FC = () => {
  const { cloud } = useFinance();
  if (cloud.enabled && cloud.state !== "signed_out") return <FamilySpaceAccount />;
  return <DeviceFamilyView />;
};

const DeviceFamilyView: React.FC = () => {
  const { transactions, categories, setCurrentTab } = useFinance();
  const shared = useMemo(
    () => transactions.filter(t => t.isFamilyShared && t.type === "expense" && t.status !== "soft_deleted"),
    [transactions]);
  const total = sumRupees(shared.map(t => t.amount));
  const byCategory = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const t of shared) m.set(t.categoryId, [...(m.get(t.categoryId) || []), t.amount]);
    return [...m.entries()].map(([id, amounts]) => ({
      name: categories.find(c => c.id === id)?.name || "Other", amount: sumRupees(amounts),
    })).sort((a, b) => b.amount - a.amount);
  }, [shared, categories]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Family Space</span>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Household spending</h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium">
          On this device only. Entries you mark "Share with Family" are collected here.
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-start gap-3.5">
        <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-gray-700 dark:text-indigo-200 space-y-2">
          <p>
            To share with family members (invites, roles, shared budgets and goals), you need a Bagla account. Your
            entries stay private unless you choose to share one.
          </p>
          <button onClick={() => setCurrentTab("account")}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer">
            Sign in or create an account
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Entries marked "Share with Family" ({shared.length})</h3>
          {shared.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {shared.map(tx => (
                <div key={tx.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-sm text-gray-900 dark:text-white block">{tx.merchant || tx.description}</span>
                    <span className="text-gray-400 text-[11px]">{tx.date}</span>
                  </div>
                  <span className="font-black text-sm text-gray-900 dark:text-white">{formatINR(tx.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-6 text-center font-medium">
              Nothing marked yet. Turn on "Share with Family" when recording an expense.
            </p>
          )}
        </div>

        <div className="lg:col-span-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Total</h3>
          <p className="text-3xl font-black text-gray-900 dark:text-white">{formatINR(total)}</p>
          {byCategory.length > 0 && (
            <ul className="space-y-2 text-xs">
              {byCategory.map(c => (
                <li key={c.name} className="flex justify-between p-2.5 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60">
                  <span>{c.name}</span><strong>{formatINR(c.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-gray-400 flex gap-1.5"><Shield className="w-3.5 h-3.5 shrink-0" />Stored only in this browser.</p>
        </div>
      </div>
    </div>
  );
};
