import React, { useState, useMemo } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Users,
  Plus,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Check,
  Sparkles,
  QrCode,
  X,
  Share2,
  Trash2,
  Wallet,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  Info,
  DollarSign,
  Copy,
  ExternalLink,
  SlidersHorizontal,
  ChevronDown
} from "lucide-react";
import { SplitType, GroupExpense, Group } from "../types";
import { GROUP_TEMPLATES, computeGroupNetRupees } from "../services/data";
import { buildUpiPayLink } from "../utils/upi";
import confetti from "canvas-confetti";
import { localDateString } from "../utils/dates";
import { formatINR, normalizeRupees, parseRupeeInput, safeRupees, splitRupeesEqually, subtractRupees, sumRupees, toPaise } from "../utils/money";
import { describeVoid, previewRemoteVoid, type VoidPreview } from "../api/groups";
import { GroupMemberToolbar, JoinGroupDialog, MemberCardActions } from "../components/GroupMembersPanel";
import { GroupSetupDialog, groupTypeLabel, type GroupSetupValues } from "../components/groups/GroupSetupDialog";
import { GroupExpenseDialog } from "../components/groups/GroupExpenseDialog";
import { parsePaiseInput } from "../utils/split";
import type { GroupType, PaymentMethod } from "../types";
import { CloseButton, Modal } from "../components/ui/Modal";

