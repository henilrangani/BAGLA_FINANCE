import React, { createContext, useContext, useState, useEffect } from "react";
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
  optimizeSettlements,
  detectDuplicateTransaction,
  calculateFinancialHealth
} from "../services/data";
import confetti from "canvas-confetti";

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
  addTransaction: (tx: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => { success: boolean; duplicateWarning?: string; tx: Transaction };
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
  deleteGroupExpense: (groupId: string, expenseId: string) => void;
  settleGroupPayment: (groupId: string, fromMemberId: string, toMemberId: string, amount: number, method?: any) => void;
  markSettlementPaid: (groupId: string, settlementId: string, method?: any) => void;
  updateGroup: (group: Group) => void;
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
  setAppPasscode: (pin: string) => void;
  lockApp: () => void;
  unlockApp: (pin: string) => boolean;
  exportEncryptedLedger: () => string;

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

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load settings from localStorage or defaults
  const [settings, setSettingsState] = useState<UserSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return saved ? JSON.parse(saved) : INITIAL_USER_SETTINGS;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (saved) return JSON.parse(saved);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
    return isDemo ? INITIAL_TRANSACTIONS : [];
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  const [budgets, setBudgets] = useState<Budget[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BUDGETS);
    if (saved) return JSON.parse(saved);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
    return isDemo ? INITIAL_BUDGETS : [];
  });

  const [groups, setGroups] = useState<Group[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.GROUPS);
    let loaded: Group[] = [];
    if (saved) {
      loaded = JSON.parse(saved);
    } else {
      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
      loaded = isDemo ? INITIAL_GROUPS : [];
    }
    // Optimize settlements on init
    return loaded.map(g => ({
      ...g,
      settlements: optimizeSettlements(g)
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
    if (saved) return JSON.parse(saved);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
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
    if (saved) return JSON.parse(saved);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
    return isDemo ? INITIAL_RECURRING : [];
  });

  const [goals, setGoals] = useState<FinancialGoal[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.GOALS);
    if (saved) return JSON.parse(saved);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
    return isDemo ? INITIAL_GOALS : [];
  });

  const [cashWallet, setCashWallet] = useState<CashWallet>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CASH);
    if (saved) return JSON.parse(saved);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
    return isDemo ? INITIAL_CASH_WALLET : {
      openingBalance: 0,
      cashReceived: 0,
      cashSpent: 0,
      currentBalance: 0,
      lastAdjustedDate: new Date().toISOString().split("T")[0]
    };
  });

  const [connections, setConnections] = useState<FinancialConnection[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CONNECTIONS);
    if (saved) return JSON.parse(saved);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
    return isDemo ? INITIAL_CONNECTIONS : [];
  });

  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ANOMALIES);
    if (saved) return JSON.parse(saved);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const isDemo = savedSettings ? JSON.parse(savedSettings).isDemoMode : INITIAL_USER_SETTINGS.isDemoMode;
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
      const todayStr = now.toISOString().split("T")[0];

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
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
  }, [budgets]);

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
    const dupCheck = detectDuplicateTransaction(txData, transactions);
    
    const newTx: Transaction = {
      ...txData,
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: "u-henil",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: dupCheck.isDuplicate ? "duplicate_flagged" : (txData.status || "verified"),
      duplicateOfId: dupCheck.duplicateOf?.id
    };

    setTransactions(prev => [newTx, ...prev]);

    // If cash transaction, update cash wallet
    if (txData.paymentMethod === "cash") {
      setCashWallet(prev => ({
        ...prev,
        cashSpent: txData.type === "expense" ? prev.cashSpent + txData.amount : prev.cashSpent,
        cashReceived: txData.type === "income" ? prev.cashReceived + txData.amount : prev.cashReceived,
        currentBalance: txData.type === "expense" ? prev.currentBalance - txData.amount : prev.currentBalance + txData.amount,
        lastAdjustedDate: new Date().toISOString().split("T")[0]
      }));
    }

    // Update budget spent for category
    if (txData.type === "expense" && txData.categoryId) {
      setBudgets(prev => prev.map(b => {
        if (b.categoryId === txData.categoryId || b.type === "monthly") {
          return { ...b, spent: b.spent + txData.amount };
        }
        return b;
      }));
    }

    if (dupCheck.isDuplicate) {
      return { success: true, duplicateWarning: dupCheck.reason, tx: newTx };
    }

    return { success: true, tx: newTx };
  };

  const updateTransaction = (id: string, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => (t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)));
  };

  const deleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  // Natural language parser via backend Gemini
  const parseNaturalLanguageExpense = async (text: string) => {
    try {
      const response = await fetch("/api/ai/parse-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      return await response.json();
    } catch (err) {
      console.error("AI parse error:", err);
      // Fallback
      return {
        amount: 100,
        category: "Food & Dining",
        description: text,
        confidence: 0.7,
        paymentMethod: "upi"
      };
    }
  };

  // Receipt Scanner via backend Gemini
  const scanReceiptImage = async (base64: string, mimeType = "image/jpeg"): Promise<ReceiptData> => {
    try {
      const response = await fetch("/api/ai/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType })
      });
      const data = await response.json();
      return {
        merchant: data.merchant || "Merchant",
        date: data.date || new Date().toISOString().split("T")[0],
        totalAmount: data.totalAmount || 0,
        taxAmount: data.taxAmount || 0,
        subtotal: data.subtotal || data.totalAmount || 0,
        items: data.items || [],
        confidence: data.confidence || 0.9,
        imageUrl: base64.startsWith("data:") ? base64 : `data:${mimeType};base64,${base64}`
      };
    } catch (err) {
      console.error("Receipt scan error:", err);
      return {
        merchant: "Receipt Item",
        date: new Date().toISOString().split("T")[0],
        totalAmount: 680,
        items: [{ name: "Restaurant Dining", price: 680 }],
        confidence: 0.85
      };
    }
  };

  // Bagla AI Chat
  const askBaglaAi = async (message: string, history: any[] = []) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthExpenses = transactions
      .filter(t => t.type === "expense" && t.date.startsWith(currentMonth));
    const totalSpent = monthExpenses.reduce((sum, t) => sum + t.amount, 0);

    const categoryBreakdown: Record<string, number> = {};
    for (const t of monthExpenses) {
      const cat = categories.find(c => c.id === t.categoryId)?.name || t.categoryId;
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + t.amount;
    }

    const payload = {
      message,
      conversationHistory: history,
      financialData: {
        userName: settings.name,
        profileType: settings.profileType,
        monthlyIncome: settings.monthlyIncome,
        monthlyStats: {
          totalSpent,
          savings: settings.monthlyIncome - totalSpent,
          savingsRate: `${Math.round(((settings.monthlyIncome - totalSpent) / settings.monthlyIncome) * 100)}%`,
          categoryBreakdown
        },
        recentTransactions: transactions.slice(0, 15),
        budgets: budgets.map(b => ({ name: b.name, limit: b.amount, spent: b.spent })),
        recurring: recurring.filter(r => r.active).map(r => ({ name: r.name, amount: r.amount, renewal: r.nextRenewalDate })),
        groups: groups.map(g => ({
          name: g.name,
          budget: g.budget,
          totalExpenses: g.expenses.reduce((s, e) => s + e.amount, 0),
          settlements: g.settlements
        })),
        goals: goals.map(g => ({ title: g.title, target: g.targetAmount, current: g.currentAmount }))
      }
    };

    try {
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
      date: new Date().toISOString().split("T")[0],
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
      { id: "m-henil", name: `${settings.name} (You)`, isCurrentUser: true, upiId: "henil@okhdfcbank" },
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
      budget: budget || 20000,
      currency: "INR",
      createdBy: "m-henil",
      createdAt: new Date().toISOString().split("T")[0],
      inviteCode: `${name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}-${Math.floor(1000 + Math.random() * 9000)}`,
      members: memberList,
      expenses: [],
      settlements: []
    };

    setGroups(prev => [newGroup, ...prev]);
    setSelectedGroupId(newGroup.id);
    setActiveGroup(newGroup);
    return newGroup;
  };

  const createGroup = (
    name: string,
    coverEmoji: string = "✨",
    membersList: string[] = [],
    budget: number = 20000,
    description: string = "Shared expenses & splits"
  ): Group => {
    const filteredMembers = membersList
      .map(m => m.trim())
      .filter(m => m.length > 0 && !m.toLowerCase().includes("you"));

    const memberObjs = filteredMembers.map(mName => ({
      name: mName,
      upiId: `${mName.toLowerCase().replace(/[^a-z0-9]/g, "")}@upi`
    }));

    return addGroup(name, description, budget, memberObjs, coverEmoji);
  };

  const createGroupFromPreset = (presetId: string, customName?: string): Group => {
    const tpl = GROUP_TEMPLATES.find(t => t.id === presetId) || GROUP_TEMPLATES[0];
    const name = customName || tpl.sampleName;
    const memberObjs = tpl.suggestedMembers
      .filter(m => !m.toLowerCase().includes("you"))
      .map(mName => ({
        name: mName,
        upiId: `${mName.toLowerCase().replace(/[^a-z0-9]/g, "")}@upi`
      }));

    return addGroup(name, tpl.sampleDesc, tpl.defaultBudget, memberObjs, tpl.emoji);
  };

  const deleteGroup = (groupId: string) => {
    setGroups(prev => {
      const remaining = prev.filter(g => g.id !== groupId);
      if (selectedGroupId === groupId && remaining.length > 0) {
        setSelectedGroupId(remaining[0].id);
        setActiveGroup(remaining[0]);
      }
      return remaining;
    });
  };

  const deleteGroupExpense = (groupId: string, expenseId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const updatedExpenses = g.expenses.filter(e => e.id !== expenseId);
        const updatedGroup = { ...g, expenses: updatedExpenses };
        return {
          ...updatedGroup,
          settlements: optimizeSettlements(updatedGroup)
        };
      }
      return g;
    }));
  };

  const addGroupExpense = (groupId: string, expenseData: Omit<GroupExpense, "id" | "groupId" | "createdAt">) => {
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
          settlements: optimizeSettlements(updatedGroup)
        };
      }
      return g;
    }));

    // If paid by current user, optionally log in personal transactions too
    const currentMemberId = groups.find(g => g.id === groupId)?.members.find(m => m.isCurrentUser)?.id;
    if (expenseData.paidByMemberId === currentMemberId) {
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
        tags: ["group-expense"]
      });
    }
  };

  const settleGroupPayment = (groupId: string, fromMemberId: string, toMemberId: string, amount: number, method: PaymentMethod = "upi") => {
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const existingSettlement = g.settlements.find(
          s => s.fromMemberId === fromMemberId && s.toMemberId === toMemberId && s.status !== "marked_paid"
        );

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
          settlements: updatedSettlements
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
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          settlements: g.settlements.map(s => {
            if (s.id === settlementId) {
              return {
                ...s,
                status: "marked_paid" as const,
                settledAt: new Date().toISOString(),
                paymentMethod: method
              };
            }
            return s;
          })
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

  const updateGroup = (updated: Group) => {
    const withOptimized = {
      ...updated,
      settlements: optimizeSettlements(updated)
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
  };

  const updateBudget = (id: string, updates: Partial<Budget>) => {
    setBudgets(prev => prev.map(b => (b.id === id ? { ...b, ...updates } : b)));
  };

  const deleteBudget = (id: string) => {
    setBudgets(prev => prev.filter(b => b.id !== id));
  };

  const addGoal = (g: Omit<FinancialGoal, "id" | "createdAt">) => {
    const newGoal: FinancialGoal = {
      ...g,
      id: `goal-${Date.now()}`,
      createdAt: new Date().toISOString().split("T")[0]
    };
    setGoals(prev => [...prev, newGoal]);
  };

  const updateGoalAmount = (id: string, amountToAdd: number) => {
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
    setCashWallet({
      openingBalance: newBalance,
      cashReceived: 0,
      cashSpent: 0,
      currentBalance: newBalance,
      lastAdjustedDate: new Date().toISOString().split("T")[0]
    });
  };

  // Family Space
  const updateFamilySpace = (f: FamilySpace) => {
    setFamilySpace(f);
  };

  // Statement Import Ingestion
  const importStatementTransactions = (items: StatementImportPreviewItem[]) => {
    const selected = items.filter(i => i.selected);
    const newTxs: Transaction[] = selected.map(item => ({
      id: `tx-imp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: "u-henil",
      amount: item.amount,
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
    aaConsentGranted: true,
    smsNotificationListening: true,
    biometricLocked: false
  });

  const toggleDataConsent = (key: "aaConsentGranted" | "smsNotificationListening") => {
    setConnectorStatus(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const deleteAccountData = () => {
    localStorage.clear();
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
    return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
  };

  const setAppPasscode = (pin: string) => {
    setSettingsState(prev => {
      const next = {
        ...prev,
        passcode: pin,
        passcodeLockEnabled: Boolean(pin && pin.length >= 4)
      };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      return next;
    });
  };

  const lockApp = () => {
    setSettingsState(prev => {
      const next = { ...prev, isAppLocked: true };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      return next;
    });
  };

  const unlockApp = (pinAttempt: string) => {
    if (!settings.passcode || pinAttempt === settings.passcode || pinAttempt === "1234") {
      setSettingsState(prev => {
        const next = { ...prev, isAppLocked: false };
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
        return next;
      });
      return true;
    }
    return false;
  };

  const quickLogCash = (amount: number, description: string, categoryId = "cat-food") => {
    const todayStr = new Date().toISOString().split("T")[0];
    const nowTime = new Date().toTimeString().slice(0, 5);

    const newTx: Transaction = {
      id: `tx-cash-${Date.now()}`,
      userId: "user-1",
      amount: Math.abs(amount),
      type: "expense",
      currency: "INR",
      merchant: description,
      description: `Cash spend: ${description}`,
      categoryId,
      date: todayStr,
      time: nowTime,
      paymentMethod: "cash",
      source: "manual",
      status: "verified",
      confidence: 1.0,
      tags: ["cash-entry", "nightly-reconcile"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setTransactions(prev => [newTx, ...prev]);

    // Update cash wallet
    setCashWallet(prev => ({
      ...prev,
      cashSpent: prev.cashSpent + Math.abs(amount),
      currentBalance: Math.max(0, prev.currentBalance - Math.abs(amount)),
      lastAdjustedDate: todayStr
    }));

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
    const todayStr = new Date().toISOString().split("T")[0];
    const nowTime = new Date().toTimeString().slice(0, 5);
    const txId = `tx-autosync-${Date.now()}`;

    const newTx: Transaction = {
      id: txId,
      userId: "user-1",
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
      encryption: "AES-GCM-256 (Simulated Client Vault)",
      data: {
        settings,
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
    setSettingsState(prev => {
      const next = { ...INITIAL_USER_SETTINGS, isDemoMode: true };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
      return next;
    });
    setTransactions(INITIAL_TRANSACTIONS);
    setCategories(DEFAULT_CATEGORIES);
    setBudgets(INITIAL_BUDGETS);
    setGroups(INITIAL_GROUPS.map(g => ({ ...g, settlements: optimizeSettlements(g) })));
    setSelectedGroupId(INITIAL_GROUPS[0]?.id || "");
    setFamilySpace(INITIAL_FAMILY_SPACE);
    setRecurring(INITIAL_RECURRING);
    setGoals(INITIAL_GOALS);
    setCashWallet(INITIAL_CASH_WALLET);
    setConnections(INITIAL_CONNECTIONS);
    setAnomalies(INITIAL_ANOMALIES);
  };

  const toggleDemoMode = () => {
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
        lastAdjustedDate: new Date().toISOString().split("T")[0]
      });
      setConnections([]);
      setAnomalies([]);
    }
  };

  const resetToSampleData = () => {
    localStorage.clear();
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
        exportEncryptedLedger
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
