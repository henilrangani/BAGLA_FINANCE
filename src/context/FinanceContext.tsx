import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Transaction,
  Category,
  Budget,
  Group,
  FamilySpace,
  RecurringExpense,
  FinancialGoal,
  CashWallet,
  UserSettings,
  FinancialConnection,
  AnomalyAlert,
  FinancialHealthScore,
  GroupExpense,
  Settlement,
  ReceiptData,
  StatementImportPreviewItem,
  PaymentMethod
} from "../types";
import {
  DEFAULT_CATEGORIES,
  INITIAL_USER_SETTINGS,
  INITIAL_CONNECTIONS,
  INITIAL_CASH_WALLET,
  INITIAL_GOALS,
  INITIAL_RECURRING,
  INITIAL_BUDGETS,
  INITIAL_GOA_GROUP,
  INITIAL_GROUPS,
  GROUP_TEMPLATES,
  INITIAL_FAMILY_SPACE,
  INITIAL_TRANSACTIONS,
  INITIAL_ANOMALIES,
  recomputeSettlements,
  detectDuplicateTransaction,
  calculateFinancialHealth
} from "../services/data";
import confetti from "canvas-confetti";
import { localDateString, localMonthPrefix, localTimeString } from "../utils/dates";
import { applyCashEffect, countsTowardTotals, netSpend, normalizeTransactions, spendByCategory, withDerivedSpent } from "../utils/ledger";
import { formatINR, normalizeRupees, safeRupees, subtractRupees, toPaise } from "../utils/money";
import { hashPin, isValidPin, lockoutDelayMs, verifyPin } from "../utils/pin";
import { activeProfile, profileKey } from "../api/profile";
import { api, ApiError, readSession, setOfflineGuard } from "../api/client";
import { enqueue, ensureAccounts, pendingCount, pullAll, runOutbox, unsyncedIds, type OutboxOp } from "../api/sync";
import { addRemoteExpense, addRemoteMember, archiveRemoteGroup, createRemoteGroup, editRemoteExpense, linkRemoteLedger, pullGroups, recordRemoteSettlement, undoRemoteSettlement, voidRemoteExpense } from "../api/groups";
import type { AccountRefs } from "../api/mappers";

interface FinanceContextType {
  // State
  settings: UserSettings;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  groups: Group[];
  activeGroup: Group | null;
  selectedGroupId: string;
  familySpace: FamilySpace;
  recurring: RecurringExpense[];
  goals: FinancialGoal[];
  cashWallet: CashWallet;
  connections: FinancialConnection[];
  anomalies: AnomalyAlert[];
  healthScore: FinancialHealthScore;
  isOnline: boolean;
  currentTab: string;
  isAddExpenseOpen: boolean;
  isVoiceModalOpen: boolean;
  isReceiptModalOpen: boolean;
  isDailySummaryOpen: boolean;
  isAiChatOpen: boolean;
  isNightlyCashModalOpen: boolean;
  isLiveSyncModalOpen: boolean;
  liveSyncNotification: { provider: string; amount: number; merchant: string; category: string; id: string } | null;
  
  // Setters & Modals
  setCurrentTab: (tab: string) => void;
  setSettings: (s: UserSettings | ((prev: UserSettings) => UserSettings)) => void;
  setIsAddExpenseOpen: (open: boolean) => void;
  setIsVoiceModalOpen: (open: boolean) => void;
  setIsReceiptModalOpen: (open: boolean) => void;
  setIsDailySummaryOpen: (open: boolean) => void;
  setIsAiChatOpen: (open: boolean) => void;
  setIsNightlyCashModalOpen: (open: boolean) => void;
  setIsLiveSyncModalOpen: (open: boolean) => void;
  dismissLiveSyncNotification: () => void;
  setActiveGroup: (group: Group | null) => void;
  setSelectedGroupId: (id: string) => void;
  