export const GroupsView: React.FC = () => {
  const {
    groups,
    selectedGroupId,
    setSelectedGroupId,
    addGroupExpense,
    deleteGroupExpense,
    settleGroupPayment,
    markSettlementPaid,
    createGroup,
    updateGroup,
    renameGroupMember,
    categories,
    deleteGroup,
    generateWhatsAppSummary,
    settings,
    cloud,
    transactions,
    addGroupMember,
    refreshGroups,
    linkGroupLedger,
    editGroupExpense,
    undoGroupSettlement
  } = useFinance();
  const [editing, setEditing] = useState<{ id: string; description: string; amount: string } | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [rowBusy, setRowBusy] = useState("");
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const accountMode = cloud.enabled && cloud.state !== "signed_out";
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const joinDialog = isJoinOpen && <JoinGroupDialog onClose={() => setIsJoinOpen(false)} refresh={refreshGroups} />;

  const [activeTab, setActiveTab] = useState<"overview" | "expenses" | "members">("overview");
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [setupInitial, setSetupInitial] = useState<Partial<GroupSetupValues>>({});
  const [isEditGroupOpen, setIsEditGroupOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>("upi");
  const [settleError, setSettleError] = useState("");
  const openNewGroup = (initial: Partial<GroupSetupValues> = {}) => { setSetupInitial(initial); setIsNewGroupOpen(true); };
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Settlement QR Modal State
  const [settleModalData, setSettleModalData] = useState<{
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    amount: number;
    upiId?: string;
    settlementId?: string;
  } | null>(null);

  // New Group Form State
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupEmoji, setNewGroupEmoji] = useState("🏖️");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupBudget, setNewGroupBudget] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState("");

  // Add Expense Form State
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("cat-food");
  const [paidByMemberId, setPaidByMemberId] = useState("");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

  // Current active group (fallback to first group or null)
  const activeGroup = useMemo(() => {
    return groups.find(g => g.id === selectedGroupId) || groups[0] || null;
  }, [groups, selectedGroupId]);

  // Current logged in user in this group
  const currentUserMember = useMemo(() => {
    if (!activeGroup) return null;
    return activeGroup.members.find(m => m.isCurrentUser) || activeGroup.members[0];
  }, [activeGroup]);

  // Initialize selected participants when activeGroup changes
  React.useEffect(() => {
    if (activeGroup) {
      setSelectedParticipants(activeGroup.members.map(m => m.id));
      // Reset when the payer isn't in this group (another group, or ids replaced by the server's).
      if (currentUserMember && !activeGroup.members.some(m => m.id === paidByMemberId)) {
        setPaidByMemberId(currentUserMember.id);
      }
    }
  }, [activeGroup, currentUserMember]);

  // Mathematical calculations for active group
  const groupStats = useMemo(() => {
    if (!activeGroup) {
      return {
        totalSpend: 0,
        perPersonSpend: 0,
        youPaid: 0,
        yourShare: 0,
        netBalance: 0,
        memberBalances: []
      };
    }

    // All figures come from the paise-exact settlement engine, so every
    // member's share adds up to the expense total and balances sum to zero.
    const totalSpend = sumRupees(activeGroup.expenses.map(exp => exp.amount));
    const memberCount = Math.max(activeGroup.members.length, 1);
    const perPersonSpend = normalizeRupees(totalSpend / memberCount); // display average only

    const currentId = currentUserMember?.id || "";
    // Net from expenses only (paid - consumed) and outstanding net (after paid settlements).
    const expenseNet = computeGroupNetRupees({ ...activeGroup, settlements: [] });
    const outstandingNet = computeGroupNetRupees(activeGroup);
    const paidBy = (memberId: string) =>
      sumRupees(activeGroup.expenses.filter(exp => exp.paidByMemberId === memberId).map(exp => exp.amount));

    const youPaid = paidBy(currentId);
    const yourShare = subtractRupees(youPaid, expenseNet[currentId] || 0);
    const netBalance = outstandingNet[currentId] || 0;

    // Balances for all members
    const memberBalances = activeGroup.members.map(member => {
      const paid = paidBy(member.id);
      const consumed = subtractRupees(paid, expenseNet[member.id] || 0);
      return {
        member,
        paid,
        consumed,
        net: outstandingNet[member.id] || 0
      };
    });

    return {
      totalSpend,
      perPersonSpend,
      youPaid,
      yourShare,
      netBalance,
      memberBalances
    };
  }, [activeGroup, currentUserMember]);

  React.useEffect(() => {
    if (settleModalData) {
      setSettleAmount(settleModalData.amount.toFixed(2));
      setSettleMethod("upi");
      setSettleError("");
    }
  }, [settleModalData]);

  // Handle WhatsApp Copy
  const handleCopyWhatsApp = () => {
    if (!activeGroup) return;
    const text = generateWhatsAppSummary(activeGroup.id);
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  // Handle Settlement Payment Confirmation
  const fullSettlePaise = settleModalData ? Math.round(settleModalData.amount * 100) : 0;
  const settlePaise = parsePaiseInput(settleAmount);
  const handleConfirmSettlement = () => {
    if (!activeGroup || !settleModalData) return;
    if (settlePaise === null || settlePaise <= 0) { setSettleError("Enter the amount that was paid, like 500 or 499.50."); return; }
    if (settlePaise > fullSettlePaise) {
      setSettleError(`That's more than the ₹${(fullSettlePaise / 100).toFixed(2)} outstanding. Record only what was actually paid.`);
      return;
    }
    setSettleError("");
    if (settleModalData.settlementId && settlePaise === fullSettlePaise) {
      markSettlementPaid(activeGroup.id, settleModalData.settlementId, settleMethod);
    } else {
      // A partial payback is recorded as its own payment; what's left stays outstanding.
      settleGroupPayment(activeGroup.id, settleModalData.fromId, settleModalData.toId, settlePaise / 100, settleMethod);
    }

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch {}

    setSettleModalData(null);
  };

  // Delete (void) a group expense, explaining the financial effect first.
  const handleDeleteExpense = async (exp: GroupExpense) => {
    if (!activeGroup) return;
    const nameOf = (id: string) => [...activeGroup.members, ...(activeGroup.formerMembers || [])]
      .find(m => m.id === id)?.name || "A former member";
    if (cloud.enabled && cloud.state !== "signed_out") {
      let pv: VoidPreview;
      try {
        pv = await previewRemoteVoid(activeGroup.id, exp.id);
      } catch (e) {
        window.alert(`Couldn't check this expense right now (${(e as Error).message}). Nothing was changed.`);
        return;
      }
      if (pv.blocker) { window.alert(pv.blocker); return; }
      if (!pv.can_void) { window.alert("Only the person who added this expense or a group admin can delete it."); return; }
      if (!window.confirm(describeVoid(exp.description, pv, nameOf))) return;
      deleteGroupExpense(activeGroup.id, exp.id, { confirmBalanceChange: pv.balance_flips.length > 0 });
      return;
    }
    const paid = activeGroup.settlements.filter(st => st.status !== "suggested").length;
    const lines = [`Delete "${exp.description}" (${formatINR(exp.amount)})? Everyone's balances will be recalculated.`];
    if (paid > 0) {
      lines.push("", `${paid} payment(s) already marked as paid in this group stay as they are, so someone may then need to be paid back.`);
    }
    if (transactions.some(t => t.groupExpenseId === exp.id)) {
      lines.push("", "The matching entry in your own transactions will be removed too.");
    }
    if (window.confirm(lines.join("\n"))) deleteGroupExpense(activeGroup.id, exp.id);
  };

  const handleCreateGroup = (v: GroupSetupValues) => {
    const created = createGroup(v.name, v.emoji, v.memberNames, v.budgetRupees, v.description || "Shared expenses",
      { groupType: v.groupType, groupLabel: v.groupLabel });
    setSelectedGroupId(created.id);
    setIsNewGroupOpen(false);
  };

  // Starting from a type only pre-fills the form; people are always added by the user.
  const PRESET_TYPES: Record<string, GroupType> = {
    "tpl-trip": "trip", "tpl-flat": "flatmates", "tpl-office": "food", "tpl-trek": "trip", "tpl-party": "event", "tpl-custom": "custom",
  };
  const handlePresetSelect = (presetId: string) => {
    const tpl = GROUP_TEMPLATES.find(t => t.id === presetId);
    openNewGroup({ groupType: PRESET_TYPES[presetId] || "custom", emoji: tpl?.emoji, description: tpl?.sampleDesc });
  };

  // Active Settlements (Pending only)
  const pendingSettlements = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.settlements.filter(s => s.status === "suggested");
  }, [activeGroup]);

  // Settled History
  const settledHistory = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.settlements.filter(s => s.status === "marked_paid");
  }, [activeGroup]);

  // Rendered from both the empty state and the main screen, so a first group can be created.
  const newGroupModal = isNewGroupOpen && (
    <GroupSetupDialog mode="create" initial={setupInitial} myName={settings.name || "You"}
      onClose={() => setIsNewGroupOpen(false)} onSubmit={handleCreateGroup} />
  );

  if (!activeGroup) {
    return (
      <>
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-gray-200/80 dark:border-slate-800 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center mx-auto text-3xl">
          👥
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">No Groups Found</h2>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Create a group to split trip expenses, house rent, or dinners with friends without any math headache!
        </p>
        <button
          onClick={() => openNewGroup()}
          className="px-5 py-2.5 bg-[#047857] hover:bg-[#065f46] text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Create Your First Group</span>
        </button>
        {accountMode && (
          <button onClick={() => setIsJoinOpen(true)}
            className="block mx-auto text-xs font-bold text-[#047857] hover:underline cursor-pointer">
            Have a code? Join a group
          </button>
        )}
      </div>
      {newGroupModal}
      {joinDialog}
      </>
    );
  }

  const budgetPct = activeGroup.budget && activeGroup.budget > 0
    ? Math.min(Math.round((groupStats.totalSpend / activeGroup.budget) * 100), 100)
    : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner: Quick Template Bar & Group Switcher */}
      <div className="flex flex-col gap-4">
        {/* Friendly Header with Group Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>Universal Split Hub</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                {groups.length} active {groups.length === 1 ? "group" : "groups"}
              </span>
            </h1>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Split trips, house bills, dinner outings & events fairly with automatic minimum payments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyWhatsApp}
              className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-slate-800 rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
              title="Copy WhatsApp Summary"
            >
              {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedSummary ? "Copied!" : "Share Summary"}</span>
            </button>

            {accountMode && (
              <button
                onClick={() => setIsJoinOpen(true)}
                className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200/80 dark:border-slate-800 rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <span>Join with a code</span>
              </button>
            )}

            <button
              onClick={() => openNewGroup()}
              className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200/80 dark:border-slate-800 rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-[#047857]" />
              <span>New Group</span>
            </button>

            <button
              onClick={() => setIsAddExpenseOpen(true)}
              className="px-4 py-2 bg-[#047857] hover:bg-[#065f46] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Add Expense</span>
            </button>
          </div>
        </div>

        {/* Group Selection Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                g.id === activeGroup.id
                  ? "bg-[#047857] text-white shadow-sm ring-2 ring-emerald-500/30"
                  : "bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border border-gray-200/80 dark:border-slate-800 hover:border-emerald-300"
              }`}
            >
              <span className="text-base">{g.coverEmoji || "👥"}</span>
              <span>{g.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                g.id === activeGroup.id
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 dark:bg-slate-800 text-gray-500"
              }`}>
                {g.members.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Active Group Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Cover Header */}
        <div className="bg-gradient-to-r from-[#0B2240] via-[#0D3B66] to-[#047857] p-6 sm:p-8 text-white relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span className="text-3xl p-2 rounded-2xl bg-white/10 backdrop-blur-xs">
                  {activeGroup.coverEmoji || "👥"}
                </span>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{activeGroup.name}</h2>
                  <p className="text-xs text-emerald-100/90 font-medium">
                    {activeGroup.description || "Shared group expenses"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-white/15" data-testid="group-type">{groupTypeLabel(activeGroup.groupType, activeGroup.groupLabel)}</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/15">{activeGroup.members.length} {activeGroup.members.length === 1 ? "person" : "people"}</span>
                    {(!accountMode || activeGroup.myRole === "admin") && (
                      <button onClick={() => setIsEditGroupOpen(true)}
                        className="px-2.5 py-0.5 rounded-full bg-white text-[#0B2240] hover:bg-emerald-50 cursor-pointer">
                        Edit group
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Members Avatars and Invite Code */}
            <div className="flex flex-col sm:items-end gap-2">
              <div className="flex items-center -space-x-2">
                {activeGroup.members.map((m) => (
                  <div
                    key={m.id}
                    className="w-9 h-9 rounded-full bg-white text-[#0B2240] font-black text-xs flex items-center justify-center border-2 border-[#0B2240] shadow-xs"
                    title={`${m.name} ${m.upiId ? `(${m.upiId})` : ""}`}
                  >
                    {m.name.charAt(0)}
                  </div>
                ))}
              </div>
              {/* Only shown when a real code exists; account groups invite per member seat. */}
              {activeGroup.inviteCode && (
                <span className="text-[11px] text-emerald-200 font-semibold">
                  Invite: <span className="font-mono bg-white/15 px-2 py-0.5 rounded-md">{activeGroup.inviteCode}</span>
                </span>
              )}
            </div>
          </div>

          {/* Budget bar if set */}
          {activeGroup.budget && activeGroup.budget > 0 && (
            <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex-1 max-w-md">
                <div className="flex justify-between text-[11px] font-semibold text-emerald-100 mb-1">
                  <span>Group Budget: ₹{activeGroup.budget.toLocaleString("en-IN")}</span>
                  <span>{budgetPct}% spent</span>
                </div>
                <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      budgetPct > 90 ? "bg-rose-400" : budgetPct > 70 ? "bg-amber-400" : "bg-emerald-300"
                    }`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
              </div>
              <span className="text-[11px] text-emerald-100">
                Remaining: <strong>₹{Math.max(0, activeGroup.budget - groupStats.totalSpend).toLocaleString("en-IN")}</strong>
              </span>
            </div>
          )}
        </div>

        {/* My share in my own transactions (account mode) */}
        {accountMode && activeGroup.myLedger && (
          <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
            data-testid="my-group-ledger">
            {activeGroup.myLedger.linked ? (
              <span className="text-gray-600 dark:text-slate-300">
                Your transactions record <strong>only your share</strong> of this group's spending.
                {" "}{activeGroup.myLedger.inSync === false ? "Updating…" : (activeGroup.myLedger.balance ?? 0) >= 0
                  ? `Others owe you ${formatINR(activeGroup.myLedger.balance ?? 0)}.`
                  : `You owe ${formatINR(-(activeGroup.myLedger.balance ?? 0))}.`}
              </span>
            ) : (
              <>
                <span className="text-gray-600 dark:text-slate-300">
                  Add your share of this group's spending to your own transactions (money you front or get back is
                  tracked separately, not counted as spending).
                </span>
                <button disabled={ledgerBusy} onClick={async () => {
                  setLedgerBusy(true); setLedgerError("");
                  try { await linkGroupLedger(activeGroup.id); }
                  catch (e) { setLedgerError((e as Error).message); }
                  finally { setLedgerBusy(false); }
                }} className="px-3 py-1.5 rounded-lg bg-[#047857] text-white font-bold disabled:opacity-60 cursor-pointer">
                  {ledgerBusy ? "Turning on…" : "Track my share"}
                </button>
              </>
            )}
            {ledgerError && <span role="alert" className="w-full text-rose-600 font-semibold">{ledgerError}</span>}
          </div>
        )}

        {/* Sub Navigation Tabs */}
        <div className="flex items-center border-b border-gray-100 dark:border-slate-800 px-6 pt-3 gap-6 text-xs font-bold">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 border-b-2 transition-all cursor-pointer ${
              activeTab === "overview"
                ? "border-[#047857] text-[#047857] dark:text-emerald-400"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200"
            }`}
          >
            Overview & Settlements
          </button>
          <button
            onClick={() => setActiveTab("expenses")}
            className={`pb-3 border-b-2 transition-all cursor-pointer ${
              activeTab === "expenses"
                ? "border-[#047857] text-[#047857] dark:text-emerald-400"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200"
            }`}
          >
            All Expenses ({activeGroup.expenses.length})
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`pb-3 border-b-2 transition-all cursor-pointer ${
              activeTab === "members"
                ? "border-[#047857] text-[#047857] dark:text-emerald-400"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200"
            }`}
          >
            Members & Balances ({activeGroup.members.length})
          </button>
        </div>

        {/* Tab 1: Overview & Settlements */}
        {activeTab === "overview" && (
          <div className="p-6 space-y-6">
            {/* This month (paise-exact): spending, number of expenses, my share */}
            {(() => {
              const month = localDateString().slice(0, 7);
              const exps = activeGroup.expenses.filter(e => (e.date || "").startsWith(month));
              const toP = (r: number) => toPaise(safeRupees(r));
              const total = exps.reduce((sum, e) => sum + toP(e.amount), 0);
              const mine = exps.reduce((sum, e) => sum + toP(e.participants.find(pt => pt.memberId === currentUserMember?.id)?.amountOwed || 0), 0);
              const label = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
              return (
                <div data-testid="group-month-summary" className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/60 text-xs text-gray-800 dark:text-slate-200 flex flex-wrap gap-x-6 gap-y-1">
                  <span className="font-bold">{label}</span>
                  <span>Group spending: <strong>₹{(total / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span>{exps.length} {exps.length === 1 ? "expense" : "expenses"}</span>
                  {currentUserMember && <span>Your share: <strong>₹{(mine / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>}
                </div>
              );
            })()}

            {/* 4 Dynamic Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-gray-200/70 dark:border-slate-700/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  Total Group Spend
                </span>
                <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                  ₹{groupStats.totalSpend.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-gray-200/70 dark:border-slate-700/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  Average / Person
                </span>
                <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                  ₹{groupStats.perPersonSpend.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-gray-200/70 dark:border-slate-700/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  You Paid
                </span>
                <span className="text-xl sm:text-2xl font-black text-[#047857] dark:text-emerald-400">
                  ₹{groupStats.youPaid.toLocaleString("en-IN")}
                </span>
              </div>

              <div className={`p-4 rounded-2xl border ${
                groupStats.netBalance > 0
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60"
                  : groupStats.netBalance < 0
                  ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60"
                  : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700"
              }`}>
                <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${
                  groupStats.netBalance > 0
                    ? "text-emerald-700 dark:text-emerald-300"
                    : groupStats.netBalance < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-gray-400"
                }`}>
                  {groupStats.netBalance > 0 ? "You are Owed" : groupStats.netBalance < 0 ? "You Owe" : "Net Balance"}
                </span>
                <span className={`text-xl sm:text-2xl font-black ${
                  groupStats.netBalance > 0
                    ? "text-[#047857] dark:text-emerald-400"
                    : groupStats.netBalance < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-gray-700 dark:text-slate-300"
                }`}>
                  ₹{Math.abs(groupStats.netBalance).toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Who Owes Who Section (Optimized Minimum Transfers) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-gray-900 dark:text-white">
                    Suggested Settlements (Minimum Cash-Flow)
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Calculated automatically to reduce unnecessary payments between friends.
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold">
                  {pendingSettlements.length} pending
                </span>
              </div>

              {pendingSettlements.length === 0 ? (
                <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center space-y-1">
                  <span className="text-2xl">🎉</span>
                  <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    Everyone is fully settled up!
                  </h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    No pending dues or transfers in {activeGroup.name}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingSettlements.map((st) => {
                    const fromMember = activeGroup.members.find(m => m.id === st.fromMemberId);
                    const toMember = activeGroup.members.find(m => m.id === st.toMemberId);
                    const isCurrentUserPayer = fromMember?.isCurrentUser;
                    const isCurrentUserReceiver = toMember?.isCurrentUser;

                    return (
                      <div
                        key={st.id}
                        className={`p-4 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                          isCurrentUserPayer
                            ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/50"
                            : isCurrentUserReceiver
                            ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/50"
                            : "bg-[#F8FAFC] dark:bg-slate-800/50 border-gray-200/60 dark:border-slate-700/60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-xs font-black text-gray-800 dark:text-slate-100 shadow-xs border border-gray-200 dark:border-slate-600">
                            {fromMember?.name.charAt(0) || "M"}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-white">
                              <span className={isCurrentUserPayer ? "text-rose-600 font-black" : ""}>
                                {fromMember?.name || "Member"}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                              <span className={isCurrentUserReceiver ? "text-[#047857] font-black" : ""}>
                                {toMember?.name || "Member"}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-500 dark:text-slate-400">
                              {toMember?.upiId ? `UPI: ${toMember.upiId}` : "Direct transfer"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`text-base font-black ${
                            isCurrentUserPayer
                              ? "text-rose-600 dark:text-rose-400"
                              : isCurrentUserReceiver
                              ? "text-[#047857] dark:text-emerald-400"
                              : "text-gray-900 dark:text-white"
                          }`}>
                            ₹{st.amount.toLocaleString("en-IN")}
                          </span>

                          <button
                            onClick={() =>
                              setSettleModalData({
                                fromId: st.fromMemberId,
                                fromName: fromMember?.name || "Member",
                                toId: st.toMemberId,
                                toName: toMember?.name || "Member",
                                amount: st.amount,
                                upiId: toMember?.upiId,
                                settlementId: st.id
                              })
                            }
                            className="px-3.5 py-1.5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Settle</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Settled History if any */}
            {settledHistory.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Settled Payments History ({settledHistory.length})
                </h4>
                <div className="space-y-2">
                  {settledHistory.map(st => {
                    const fromMember = activeGroup.members.find(m => m.id === st.fromMemberId);
                    const toMember = activeGroup.members.find(m => m.id === st.toMemberId);
                    return (
                      <React.Fragment key={st.id}>
                      <div
                        className="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/40 border border-gray-200/50 dark:border-slate-700/50 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 text-gray-600 dark:text-slate-300 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>
                            <strong>{fromMember?.name}</strong> paid <strong>{toMember?.name}</strong>
                          </span>
                        </div>
                        <span className="flex items-center gap-2">
                          <span className="font-bold text-gray-500 line-through">{formatINR(st.amount)}</span>
                          {accountMode && (
                            <button disabled={rowBusy === st.id} aria-label={`Undo payment ${fromMember?.name} to ${toMember?.name}`}
                              className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer disabled:opacity-60"
                              onClick={async () => {
                                const msg = `Undo "${fromMember?.name} paid ${toMember?.name} ${formatINR(st.amount)}"?\n\n` +
                                  "Only do this if the payment didn't actually happen. It stays in the history as undone, " +
                                  `and ${fromMember?.name} will owe ${formatINR(st.amount)} again.`;
                                if (!window.confirm(msg)) return;
                                setRowBusy(st.id); setRowError(null);
                                try { await undoGroupSettlement(activeGroup.id, st.id); }
                                catch (e) { setRowError({ id: st.id, message: (e as Error).message }); }
                                finally { setRowBusy(""); }
                              }}>Undo</button>
                          )}
                        </span>
                      </div>
                      {rowError?.id === st.id && <p role="alert" className="text-[11px] text-rose-600 font-semibold">{rowError.message}</p>}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: All Expenses */}
        {activeTab === "expenses" && (
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold text-gray-500">
                Showing all {activeGroup.expenses.length} expenses
              </span>
              <button
                onClick={() => setIsAddExpenseOpen(true)}
                className="text-xs font-bold text-[#047857] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Expense</span>
              </button>
            </div>

            {activeGroup.expenses.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Receipt className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto" />
                <h4 className="text-sm font-bold text-gray-700 dark:text-slate-300">No expenses recorded yet</h4>
                <p className="text-xs text-gray-400">Click "Add Expense" above to record bills, fuel, food, or bookings.</p>
              </div>
            ) : (
              activeGroup.expenses.map(exp => {
                const payer = activeGroup.members.find(m => m.id === exp.paidByMemberId);
                const isPaidByMe = payer?.isCurrentUser;

                return (
                  <React.Fragment key={exp.id}>
                  <div
                    className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/60 flex items-center justify-between gap-3 group hover:border-emerald-300 dark:hover:border-slate-600 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                        {exp.description.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                          {exp.description}
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                          {exp.date} • Paid by{" "}
                          <strong className={isPaidByMe ? "text-[#047857]" : ""}>
                            {payer?.name || "Member"}
                          </strong>
                          {" "}• Split among {exp.participants.length} people
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm sm:text-base font-black text-gray-900 dark:text-white">
                        {formatINR(exp.amount)}
                      </span>
                      {accountMode && (
                        <button onClick={() => { setRowError(null); setEditing({ id: exp.id, description: exp.description, amount: String(exp.amount) }); }}
                          className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                          aria-label={`Edit expense ${exp.description}`}>Edit</button>
                      )}
                      <button
                        onClick={() => handleDeleteExpense(exp)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                        title="Delete expense"
                        aria-label={`Delete expense ${exp.description}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {editing?.id === exp.id && (
                    <form className="p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 space-y-2 text-xs"
                      aria-label={`Edit ${exp.description}`}
                      onSubmit={async e => {
                        e.preventDefault();
                        const parsed = parseRupeeInput(editing.amount);
                        if (!editing.description.trim()) { setRowError({ id: exp.id, message: "Enter a description." }); return; }
                        if (parsed.ok === false || parsed.rupees <= 0) {
                          setRowError({ id: exp.id, message: parsed.ok === false ? parsed.error : "Enter an amount greater than zero." });
                          return;
                        }
                        const changes: { description?: string; amountRupees?: number } = {};
                        if (editing.description.trim() !== exp.description) changes.description = editing.description;
                        if (parsed.rupees !== exp.amount) changes.amountRupees = parsed.rupees;
                        if (!Object.keys(changes).length) { setEditing(null); return; }
                        setRowBusy(exp.id); setRowError(null);
                        try { await editGroupExpense(activeGroup.id, exp.id, changes); setEditing(null); }
                        catch (err) { setRowError({ id: exp.id, message: (err as Error).message }); }
                        finally { setRowBusy(""); }
                      }}>
                      <input className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })}
                        aria-label="Expense description" maxLength={300} />
                      <input className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        value={editing.amount} onChange={e => setEditing({ ...editing, amount: e.target.value })}
                        aria-label="Expense amount in rupees" inputMode="decimal" />
                      <p className="text-[10px] text-gray-500">A new amount is split equally again among the same people. The change is kept in the group's history.</p>
                      <div className="flex gap-2">
                        <button type="submit" disabled={rowBusy === exp.id} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer disabled:opacity-60">
                          {rowBusy === exp.id ? "Saving…" : "Save"}</button>
                        <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 cursor-pointer">Cancel</button>
                      </div>
                    </form>
                  )}
                  {rowError?.id === exp.id && <p role="alert" className="text-[11px] text-rose-600 font-semibold">{rowError.message}</p>}
                  </React.Fragment>
                );
              })
            )}
          </div>
        )}

        {/* Tab 3: Members & Balances */}
        {activeTab === "members" && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">
                Individual balance breakdown for {activeGroup.members.length} members
              </span>
              <GroupMemberToolbar group={activeGroup} accountMode={accountMode} addMember={addGroupMember}
                refresh={refreshGroups} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groupStats.memberBalances.map(({ member, paid, consumed, net }) => (
                <div
                  key={member.id}
                  data-testid={`member-card-${member.name}`}
                  className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/50 border border-gray-200/60 dark:border-slate-700/60 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                          {member.name} {member.isCurrentUser && "(You)"}
                        </h4>
                        {member.upiId && (
                          <span className="text-[10px] text-gray-400 font-mono">{member.upiId}</span>
                        )}
                      </div>
                    </div>

                    <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                      net > 0
                        ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                        : net < 0
                        ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                        : "bg-gray-100 dark:bg-slate-700 text-gray-500"
                    }`}>
                      {net > 0 ? `+₹${net.toLocaleString("en-IN")}` : net < 0 ? `-₹${Math.abs(net).toLocaleString("en-IN")}` : "Settled"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 text-[11px] pt-1 text-gray-500 border-t border-gray-100 dark:border-slate-700/50">
                    <div>Paid: <strong>₹{paid.toLocaleString("en-IN")}</strong></div>
                    <div>Share: <strong>₹{consumed.toLocaleString("en-IN")}</strong></div>
                  </div>
                  <MemberCardActions group={activeGroup} accountMode={accountMode} member={member} netRupees={net}
                    addMember={addGroupMember} refresh={refreshGroups}
                    rename={(memberId, name) => renameGroupMember(activeGroup.id, memberId, name)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Instant 1-Click Starter Presets Grid */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Start from a type</span>
          </h3>
          <span className="text-[11px] text-gray-400">Pre-fills the form; you choose the name and the people</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {GROUP_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => handlePresetSelect(tpl.id)}
              className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 text-left transition-all hover:shadow-sm group cursor-pointer"
            >
              <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                {tpl.emoji}
              </div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white leading-tight">
                {tpl.name}
              </h4>
              <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">
                {tpl.description}
              </p>
              <span className="text-[10px] font-bold text-[#047857] mt-2 block">
                Set up →
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Settle Modal with Direct UPI QR Code */}
      {settleModalData && (
        <Modal onClose={() => setSettleModalData(null)} labelledBy="settle-title" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">{close => (<>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border border-gray-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="settle-title" className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#047857]" />
                <span>Settle Payment</span>
              </h3>
              <button
                onClick={close} aria-label="Close"
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/60 text-center space-y-2">
              <span className="text-xs font-semibold text-gray-500">
                <strong>{settleModalData.fromName}</strong> pays <strong>{settleModalData.toName}</strong>
              </span>
              <div className="text-3xl font-black text-[#047857] tracking-tight">
                ₹{settleModalData.amount.toLocaleString("en-IN")}
              </div>
              <span className="block text-[11px] text-gray-500">outstanding</span>
              {settleModalData.upiId && (
                <div className="inline-block text-[11px] font-mono bg-white dark:bg-slate-700 px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200">
                  UPI ID: {settleModalData.upiId}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="font-bold text-gray-700 dark:text-slate-300">Amount paid (₹)
                <input data-autofocus inputMode="decimal" value={settleAmount} onChange={e => setSettleAmount(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm text-gray-900 dark:text-white" />
              </label>
              <label className="font-bold text-gray-700 dark:text-slate-300">How
                <select value={settleMethod} onChange={e => setSettleMethod(e.target.value as PaymentMethod)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm text-gray-900 dark:text-white">
                  <option value="upi">UPI</option><option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
                </select>
              </label>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">
              Record a payment that already happened outside Bagla. A smaller amount is saved as a part-payment and the rest stays outstanding.
            </p>
            {settleError && <p role="alert" className="text-xs font-semibold text-rose-600">{settleError}</p>}

            {/* Direct UPI Intent Link (opens your own UPI app; nothing is paid from Bagla) */}
            {settleModalData.upiId && settlePaise && settlePaise > 0 && settlePaise <= fullSettlePaise && buildUpiPayLink({ vpa: settleModalData.upiId, name: settleModalData.toName, amountRupees: settlePaise / 100 }) && (
              <a
                // Validated + encoded: a crafted UPI ID can't inject a different amount.
                href={buildUpiPayLink({ vpa: settleModalData.upiId, name: settleModalData.toName, amountRupees: settlePaise / 100 }) || undefined}
                rel="noopener noreferrer"
                className="w-full py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open GPay / PhonePe / Paytm</span>
              </a>
            )}

            <button
              onClick={handleConfirmSettlement}
              className="w-full py-3 bg-[#047857] hover:bg-[#065f46] text-white font-bold text-xs rounded-2xl shadow-lg shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{settlePaise !== null && settlePaise > 0 && settlePaise < fullSettlePaise ? "Record part-payment" : "Mark as Settled & Confirmed"}</span>
            </button>
          </div>
        </>)}</Modal>
      )}

      {/* Add Group Expense (equal / exact / percentage / shares) */}
      {isAddExpenseOpen && activeGroup && (
        <GroupExpenseDialog group={activeGroup} categories={categories} onClose={() => setIsAddExpenseOpen(false)}
          onSave={exp => addGroupExpense(activeGroup.id, exp)} />
      )}
      {isEditGroupOpen && activeGroup && (
        <GroupSetupDialog mode="edit" myName={settings.name || "You"}
          initial={{ name: activeGroup.name, groupType: activeGroup.groupType || "custom", groupLabel: activeGroup.groupLabel,
            emoji: activeGroup.coverEmoji, description: activeGroup.description, budgetRupees: activeGroup.budget }}
          onClose={() => setIsEditGroupOpen(false)}
          onSubmit={v => {
            updateGroup({ ...activeGroup, name: v.name, groupType: v.groupType, groupLabel: v.groupLabel, coverEmoji: v.emoji,
              description: v.description, budget: v.budgetRupees });
            setIsEditGroupOpen(false);
          }} />
      )}

      {newGroupModal}
      {joinDialog}
    </div>
  );
};
