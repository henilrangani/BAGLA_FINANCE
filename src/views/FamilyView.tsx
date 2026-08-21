import React, { useState } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Users,
  Shield,
  Plus,
  Lock,
  Eye,
  EyeOff,
  Home,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  PieChart,
  UserCheck
} from "lucide-react";

export const FamilyView: React.FC = () => {
  const { familySpace, transactions, categories, settings } = useFinance();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"admin" | "member" | "viewer">("member");

  // Shared family transactions
  const familyTransactions = transactions.filter(t => t.isFamilyShared);
  const familyTotalSpend = familyTransactions.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              Household Space
            </span>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
              Active Sync
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {familySpace.name}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium">
            Collaborative household expense management with strict personal privacy boundaries
          </p>
        </div>

        <button
          onClick={() => setIsInviteOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/25 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Add Family Member</span>
        </button>
      </div>

      {/* Privacy Guarantee Bento Card */}
      <div className="p-5 rounded-3xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-start gap-3.5 shadow-xs">
        <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-gray-900 dark:text-indigo-200 space-y-1">
          <span className="font-bold text-sm text-indigo-900 dark:text-indigo-200 block">Privacy Guarantee</span>
          <p className="text-gray-600 dark:text-indigo-300/90 leading-relaxed font-medium">
            Only expenses marked as <strong>“Share with Family”</strong> (such as electricity, groceries, house rent) are visible to members. Personal transactions remain 100% private to you.
          </p>
        </div>
      </div>

      {/* Family Stats & Members Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Cols: Members & Permissions */}
        <div className="lg:col-span-8 p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Household Members</h3>
              <p className="text-xs text-gray-500 font-medium">Manage members and shared billing permissions</p>
            </div>
            <span className="text-xs text-gray-500 font-semibold px-2.5 py-1 rounded-full bg-[#F2F4F7] dark:bg-slate-800">
              {familySpace.members.length} active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {familySpace.members.map(member => (
              <div
                key={member.id}
                className="p-4 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                      {member.name} {member.id === "mem-dev" ? "(You)" : ""}
                    </h4>
                    <span className="text-[11px] text-gray-400 capitalize font-medium">{member.role}</span>
                  </div>
                </div>

                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                  Active
                </span>
              </div>
            ))}
          </div>

          {/* Shared Household Spending List */}
          <div className="pt-6 border-t border-gray-100 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
              Shared Household Expenses ({familyTransactions.length})
            </h4>

            {familyTransactions.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {familyTransactions.map(tx => (
                  <div key={tx.id} className="py-3.5 flex items-center justify-between text-xs hover:bg-[#F2F4F7]/40 dark:hover:bg-slate-800/40 transition-colors px-2 rounded-xl">
                    <div>
                      <span className="font-bold text-sm text-gray-900 dark:text-white block">
                        {tx.merchant || tx.description}
                      </span>
                      <span className="text-gray-400 text-[11px] font-medium">{tx.date} • {tx.paymentMethod.toUpperCase()}</span>
                    </div>
                    <span className="font-black text-sm text-gray-900 dark:text-white">
                      ₹{tx.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-6 text-center font-medium">
                No shared family expenses recorded yet. Toggle "Share with Family" when recording an expense.
              </p>
            )}
          </div>
        </div>

        {/* Right 4 Cols: Summary & Budget Pool */}
        <div className="lg:col-span-4 p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-5">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Household Spend Pool</h3>

          <div className="p-6 rounded-3xl bg-slate-900 text-white space-y-2 border border-slate-800 shadow-xs">
            <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">
              Month Shared Total
            </span>
            <span className="text-3xl font-black text-white block tracking-tight">
              ₹{familyTotalSpend.toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-slate-400 font-medium block">
              Electricity, Groceries, WiFi & Maintenance
            </span>
          </div>

          <div className="space-y-3 text-xs pt-2">
            <div className="flex justify-between items-center p-3 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 text-gray-700 dark:text-slate-300">
              <span className="font-medium">Grocery Pool</span>
              <span className="font-bold text-gray-900 dark:text-white">₹12,400</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 text-gray-700 dark:text-slate-300">
              <span className="font-medium">Utility Bills</span>
              <span className="font-bold text-gray-900 dark:text-white">₹3,850</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-2xl bg-[#F2F4F7] dark:bg-slate-800/60 text-gray-700 dark:text-slate-300">
              <span className="font-medium">Home Maintenance</span>
              <span className="font-bold text-gray-900 dark:text-white">₹1,500</span>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Member Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 p-6 space-y-4 text-xs shadow-2xl">
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Add Family Member</h3>

            <div className="space-y-3.5">
              <div>
                <label className="text-gray-500 font-bold block mb-1">Member Name *</label>
                <input
                  type="text"
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  placeholder="e.g. Suman Bagla (Mother)"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-gray-500 font-bold block mb-1">Access Role</label>
                <select
                  value={newMemberRole}
                  onChange={e => setNewMemberRole(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-semibold outline-none cursor-pointer"
                >
                  <option value="member">Member (Can add shared bills)</option>
                  <option value="admin">Admin (Full household manager)</option>
                  <option value="viewer">Viewer (Read-only view)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 font-bold text-gray-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsInviteOpen(false);
                    setNewMemberName("");
                  }}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-md cursor-pointer"
                >
                  Send Invite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