  // Transactions & Cash Log
  addTransaction: (tx: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => { success: boolean; duplicateWarning?: string; error?: string; tx: Transaction };
  addQuickExpense: (name: string, amount: number, categoryId: string, paymentMethod?: any) => void;
  quickLogCash: (amount: number, description: string, categoryId?: string) => void;
  simulateIncomingPayment: (provider: "GPay" | "PhonePe" | "Paytm" | "CRED" | "HDFC", amount: number, merchant: string, categoryId?: string) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  
  // AI Operations
  parseNaturalLanguageExpense: (text: string) => Promise<any>;
  scanReceiptImage: (base64: string, mimeType?: string) => Promise<ReceiptData>;
  askBaglaAi: (message: string, history?: any[]) => Promise<any>;
  
  // Groups & Trips (Universal Split Hub)
  addGroup: (name: string, description: string, budget?: number, members?: { name: string; phone?: string; upiId?: string }[], coverEmoji?: string) => Group;
  createGroup: (name: string, coverEmoji: string, membersList: string[], budget?: number, description?: string) => Group;
  createGroupFromPreset: (presetId: string, customName?: string) => Group;
  addGroupExpense: (groupId: string, expense: Omit<GroupExpense, "id" | "groupId" | "createdAt">) => void;
  deleteGroup: (groupId: string) => void;
  deleteGroupExpense: (groupId: string, expenseId: string, opts?: { confirmBalanceChange?: boolean }) => void;
  settleGroupPayment: (groupId: string, fromMemberId: string, toMemberId: string, amount: number, method?: any) => void;
  markSettlementPaid: (groupId: string, settlementId: string, method?: any) => void;
  updateGroup: (group: Group) => void;
  /** Add a person to a group (account mode: on the server). Resolves when saved. */
  addGroupMember: (groupId: string, name: string, upiId?: string) => Promise<void>;
  /** Account mode: reload groups from the server (after joining, removing, etc.). */
  refreshGroups: (selectId?: string) => Promise<void>;
  /** Account mode: record my share of this group in my own transactions (paid from my bank account). */
  linkGroupLedger: (groupId: string) => Promise<void>;
  /** Account mode: edit a group expense (server re-splits a changed amount equally; audited). */
  editGroupExpense: (groupId: string, expenseId: string, changes: { description?: string; amountRupees?: number }) => Promise<void>;
  /** Account mode: undo a recorded payback (kept in history as voided). */
  undoGroupSettlement: (groupId: string, settlementId: string) => Promise<void>;
  generateWhatsAppSummary: (groupId: string) => string;
  
  // Budgets & Goals
  addBudget: (b: Omit<Budget, "id" | "spent">) => void;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  addGoal: (g: Omit<FinancialGoal, "id" | "createdAt">) => void;
  updateGoalAmount: (id: string, amountToAdd: number) => void;
  
  // Subscriptions & Recurring
  addRecurring: (r: Omit<RecurringExpense, "id">) => void;
  toggleRecurring: (id: string) => void;
  deleteRecurring: (id: string) => void;
  
  // Cash Wallet
  adjustCashWallet: (newBalance: number, reason: string) => void;
  
  // Family Space
  updateFamilySpace: (f: FamilySpace) => void;
  
  // Privacy, Security & Compliance
  connectorStatus: { aaConsentGranted: boolean; smsNotificationListening: boolean; biometricLocked: boolean };
  toggleDataConsent: (key: "aaConsentGranted" | "smsNotificationListening") => void;
  deleteAccountData: () => void;
  toggleStealthMode: () => void;
  formatCurrency: (amount: number, overrideStealth?: boolean) => string;
  setAppPasscode: (pin: string) => Promise<boolean>;
  lockApp: () => void;
  unlockApp: (pin: string) => Promise<{ ok: boolean; retryInMs?: number }>;
  exportEncryptedLedger: () => string;

  // Account sync
  cloud: CloudState;
  syncNow: (pull?: boolean) => void;

  // Connections & Statements
  importStatementTransactions: (items: StatementImportPreviewItem[]) => void;
  dismissAnomaly: (id: string) => void;
  resetToSampleData: () => void;
  loadSampleData: () => void;
  toggleDemoMode: () => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

const STORAGE_KEYS = {
  SETTINGS: "bagla_settings_v1",
  TRANSACTIONS: "bagla_transactions_v1",
  CATEGORIES: "bagla_categories_v1",
  BUDGETS: "bagla_budgets_v1",
  GROUPS: "bagla_groups_v1",
  FAMILY: "bagla_family_v1",
  RECURRING: "bagla_recurring_v1",
  GOALS: "bagla_goals_v1",
  CASH: "bagla_cash_v1",
  CONNECTIONS: "bagla_connections_v1",
  ANOMALIES: "bagla_anomalies_v1"
};

// Local data and each signed-in account use separate storage (see api/profile.ts),
// so account mode can never overwrite the browser-only data.
const PROFILE = activeProfile();
for (const k of Object.keys(STORAGE_KEYS) as (keyof typeof STORAGE_KEYS)[]) {
  STORAGE_KEYS[k] = profileKey(STORAGE_KEYS[k], PROFILE) as any;
}

/** Remove only the active profile's data (never other profiles, the session or the local copy). */
function clearActiveProfileStorage() {
  for (const key of Object.values(STORAGE_KEYS)) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

export interface CloudState {
  enabled: boolean;
  email?: string;
  state: "local" | "idle" | "syncing" | "offline" | "error" | "signed_out";
  pending: number;
  message?: string;
  lastSyncedAt?: string;
}

/** Parse stored JSON; corrupt or missing data returns null instead of crashing the app. */
function safeParse(raw: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("Ignoring corrupt locally stored data");
    return null;
  }
}

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load settings from localStorage or defaults
  const [settings, setSettingsState] = useState<UserSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    // Account mode never shows demo sample data.
    return { ...INITIAL_USER_SETTINGS, ...(safeParse(saved) || {}), ...(PROFILE.kind === "cloud" ? { isDemoMode: false } : {}) };
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    // normalizeTransactions repairs legacy float amounts to exact paise (idempotent).
    { const parsed = safeParse(saved); if (Array.isArray(parsed)) return normalizeTransactions(parsed); }
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
    return isDemo ? normalizeTransactions(INITIAL_TRANSACTIONS) : [];
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    return safeParse(saved) || DEFAULT_CATEGORIES;
  });

  // Budget definitions. `spent` is never stored as truth: it is derived from
  // transactions below, so edits/deletes can't leave it out of sync.
  const [budgetDefs, setBudgets] = useState<Budget[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BUDGETS);
    { const parsed = safeParse(saved); if (parsed) return parsed; }
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
    return isDemo ? INITIAL_BUDGETS : [];
  });

  const [groups, setGroups] = useState<Group[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.GROUPS);
    let loaded: Group[] = [];
    if (saved) {
      loaded = Array.isArray(safeParse(saved)) ? safeParse(saved) : [];
    } else {
      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
      loaded = isDemo ? INITIAL_GROUPS : [];
    }
    // Optimize settlements on init
    return loaded.map(g => ({
      ...g,
      settlements: recomputeSettlements(g)
    }));
  });

  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    return groups[0]?.id || "";
  });

  const [activeGroup, setActiveGroup] = useState<Group | null>(() => {
    return groups[0] || null;
  });

  // Sync activeGroup when selectedGroupId or groups change
  useEffect(() => {
    const found = groups.find(g => g.id === selectedGroupId) || groups[0] || null;
    setActiveGroup(found);
  }, [selectedGroupId, groups]);

  const [familySpace, setFamilySpace] = useState<FamilySpace>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FAMILY);
    { const parsed = safeParse(saved); if (parsed) return parsed; }
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
    return isDemo ? INITIAL_FAMILY_SPACE : {
      id: "fam-space-empty",
      name: "Household Space",
      members: [],
      sharedCategories: [],
      monthlyBudget: 0
    };
  });

  const [recurring, setRecurring] = useState<RecurringExpense[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RECURRING);
    { const parsed = safeParse(saved); if (parsed) return parsed; }
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
    return isDemo ? INITIAL_RECURRING : [];
  });

  const [goals, setGoals] = useState<FinancialGoal[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.GOALS);
    { const parsed = safeParse(saved); if (parsed) return parsed; }
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
    return isDemo ? INITIAL_GOALS : [];
  });

  const [cashWallet, setCashWallet] = useState<CashWallet>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CASH);
    { const parsed = safeParse(saved); if (parsed) return parsed; }
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
    return isDemo ? INITIAL_CASH_WALLET : {
      openingBalance: 0,
      cashReceived: 0,
      cashSpent: 0,
      currentBalance: 0,
      lastAdjustedDate: localDateString()
    };
  });

  const [connections, setConnections] = useState<FinancialConnection[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CONNECTIONS);
    { const parsed = safeParse(saved); if (parsed) return parsed; }
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
    return isDemo ? INITIAL_CONNECTIONS : [];
  });

  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ANOMALIES);
    { const parsed = safeParse(saved); if (parsed) return parsed; }
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = safeParse(savedSettings)?.isDemoMode ?? (PROFILE.kind === "cloud" ? false : INITIAL_USER_SETTINGS.isDemoMode);
    return isDemo ? INITIAL_ANOMALIES : [];
  });

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isDailySummaryOpen, setIsDailySummaryOpen] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isNightlyCashModalOpen, setIsNightlyCashModalOpen] = useState(false);
  const [isLiveSyncModalOpen, setIsLiveSyncModalOpen] = useState(false);
  const [liveSyncNotification, setLiveSyncNotification] = useState<{
    provider: string;
    amount: number;
    merchant: string;
    category: string;
    id: string;
  } | null>(null);

  // Monitor 10 PM (22:00) Nightly Cash Reminder
  useEffect(() => {
    const checkNightlyReminder = () => {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, "0");
      const currentMinutes = String(now.getMinutes()).padStart(2, "0");
      const currentTimeStr = `${currentHours}:${currentMinutes}`;
      const targetTime = settings.nightlyCashReminderConfig?.time || "22:00";
      const todayStr = localDateString(now);

      if (
        settings.nightlyCashReminderConfig?.enabled &&
        currentTimeStr === targetTime &&
        settings.nightlyCashReminderConfig.lastNotifiedDate !== todayStr
      ) {
        // Trigger In-App Modal
        setIsNightlyCashModalOpen(true);

        // Trigger Real Web Notification if granted
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("🌙 Bagla 10 PM Cash Spend Check", {
              body: "Did you pay cash today for Chai, Auto, or Groceries? Tap to log it in 3 seconds.",
              icon: "/favicon.ico"
            });
          } catch (e) {
            console.log("Notification trigger notice:", e);
          }
        }

        // Update last notified date
        setSettingsState(prev => ({
          ...prev,
          nightlyCashReminderConfig: {
            ...prev.nightlyCashReminderConfig,
            enabled: prev.nightlyCashReminderConfig?.enabled ?? true,
            time: prev.nightlyCashReminderConfig?.time || "22:00",
            autoPromptInApp: prev.nightlyCashReminderConfig?.autoPromptInApp ?? true,
            lastNotifiedDate: todayStr
          }
        }));
      }
    };

    const interval = setInterval(checkNightlyReminder, 30000); // check every 30s
    return () => clearInterval(interval);
  }, [settings.nightlyCashReminderConfig]);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    if (settings.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgetDefs));
  }, [budgetDefs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FAMILY, JSON.stringify(familySpace));
  }, [familySpace]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(recurring));
  }, [recurring]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CASH, JSON.stringify(cashWallet));
  }, [cashWallet]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
  }, [connections]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ANOMALIES, JSON.stringify(anomalies));
  }, [anomalies]);

  // Budgets with `spent` derived from the ledger for the current period.
  const today = localDateString();
  const budgets = useMemo(
    () => withDerivedSpent(budgetDefs, transactions, today),
    [budgetDefs, transactions, today]
  );

  // ------------------------------------------------------------------ account sync
  const [cloud, setCloud] = useState<CloudState>(() => PROFILE.kind === "cloud"
    ? { enabled: true, email: readSession()?.email, state: readSession() ? "syncing" : "signed_out",
        pending: pendingCount(PROFILE) }
    : { enabled: false, state: "local", pending: 0 });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const refsRef = useRef<AccountRefs | null>(null);
  const syncing = useRef(false);
  const again = useRef(false);

  const syncNow = useCallback(async (pull = false) => {
    if (PROFILE.kind !== "cloud") return;
    if (syncing.current) { again.current = true; return; }
    syncing.current = true;
    setCloud(c => ({ ...c, state: "syncing" }));
    try {
      const refs = refsRef.current || (refsRef.current = await ensureAccounts());
      const res = await runOutbox(PROFILE, refs);
      const remap = res.created;
      if (Object.keys(remap).length) {
        setTransactions(prev => prev.map(t => (remap[t.id] ? { ...t, id: remap[t.id] } : t)));
        setBudgets(prev => prev.map(b => (remap[b.id] ? { ...b, id: remap[b.id] } : b)));
        setGoals(prev => prev.map(g => (remap[g.id] ? { ...g, id: remap[g.id] } : g)));
      }
      if (res.error && res.remaining > 0) {
        // No session left (refresh token expired/revoked): say "signed out", not a generic error.
        setCloud(c => ({ ...c, state: !readSession() ? "signed_out" : res.offline ? "offline" : "error",
          pending: res.remaining, message: res.error }));
        return;
      }
      if (pull || res.done > 0) {
        const data = await pullAll();
        refsRef.current = data.refs;
        const keep = unsyncedIds(PROFILE);
        setTransactions(prev => [...prev.filter(t => keep.has(t.id)), ...data.transactions]);
        setBudgets(prev => [...prev.filter(b => keep.has(b.id)), ...data.budgets]);
        setGoals(prev => [...prev.filter(g => keep.has(g.id)), ...data.goals]);
        setCashWallet(w => ({ ...w, currentBalance: data.cashBalanceRupees, lastAdjustedDate: localDateString() }));
        // Show the account holder, never a sample/default name.
        setSettingsState(s => ({ ...s, name: data.user.fullName, email: data.user.email }));
        // If a group's share-based entries were just synced, pull once more to show them (no loop:
        // the second pull finds every ledger in sync).
        if (pull) setGroups(await pullGroups(() => { setTimeout(() => syncNow(true), 100); }));
      }
      setCloud(c => ({ ...c, state: "idle", pending: pendingCount(PROFILE), message: res.error,
        lastSyncedAt: new Date().toISOString() }));
    } catch (e) {
      const err = e as ApiError;
      const signedOut = err instanceof ApiError && err.status === 401 && !readSession();
      setCloud(c => ({ ...c, state: signedOut ? "signed_out" : err?.isOffline ? "offline" : "error",
        pending: pendingCount(PROFILE), message: err?.message || "Sync failed" }));
    } finally {
      syncing.current = false;
      if (again.current) { again.current = false; setTimeout(() => syncNow(false), 50); }
    }
  }, []);

  /**
   * Account mode: group writes go straight to the server (group data is shared with other
   * people, so it is never queued offline). The screen updates optimistically, then reloads
   * the server's view, which also undoes the optimistic change if the server refused it.
   */
  const groupOp = (op: () => Promise<unknown>, after?: (result: any) => void): boolean => {
    if (PROFILE.kind !== "cloud") return false;
    op()
      .then(r => { after?.(r); })
      .catch((e: ApiError) => setCloud(c => ({ ...c,
        state: e?.status === 401 && !readSession() ? "signed_out" : e?.isOffline ? "offline" : "error",
        message: `Group change not saved: ${e?.message || "request failed"}` })))
      .finally(() => { pullGroups().then(setGroups).catch(() => {}); });
    return true;
  };
  const newKey = (prefix: string) =>
    `${prefix}:${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;

  const queue = (op: OutboxOp) => {
    if (PROFILE.kind !== "cloud") return;
    enqueue(PROFILE, op);
    setCloud(c => ({ ...c, pending: pendingCount(PROFILE) }));
    setTimeout(() => syncNow(false), 300);
  };

  useEffect(() => {
    if (PROFILE.kind !== "cloud") return;
    setOfflineGuard(() => !!settingsRef.current.offlineMode);
    syncNow(true);
    const onOnline = () => syncNow(true);
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => { if (pendingCount(PROFILE) > 0) syncNow(false); }, 60_000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(timer); };
  }, [syncNow]);

  // Leaving offline mode flushes anything queued while offline (explicit, not timer-dependent).
  useEffect(() => {
    if (PROFILE.kind === "cloud" && !settings.offlineMode) syncNow(true);
  }, [settings.offlineMode, syncNow]);

  // Recalculate health score whenever key financial data changes
  const healthScore = calculateFinancialHealth(
    transactions,
    settings.monthlyIncome,
    budgets,
    recurring
  );

  const setSettings = (s: UserSettings | ((prev: UserSettings) => UserSettings)) => {
    setSettingsState(s);
  };

  // Add Transaction
  const addTransaction = (txData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    const amount = Math.abs(safeRupees(txData.amount));
    const now = new Date();
    const newTx: Transaction = {
      ...txData,
      amount,
      date: txData.date || localDateString(now),
      time: txData.time || localTimeString(now),
      id: `tx-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: "local-user",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } as Transaction;

    // Central guard: never record a zero, negative or non-numeric amount.
    if (amount <= 0) {
      return { success: false, error: "Amount must be greater than zero", tx: newTx };
    }

    const dupCheck = detectDuplicateTransaction(newTx, transactions);
    newTx.status = dupCheck.isDuplicate ? "duplicate_flagged" : (txData.status || "verified");
    newTx.duplicateOfId = dupCheck.duplicateOf?.id;

    setTransactions(prev => [newTx, ...prev]);
    // Budgets are derived from transactions; only the cash wallet is incremental.
    setCashWallet(prev => applyCashEffect(prev, newTx, 1, localDateString()));
    queue({ kind: "tx_create", localId: newTx.id, tx: newTx });

    if (dupCheck.isDuplicate) {
      return { success: true, duplicateWarning: dupCheck.reason, tx: newTx };
    }

    return { success: true, tx: newTx };
  };

  const updateTransaction = (id: string, updates: Partial<Transaction>) => {
    const old = transactions.find(t => t.id === id);
    if (!old) return;
    const next: Transaction = {
      ...old,
      ...updates,
      amount: updates.amount !== undefined ? Math.abs(safeRupees(updates.amount)) : old.amount,
      updatedAt: new Date().toISOString()
    };
    setTransactions(prev => prev.map(t => (t.id === id ? next : t)));
    // Reverse the old cash effect and apply the new one.
    setCashWallet(prev => applyCashEffect(applyCashEffect(prev, old, -1, localDateString()), next, 1, localDateString()));
    queue({ kind: "tx_update", localId: id, updates, current: old });
  };

  const deleteTransaction = (id: string) => {
    const old = transactions.find(t => t.id === id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    if (old) setCashWallet(prev => applyCashEffect(prev, old, -1, localDateString()));
    if (old) queue({ kind: "tx_delete", localId: id });
  };

  // Natural language parser via backend Gemini
  const parseNaturalLanguageExpense = async (text: string) => {
    try {
      // Offline mode is enforced: no request leaves the device.
      if (settings.offlineMode) throw new Error("Offline mode: AI disabled");
      const response = await fetch("/api/ai/parse-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await response.json();
      // Never trust AI numbers blindly: normalise to paise, drop junk.
      const amount = Math.abs(safeRupees(data?.amount));
      return { ...data, amount, confidence: amount > 0 ? Number(data?.confidence) || 0 : 0 };
    } catch (err) {
      console.error("AI parse error:", err);
      // No invented amount: the user must enter it.
      return {
        amount: 0,
        category: "Other",
        description: text,
        confidence: 0,
        paymentMethod: "upi",
        needsReview: true
      };
    }
  };

  // Receipt Scanner via backend Gemini
  const scanReceiptImage = async (base64: string, mimeType = "image/jpeg"): Promise<ReceiptData> => {
    try {
      if (settings.offlineMode) throw new Error("Offline mode: AI disabled");
      const response = await fetch("/api/ai/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType })
      });
      const data = await response.json();
      const totalAmount = Math.abs(safeRupees(data.totalAmount));
      return {
        merchant: data.merchant || "",
        date: data.date || localDateString(),
        totalAmount,
        taxAmount: Math.abs(safeRupees(data.taxAmount)),
        subtotal: Math.abs(safeRupees(data.subtotal ?? data.totalAmount)),
        items: Array.isArray(data.items)
          ? data.items.map((i: any) => ({ ...i, price: Math.abs(safeRupees(i?.price)) }))
          : [],
        confidence: totalAmount > 0 ? Number(data.confidence) || 0 : 0,
        imageUrl: base64.startsWith("data:") ? base64 : `data:${mimeType};base64,${base64}`
      };
    } catch (err) {
      console.error("Receipt scan error:", err);
      // Previously this returned an invented ₹680 receipt. Return an empty
      // result so the user enters the real details manually.
      return {
        merchant: "",
        date: localDateString(),
        totalAmount: 0,
        items: [],
        confidence: 0
      };
    }
  };

  // Bagla AI Chat
  const askBaglaAi = async (message: string, history: any[] = []) => {
    const currentMonth = localMonthPrefix();
    const monthTxs = transactions.filter(t => t.date?.startsWith(currentMonth));
    const totalSpent = netSpend(monthTxs);
    const income = safeRupees(settings.monthlyIncome);
    const savings = subtractRupees(income, totalSpent);

    const categoryBreakdown: Record<string, number> = {};
    for (const [catId, amt] of Object.entries(spendByCategory(monthTxs))) {
      const cat = categories.find(c => c.id === catId)?.name || catId;
      categoryBreakdown[cat] = amt;
    }

    // Data minimisation: send only the fields the assistant needs. No ids,
    // receipt images, notes, phone numbers or UPI ids leave the device.
    const payload = {
      message: String(message).slice(0, 2000),
      conversationHistory: (history || []).slice(-10).map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || m.text || "").slice(0, 2000)
      })),
      financialData: {
        firstName: (settings.name || "").split(" ")[0],
        profileType: settings.profileType,
        monthlyIncome: income,
        monthlyStats: {
          totalSpent,
          savings,
          savingsRate: income > 0 ? `${Math.round((savings / income) * 100)}%` : "unknown (no income recorded)",
          categoryBreakdown
        },
        recentTransactions: transactions
          .filter(countsTowardTotals)
          .slice(0, 15)
          .map(t => ({
            date: t.date,
            type: t.type,
            amount: t.amount,
            merchant: (t.merchant || "").slice(0, 60),
            category: categories.find(c => c.id === t.categoryId)?.name || t.categoryId,
            paymentMethod: t.paymentMethod
          })),
        budgets: budgets.map(b => ({ name: b.name, limit: b.amount, spent: b.spent, period: b.period })),
        recurring: recurring.filter(r => r.active).map(r => ({ name: r.name, amount: r.amount, renewal: r.nextRenewalDate })),
        groups: groups.map(g => ({
          name: g.name,
          budget: g.budget,
          totalExpenses: g.expenses.reduce((s, e) => s + safeRupees(e.amount), 0),
          outstandingSettlements: g.settlements.filter(s => s.status === "suggested").length
        })),
        goals: goals.map(g => ({ title: g.title, target: g.targetAmount, current: g.currentAmount }))
      }
    };

    try {
      if (settings.offlineMode) throw new Error("Offline mode: AI disabled");
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err) {
      return {
        reply: "I can help you review your recorded spending, check budget progress, or split expenses. What would you like to explore?",
        suggestedActions: []
      };
    }
  };

  // Quick 1-Tap Preset Expense Logger
  const addQuickExpense = (name: string, amount: number, categoryId: string, paymentMethod: any = "upi") => {
    addTransaction({
      amount,
      type: "expense",
      currency: "INR",
      merchant: name,
      description: name,
      categoryId,
      date: localDateString(),
      time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }),
      paymentMethod,
      source: "manual",
      status: "verified",
      confidence: 1.0,
      notes: "1-Tap Quick Logged",
      tags: ["quick-add"]
    });
  };

  // Group Management (Universal for any trip, apartment, or outing)
  const addGroup = (
    name: string,
    description: string,
    budget?: number,
    newMembers: { name: string; phone?: string; upiId?: string }[] = [],
    coverEmoji: string = "👥"
  ): Group => {
    const memberList = [
      // No default UPI ID: a hardcoded one would send settlement requests to the wrong person.
      { id: "m-henil", name: settings.name || "You", isCurrentUser: true },
      ...newMembers.map((m, idx) => ({
        id: `m-${Date.now()}-${idx}`,
        name: m.name,
        phone: m.phone,
        upiId: m.upiId
      }))
    ];

    const newGroup: Group = {
      id: `grp-${Date.now()}`,
      name,
      description: description || "Group expense tracker",
      coverEmoji: coverEmoji || "👥",
      budget: budget && budget > 0 ? budget : undefined,
      currency: "INR",
      createdBy: "m-henil",
      createdAt: localDateString(),
      inviteCode: "", // no join-by-code flow exists on device; account groups use per-seat invites
      members: memberList,
      expenses: [],
      settlements: []
    };

    setGroups(prev => [newGroup, ...prev]);
    setSelectedGroupId(newGroup.id);
    setActiveGroup(newGroup);
    groupOp(() => createRemoteGroup(name, newGroup.description, newGroup.coverEmoji, budget, newMembers),
      (id: string) => setSelectedGroupId(id));
    return newGroup;
  };

  const createGroup = (
    name: string,
    coverEmoji: string = "✨",
    membersList: string[] = [],
    budget?: number,
    description: string = "Shared expenses & splits"
  ): Group => {
    const filteredMembers = membersList
      .map(m => m.trim())
      .filter(m => m.length > 0 && !m.toLowerCase().includes("you"));

    // No invented UPI IDs: a guessed handle could route a real payment to a stranger.
    const memberObjs = filteredMembers.map(mName => ({ name: mName }));

    return addGroup(name, description, budget, memberObjs, coverEmoji);
  };

  const createGroupFromPreset = (presetId: string, customName?: string): Group => {
    const tpl = GROUP_TEMPLATES.find(t => t.id === presetId) || GROUP_TEMPLATES[0];
    const name = customName || tpl.sampleName;
    const memberObjs = tpl.suggestedMembers
      .filter(m => !m.toLowerCase().includes("you"))
      .map(mName => ({ name: mName }));

    return addGroup(name, tpl.sampleDesc, tpl.defaultBudget, memberObjs, tpl.emoji);
  };

  const deleteGroup = (groupId: string) => {
    groupOp(() => archiveRemoteGroup(groupId));
    setGroups(prev => {
      const remaining = prev.filter(g => g.id !== groupId);
      if (selectedGroupId === groupId && remaining.length > 0) {
        setSelectedGroupId(remaining[0].id);
        setActiveGroup(remaining[0]);
      }
      return remaining;
    });
  };

  const deleteGroupExpense = (groupId: string, expenseId: string, opts: { confirmBalanceChange?: boolean } = {}) => {
    // Account mode: the server voids the expense and its linked personal entry; pull both back.
    const remote = groupOp(() => voidRemoteExpense(groupId, expenseId, !!opts.confirmBalanceChange),
      () => syncNow(true));
    if (!remote) {
      // Device mode: remove the personal entry that mirrored this expense, if any.
      transactions.filter(t => t.groupExpenseId === expenseId).forEach(t => deleteTransaction(t.id));
    }
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const updatedExpenses = g.expenses.filter(e => e.id !== expenseId);
        const updatedGroup = { ...g, expenses: updatedExpenses };
        return {
          ...updatedGroup,
          settlements: recomputeSettlements(updatedGroup)
        };
      }
      return g;
    }));
  };

  const addGroupExpense = (groupId: string, expenseData: Omit<GroupExpense, "id" | "groupId" | "createdAt">) => {
    const amount = Math.abs(safeRupees(expenseData.amount));
    if (amount <= 0) return;
    expenseData = { ...expenseData, amount };
    const newExpense: GroupExpense = {
      ...expenseData,
      id: `ge-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      groupId,
      createdAt: new Date().toISOString()
    };

    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const updatedExpenses = [newExpense, ...g.expenses];
        const updatedGroup = { ...g, expenses: updatedExpenses };
        return {
          ...updatedGroup,
          settlements: recomputeSettlements(updatedGroup)
        };
      }
      return g;
    }));

    const currentMemberId = groups.find(g => g.id === groupId)?.members.find(m => m.isCurrentUser)?.id;
    const iPaid = expenseData.paidByMemberId === currentMemberId;
    // Account mode: the server records my personal entry (linked, voided with the expense).
    const remote = groupOp(
      () => addRemoteExpense(groupId, expenseData, newKey("ge"), iPaid ? refsRef.current?.bankId : undefined),
      () => { if (iPaid) syncNow(true); });

    // Device mode: if paid by current user, log it in personal transactions too (linked to the expense)
    if (!remote && iPaid) {
      addTransaction({
        amount: expenseData.amount,
        type: "expense",
        currency: expenseData.currency || "INR",
        merchant: expenseData.description,
        description: `Group: ${expenseData.description}`,
        categoryId: expenseData.categoryId,
        date: expenseData.date,
        time: expenseData.time,
        paymentMethod: "upi",
        source: "manual",
        groupId: groupId,
        status: "verified",
        confidence: 1.0,
        notes: `Paid for group members (${expenseData.participants.length} people)`,
        tags: ["group-expense"],
        groupExpenseId: newExpense.id
      });
    }
  };

  const settleGroupPayment = (groupId: string, fromMemberId: string, toMemberId: string, amount: number, method: PaymentMethod = "upi") => {
    groupOp(() => recordRemoteSettlement(groupId, fromMemberId, toMemberId, amount, method, newKey("gs")));
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const existingSettlement = g.settlements.find(
          s => s.fromMemberId === fromMemberId && s.toMemberId === toMemberId && s.status === "suggested"
        );
        amount = normalizeRupees(Math.abs(safeRupees(amount)));
        if (amount <= 0) return g;

        let updatedSettlements: Settlement[];
        if (existingSettlement) {
          updatedSettlements = g.settlements.map(s => {
            if (s.id === existingSettlement.id) {
              return {
                ...s,
                status: "marked_paid" as const,
                settledAt: new Date().toISOString(),
                paymentMethod: method
              };
            }
            return s;
          });
        } else {
          const newSettlement: Settlement = {
            id: `set-${Date.now()}`,
            groupId,
            fromMemberId,
            toMemberId,
            amount,
            currency: "INR",
            status: "marked_paid",
            settledAt: new Date().toISOString(),
            paymentMethod: method
          };
          updatedSettlements = [...g.settlements, newSettlement];
        }

        return {
          ...g,
          settlements: recomputeSettlements({ ...g, settlements: updatedSettlements })
        };
      }
      return g;
    }));

    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.65 }
      });
    } catch {}
  };

  const markSettlementPaid = (groupId: string, settlementId: string, method = "upi") => {
    const target = groups.find(g => g.id === groupId)?.settlements.find(x => x.id === settlementId);
    if (target) {
      groupOp(() => recordRemoteSettlement(groupId, target.fromMemberId, target.toMemberId, target.amount, method,
        newKey("gs")));
    }
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const updated = g.settlements.map(s => {
          if (s.id === settlementId) {
            return {
              ...s,
              status: "marked_paid" as const,
              settledAt: new Date().toISOString(),
              paymentMethod: method
            };
          }
          return s;
        });
        // Recompute what is still outstanding after this payment.
        return { ...g, settlements: recomputeSettlements({ ...g, settlements: updated }) };
      }
      return g;
    }));

    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.65 }
      });
    } catch {}
  };

  const refreshGroups = async (selectId?: string) => {
    if (PROFILE.kind !== "cloud") return;
    const fresh = await pullGroups();
    setGroups(fresh);
    if (selectId && fresh.some(g => g.id === selectId)) setSelectedGroupId(selectId);
  };

  const editGroupExpense = async (groupId: string, expenseId: string,
    changes: { description?: string; amountRupees?: number }) => {
    if (PROFILE.kind !== "cloud") return;
    await editRemoteExpense(groupId, expenseId, changes);
    await refreshGroups(groupId);
    syncNow(true);
  };

  const undoGroupSettlement = async (groupId: string, settlementId: string) => {
    if (PROFILE.kind !== "cloud") return;
    await undoRemoteSettlement(groupId, settlementId);
    await refreshGroups(groupId);
    syncNow(true);
  };

  const linkGroupLedger = async (groupId: string) => {
    if (PROFILE.kind !== "cloud") return;
    const refs = refsRef.current || (refsRef.current = await ensureAccounts());
    await linkRemoteLedger(groupId, refs.bankId);
    await refreshGroups(groupId);
    syncNow(true);
  };

  const addGroupMember = async (groupId: string, name: string, upiId?: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (PROFILE.kind === "cloud") {
      await addRemoteMember(groupId, clean, upiId);
      await refreshGroups(groupId);
      return;
    }
    // Device mode: no invented UPI ID; the person adds their own (or it stays empty).
    setGroups(prev => prev.map(g => g.id === groupId
      ? { ...g, members: [...g.members, { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: clean,
          upiId: upiId?.trim() || undefined }] }
      : g));
  };

  const updateGroup = (updated: Group) => {
    groupOp(() => api("PATCH", `/api/v1/groups/${updated.id}`, {
      name: updated.name, description: updated.description,
      budget_paise: updated.budget && updated.budget > 0 ? toPaise(updated.budget) : undefined }));
    const withOptimized = {
      ...updated,
      settlements: recomputeSettlements(updated)
    };
    setGroups(prev => prev.map(g => (g.id === updated.id ? withOptimized : g)));
  };

  const generateWhatsAppSummary = (groupId: string): string => {
    const targetGroup = groups.find(g => g.id === groupId);
    if (!targetGroup) return "";

    const totalSpend = targetGroup.expenses.reduce((s, e) => s + e.amount, 0);
    const activeSettlements = targetGroup.settlements.filter(s => s.status === "suggested");

    let text = `💼 *${targetGroup.coverEmoji || "👥"} ${targetGroup.name} — Expense Summary*\n`;
    text += `💰 *Total Group Spend:* ₹${totalSpend.toLocaleString("en-IN")}\n`;
    text += `👥 *Members:* ${targetGroup.members.map(m => m.name).join(", ")}\n\n`;
    text += `⚡ *Settlements to Pay:*\n`;

    if (activeSettlements.length === 0) {
      text += `🎉 All expenses are fully settled! No pending dues.\n`;
    } else {
      activeSettlements.forEach(s => {
        const fromName = targetGroup.members.find(m => m.id === s.fromMemberId)?.name || "Member";
        const toName = targetGroup.members.find(m => m.id === s.toMemberId)?.name || "Member";
        const toUpi = targetGroup.members.find(m => m.id === s.toMemberId)?.upiId;
        text += `👉 *${fromName}* pays *${toName}*: ₹${s.amount.toLocaleString("en-IN")}`;
        if (toUpi) text += ` (UPI: ${toUpi})`;
        text += `\n`;
      });
    }

    text += `\n✨ _Calculated with optimized minimal transfers on Bagla Finance._`;
    return text;
  };

  // Budgets & Goals
  const addBudget = (b: Omit<Budget, "id" | "spent">) => {
    const newB: Budget = {
      ...b,
      id: `b-${Date.now()}`,
      spent: 0
    };
    setBudgets(prev => [...prev, newB]);
    queue({ kind: "budget_create", localId: newB.id, budget: b });
  };

  const updateBudget = (id: string, updates: Partial<Budget>) => {
    setBudgets(prev => prev.map(b => (b.id === id ? { ...b, ...updates } : b)));
    queue({ kind: "budget_update", localId: id, updates });
  };

  const deleteBudget = (id: string) => {
    setBudgets(prev => prev.filter(b => b.id !== id));
    queue({ kind: "budget_update", localId: id, updates: { isArchived: true } as any });
  };

  const addGoal = (g: Omit<FinancialGoal, "id" | "createdAt">) => {
    const newGoal: FinancialGoal = {
      ...g,
      id: `goal-${Date.now()}`,
      createdAt: localDateString()
    };
    setGoals(prev => [...prev, newGoal]);
    queue({ kind: "goal_create", localId: newGoal.id, goal: newGoal });
  };

  const updateGoalAmount = (id: string, amountToAdd: number) => {
    queue({ kind: "goal_contrib", localId: id, amountRupees: amountToAdd });
    setGoals(prev => prev.map(g => {
      if (g.id === id) {
        const updated = g.currentAmount + amountToAdd;
        if (updated >= g.targetAmount && g.currentAmount < g.targetAmount) {
          try {
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
          } catch {}
        }
        return { ...g, currentAmount: updated };
      }
      return g;
    }));
  };

  // Subscriptions
  const addRecurring = (r: Omit<RecurringExpense, "id">) => {
    const newRec: RecurringExpense = {
      ...r,
      id: `rec-${Date.now()}`
    };
    setRecurring(prev => [...prev, newRec]);
  };

  const toggleRecurring = (id: string) => {
    setRecurring(prev => prev.map(r => (r.id === id ? { ...r, active: !r.active } : r)));
  };

  const deleteRecurring = (id: string) => {
    setRecurring(prev => prev.filter(r => r.id !== id));
  };

  // Cash Wallet
  const adjustCashWallet = (newBalance: number, reason: string) => {
    // In account mode the count difference is recorded as an audited adjustment entry.
    const diffPaise = Math.round(normalizeRupees(safeRupees(newBalance)) * 100) - Math.round(safeRupees(cashWallet.currentBalance) * 100);
    if (diffPaise !== 0) queue({ kind: "tx_adjust", localId: `adj-${Date.now()}`, amountPaise: Math.abs(diffPaise),
      direction: diffPaise > 0 ? "credit" : "debit" });
    setCashWallet({
      openingBalance: normalizeRupees(safeRupees(newBalance)),
      cashReceived: 0,
      cashSpent: 0,
      currentBalance: normalizeRupees(safeRupees(newBalance)),
      lastAdjustedDate: localDateString()
    });
  };

  // Family Space
  const updateFamilySpace = (f: FamilySpace) => {
    setFamilySpace(f);
  };

  // Statement Import Ingestion
  const importStatementTransactions = (items: StatementImportPreviewItem[]) => {
    const selected = items.filter(i => i.selected && Math.abs(safeRupees(i.amount)) > 0);
    const newTxs: Transaction[] = selected.map(item => ({
      id: `tx-imp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: "local-user",
      amount: Math.abs(safeRupees(item.amount)),
      type: item.type,
      currency: "INR",
      merchant: item.merchant || "Statement Item",
      description: item.description,
      categoryId: item.suggestedCategory || "cat-other",
      date: item.date,
      time: "12:00",
      paymentMethod: item.paymentMethod || "bank_transfer",
      source: "imported",
      status: item.isDuplicate ? "duplicate_flagged" : "verified",
      confidence: 0.95,
      tags: ["statement-import"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    setTransactions(prev => [...newTxs, ...prev]);
  };

  const dismissAnomaly = (id: string) => {
    setAnomalies(prev => prev.filter(a => a.id !== id));
  };

  // Privacy & Consent State
  const [connectorStatus, setConnectorStatus] = useState({
    // Consent must be opt-in (DPDP). Neither integration exists yet in any case.
    aaConsentGranted: false,
    smsNotificationListening: false,
    biometricLocked: false
  });

  const toggleDataConsent = (key: "aaConsentGranted" | "smsNotificationListening") => {
    setConnectorStatus(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const deleteAccountData = () => {
    clearActiveProfileStorage();
    setTransactions([]);
    setBudgets([]);
    setGroups([]);
    setRecurring([]);
    setGoals([]);
    setAnomalies([]);
    setSettingsState({
      ...INITIAL_USER_SETTINGS,
      name: "User",
      monthlyIncome: 0,
      dailyBudgetLimit: 0
    });
  };

  const toggleStealthMode = () => {
    setSettingsState(prev => {
      const next = { ...prev, stealthMode: !prev.stealthMode };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      return next;
    });
  };

  const formatCurrency = (amount: number, overrideStealth = false) => {
    if (settings.stealthMode && !overrideStealth) {
      return "••••••";
    }
    return formatINR(amount);
  };

  // Set (or clear, with "") the app-lock PIN. Only a salted PBKDF2 hash is stored.
  const setAppPasscode = async (pin: string): Promise<boolean> => {
    if (pin === "") {
      setSettingsState(prev => {
        const { passcode: _legacy, passcodeHash: _h, ...rest } = prev;
        const next = { ...rest, passcodeLockEnabled: false, isAppLocked: false, failedPinAttempts: 0 };
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
        return next;
      });
      return true;
    }
    if (!isValidPin(pin)) return false;
    const passcodeHash = await hashPin(pin);
    setSettingsState(prev => {
      const { passcode: _legacy, ...rest } = prev;
      const next = { ...rest, passcodeHash, passcodeLockEnabled: true, failedPinAttempts: 0 };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      return next;
    });
    return true;
  };

  // One-time migration: hash any legacy plain-text PIN and delete it.
  useEffect(() => {
    const legacy = settings.passcode;
    if (!legacy) return;
    if (isValidPin(legacy)) {
      void setAppPasscode(legacy);
    } else {
      setSettingsState(prev => {
        const { passcode: _legacy, ...rest } = prev;
        return { ...rest, passcodeLockEnabled: false, isAppLocked: false };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.passcode]);

  const lockApp = () => {
    // Without a PIN there is nothing to unlock with; don't trap the user.
    if (!settings.passcodeHash) return;
    setSettingsState(prev => {
      const next = { ...prev, isAppLocked: true };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      return next;
    });
  };

  // No master/default PIN. Wrong guesses trigger an increasing wait.
  const unlockApp = async (pinAttempt: string): Promise<{ ok: boolean; retryInMs?: number }> => {
    if (!settings.passcodeHash) {
      setSettingsState(prev => ({ ...prev, isAppLocked: false }));
      return { ok: true };
    }
    const failures = settings.failedPinAttempts || 0;
    const wait = lockoutDelayMs(failures) - (Date.now() - (settings.lastFailedPinAt || 0));
    if (wait > 0) return { ok: false, retryInMs: wait };

    const ok = await verifyPin(pinAttempt, settings.passcodeHash);
    setSettingsState(prev => {
      const next = ok
        ? { ...prev, isAppLocked: false, failedPinAttempts: 0, lastFailedPinAt: undefined }
        : { ...prev, failedPinAttempts: (prev.failedPinAttempts || 0) + 1, lastFailedPinAt: Date.now() };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      return next;
    });
    return ok ? { ok: true } : { ok: false, retryInMs: lockoutDelayMs(failures + 1) || undefined };
  };

  const quickLogCash = (amount: number, description: string, categoryId = "cat-food") => {
    // Goes through addTransaction so validation, duplicate checks and the
    // cash-wallet effect are identical to every other entry path. The wallet
    // may go negative; clamping to 0 used to hide unrecorded cash income.
    const result = addTransaction({
      amount,
      type: "expense",
      currency: "INR",
      merchant: description,
      description: `Cash spend: ${description}`,
      categoryId,
      date: localDateString(),
      time: localTimeString(),
      paymentMethod: "cash",
      source: "manual",
      status: "verified",
      confidence: 1.0,
      tags: ["cash-entry", "nightly-reconcile"]
    });
    if (!result.success) return;

    try {
      confetti({
        particleCount: 35,
        spread: 60,
        origin: { y: 0.85 }
      });
    } catch (e) {}
  };

  const dismissLiveSyncNotification = () => {
    setLiveSyncNotification(null);
  };

  const simulateIncomingPayment = (
    provider: "GPay" | "PhonePe" | "Paytm" | "CRED" | "HDFC",
    amount: number,
    merchant: string,
    categoryId = "cat-food"
  ) => {
    const todayStr = localDateString();
    const nowTime = new Date().toTimeString().slice(0, 5);
    const txId = `tx-autosync-${Date.now()}`;

    const newTx: Transaction = {
      id: txId,
      userId: "local-user",
      amount: Math.abs(amount),
      type: "expense",
      currency: "INR",
      merchant,
      description: `Auto-recorded via ${provider} webhook sync`,
      categoryId,
      date: todayStr,
      time: nowTime,
      paymentMethod: "upi",
      source: "connected",
      status: "verified",
      confidence: 0.99,
      tags: ["auto-sync", provider.toLowerCase(), "webhook"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setTransactions(prev => [newTx, ...prev]);

    const catObj = categories.find(c => c.id === categoryId);
    const catName = catObj ? catObj.name : "Dining";

    setLiveSyncNotification({
      provider,
      amount,
      merchant,
      category: catName,
      id: txId
    });

    try {
      confetti({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.2 }
      });
    } catch (e) {}
  };

  const exportEncryptedLedger = () => {
    const backup = {
      app: "Bagla Finance Ledger",
      version: "2.5.0",
      timestamp: new Date().toISOString(),
      // Honest label: this file is NOT encrypted. Store it somewhere safe.
      encryption: "none (plain JSON export)",
      data: {
        // Never export the PIN hash or lock state.
        settings: (({ passcode, passcodeHash, failedPinAttempts, lastFailedPinAt, isAppLocked, ...rest }) => rest)(settings),
        transactions,
        categories,
        budgets,
        groups,
        familySpace,
        recurring,
        goals,
        cashWallet
      }
    };
    return JSON.stringify(backup, null, 2);
  };

  const loadSampleData = () => {
    if (PROFILE.kind === "cloud") return; // never mix demo data into a real account
    setSettingsState(prev => {
      const next = { ...INITIAL_USER_SETTINGS, isDemoMode: true };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      return next;
    });
    setTransactions(INITIAL_TRANSACTIONS);
    setCategories(DEFAULT_CATEGORIES);
    setBudgets(INITIAL_BUDGETS);
    setGroups(INITIAL_GROUPS.map(g => ({ ...g, settlements: recomputeSettlements(g) })));
    setSelectedGroupId(INITIAL_GROUPS[0]?.id || "");
    setFamilySpace(INITIAL_FAMILY_SPACE);
    setRecurring(INITIAL_RECURRING);
    setGoals(INITIAL_GOALS);
    setCashWallet(INITIAL_CASH_WALLET);
    setConnections(INITIAL_CONNECTIONS);
    setAnomalies(INITIAL_ANOMALIES);
  };

  const toggleDemoMode = () => {
    if (PROFILE.kind === "cloud") return;
    const nextDemo = !settings.isDemoMode;
    if (nextDemo) {
      loadSampleData();
    } else {
      // Switch to real empty/clean mode
      setSettingsState(prev => {
        const next = {
          ...prev,
          name: prev.name === "Henil" ? "My Workspace" : prev.name,
          isDemoMode: false
        };
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
        return next;
      });
      // Clear storage for fresh user real data
      localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
      localStorage.removeItem(STORAGE_KEYS.BUDGETS);
      localStorage.removeItem(STORAGE_KEYS.GROUPS);
      localStorage.removeItem(STORAGE_KEYS.FAMILY);
      localStorage.removeItem(STORAGE_KEYS.RECURRING);
      localStorage.removeItem(STORAGE_KEYS.GOALS);
      localStorage.removeItem(STORAGE_KEYS.CASH);
      localStorage.removeItem(STORAGE_KEYS.CONNECTIONS);
      localStorage.removeItem(STORAGE_KEYS.ANOMALIES);

      setTransactions([]);
      setBudgets([]);
      setGroups([]);
      setSelectedGroupId("");
      setFamilySpace({
        id: "fam-space-empty",
        name: "Household Space",
        members: [],
        sharedCategories: [],
        monthlyBudget: 0
      });
      setRecurring([]);
      setGoals([]);
      setCashWallet({
        openingBalance: 0,
        cashReceived: 0,
        cashSpent: 0,
        currentBalance: 0,
        lastAdjustedDate: localDateString()
      });
      setConnections([]);
      setAnomalies([]);
    }
  };

  const resetToSampleData = () => {
    clearActiveProfileStorage();
    loadSampleData();
  };

  return (
    <FinanceContext.Provider
      value={{
        settings,
        transactions,
        categories,
        budgets,
        groups,
        activeGroup,
        selectedGroupId,
        familySpace,
        recurring,
        goals,
        cashWallet,
        connections,
        anomalies,
        healthScore,
        isOnline,
        currentTab,
        isAddExpenseOpen,
        isVoiceModalOpen,
        isReceiptModalOpen,
        isDailySummaryOpen,
        isAiChatOpen,
        isNightlyCashModalOpen,
        setIsNightlyCashModalOpen,
        isLiveSyncModalOpen,
        setIsLiveSyncModalOpen,
        liveSyncNotification,
        dismissLiveSyncNotification,
        setCurrentTab,
        setSettings,
        setIsAddExpenseOpen,
        setIsVoiceModalOpen,
        setIsReceiptModalOpen,
        setIsDailySummaryOpen,
        setIsAiChatOpen,
        setActiveGroup,
        setSelectedGroupId,
        addTransaction,
        addQuickExpense,
        quickLogCash,
        simulateIncomingPayment,
        updateTransaction,
        deleteTransaction,
        parseNaturalLanguageExpense,
        scanReceiptImage,
        askBaglaAi,
        addGroup,
        createGroup,
        createGroupFromPreset,
        addGroupExpense,
        deleteGroup,
        deleteGroupExpense,
        settleGroupPayment,
        markSettlementPaid,
        updateGroup,
        addGroupMember,
        refreshGroups,
        linkGroupLedger,
        editGroupExpense,
        undoGroupSettlement,
        generateWhatsAppSummary,
        addBudget,
        updateBudget,
        deleteBudget,
        addGoal,
        updateGoalAmount,
        addRecurring,
        toggleRecurring,
        deleteRecurring,
        adjustCashWallet,
        updateFamilySpace,
        importStatementTransactions,
        dismissAnomaly,
        resetToSampleData,
        loadSampleData,
        toggleDemoMode,
        connectorStatus,
        toggleDataConsent,
        deleteAccountData,
        toggleStealthMode,
        formatCurrency,
        setAppPasscode,
        lockApp,
        unlockApp,
        exportEncryptedLedger,
        cloud,
        syncNow
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error("useFinance must be used within a FinanceProvider");
  }
  return context;
};
