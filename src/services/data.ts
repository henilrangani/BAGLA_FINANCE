import {
  Category,
  Transaction,
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
  Settlement
} from "../types";
import { daysBetween, localDateString, localMonthPrefix } from "../utils/dates";
import { allocatePaise, formatINR, fromPaise, safeRupees, toPaise } from "../utils/money";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-food", name: "Food & Dining", icon: "Utensils", color: "#f97316", defaultType: "expense", budgetLimit: 8000 },
  { id: "cat-groceries", name: "Groceries", icon: "ShoppingCart", color: "#10b981", defaultType: "expense", budgetLimit: 6000 },
  { id: "cat-transport", name: "Transport & Commute", icon: "Car", color: "#3b82f6", defaultType: "expense", budgetLimit: 4000 },
  { id: "cat-fuel", name: "Fuel", icon: "Fuel", color: "#6366f1", defaultType: "expense", budgetLimit: 3000 },
  { id: "cat-travel", name: "Travel & Trips", icon: "Plane", color: "#06b6d4", defaultType: "expense", budgetLimit: 10000 },
  { id: "cat-shopping", name: "Shopping", icon: "ShoppingBag", color: "#ec4899", defaultType: "expense", budgetLimit: 5000 },
  { id: "cat-entertainment", name: "Entertainment", icon: "Film", color: "#8b5cf6", defaultType: "expense", budgetLimit: 2500 },
  { id: "cat-bills", name: "Bills & Utilities", icon: "Receipt", color: "#ef4444", defaultType: "expense", budgetLimit: 5000 },
  { id: "cat-electricity", name: "Electricity", icon: "Zap", color: "#eab308", defaultType: "expense", budgetLimit: 2000 },
  { id: "cat-internet", name: "Internet & Wifi", icon: "Wifi", color: "#0284c7", defaultType: "expense", budgetLimit: 1200 },
  { id: "cat-education", name: "Education & Courses", icon: "GraduationCap", color: "#14b8a6", defaultType: "expense", budgetLimit: 3000 },
  { id: "cat-healthcare", name: "Healthcare & Meds", icon: "HeartPulse", color: "#f43f5e", defaultType: "expense", budgetLimit: 3000 },
  { id: "cat-rent", name: "Rent & Housing", icon: "Home", color: "#64748b", defaultType: "expense", budgetLimit: 15000 },
  { id: "cat-insurance", name: "Insurance", icon: "ShieldCheck", color: "#047857", defaultType: "expense", budgetLimit: 2500 },
  { id: "cat-subscriptions", name: "Subscriptions", icon: "Tv", color: "#a855f7", defaultType: "expense", budgetLimit: 2000 },
  { id: "cat-personal", name: "Personal Care", icon: "Sparkles", color: "#d946ef", defaultType: "expense", budgetLimit: 2000 },
  { id: "cat-family", name: "Family & Home", icon: "Users", color: "#f59e0b", defaultType: "expense", budgetLimit: 5000 },
  { id: "cat-gifts", name: "Gifts & Donations", icon: "Gift", color: "#e11d48", defaultType: "expense", budgetLimit: 1500 },
  { id: "cat-business", name: "Business / Freelance", icon: "Briefcase", color: "#0f766e", defaultType: "expense", budgetLimit: 8000 },
  { id: "cat-income-salary", name: "Salary", icon: "Wallet", color: "#22c55e", defaultType: "income" },
  { id: "cat-income-freelance", name: "Freelance Income", icon: "Laptop", color: "#16a34a", defaultType: "income" },
  { id: "cat-income-invest", name: "Investment / Interest", icon: "TrendingUp", color: "#15803d", defaultType: "income" },
  { id: "cat-other", name: "Other Expenses", icon: "Tag", color: "#94a3b8", defaultType: "expense", budgetLimit: 2000 }
];

export const INITIAL_USER_SETTINGS: UserSettings = {
  // No personal defaults: the name comes from onboarding or the signed-in account.
  name: "",
  email: "",
  profileType: "professional",
  currency: "INR",
  accessibilityMode: "default",
  darkMode: false,
  dailySummaryConfig: {
    enabled: true,
    time: "23:00",
    channel: "in_app"
  },
  monthlyIncome: 50000,
  dailyBudgetLimit: 2000,
  stealthMode: false,
  offlineMode: false,
  isDemoMode: true,
  autoSyncUpiConfig: {
    gpay: true,
    phonepe: true,
    paytm: true,
    cred: true,
    bankSms: true,
    autoIngestionAlerts: true
  },
  nightlyCashReminderConfig: {
    enabled: true,
    time: "22:00",
    autoPromptInApp: true
  }
};

export const INITIAL_CONNECTIONS: FinancialConnection[] = [
  {
    id: "conn-1",
    institutionName: "Sample bank account (demo, not connected)",
    type: "bank",
    accountNumberMasked: "••• 4821",
    status: "disconnected",
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    isDemo: true
  },
  {
    id: "conn-2",
    institutionName: "Sample Account Aggregator link (demo, not connected)",
    type: "account_aggregator",
    accountNumberMasked: "demo@aa",
    status: "disconnected",
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    isDemo: true
  },
  {
    id: "conn-3",
    institutionName: "UPI & SMS Transaction Parser",
    type: "sms_parser",
    accountNumberMasked: "Local Auto-Sync",
    status: "disconnected",
    lastSyncedAt: new Date().toISOString(),
    isDemo: true
  }
];

export const INITIAL_CASH_WALLET: CashWallet = {
  openingBalance: 5000,
  cashReceived: 1000,
  cashSpent: 2550,
  currentBalance: 3450,
  lastAdjustedDate: localDateString()
};

export const INITIAL_GOALS: FinancialGoal[] = [
  {
    id: "goal-1",
    title: "Emergency Fund (6 Months)",
    targetAmount: 100000,
    currentAmount: 45000,
    targetDate: "2026-12-31",
    category: "Savings",
    icon: "ShieldAlert",
    color: "#3b82f6",
    monthlyRecommended: 6875,
    createdAt: "2026-01-10"
  },
  {
    id: "goal-2",
    title: "New Royal Enfield Hunter 350",
    targetAmount: 120000,
    currentAmount: 65000,
    targetDate: "2026-11-15",
    category: "Vehicle",
    icon: "Bike",
    color: "#f97316",
    monthlyRecommended: 18333,
    createdAt: "2026-02-01"
  },
  {
    id: "goal-3",
    title: "Japan Cherry Blossom Trip",
    targetAmount: 150000,
    currentAmount: 30000,
    targetDate: "2027-03-25",
    category: "Travel",
    icon: "PlaneTakeoff",
    color: "#ec4899",
    monthlyRecommended: 17142,
    createdAt: "2026-03-15"
  }
];

export const INITIAL_RECURRING: RecurringExpense[] = [
  {
    id: "rec-1",
    name: "Netflix Premium (4K)",
    merchant: "Netflix",
    amount: 649,
    frequency: "monthly",
    nextRenewalDate: "2026-08-24",
    categoryId: "cat-subscriptions",
    paymentMethod: "credit_card",
    active: true,
    autoReminder: true
  },
  {
    id: "rec-2",
    name: "JioFiber Broadband (100 Mbps)",
    merchant: "Reliance Jio",
    amount: 799,
    frequency: "monthly",
    nextRenewalDate: "2026-08-28",
    categoryId: "cat-internet",
    paymentMethod: "upi",
    active: true,
    autoReminder: true
  },
  {
    id: "rec-3",
    name: "Gold's Gym Membership",
    merchant: "Gold's Gym",
    amount: 1500,
    frequency: "monthly",
    nextRenewalDate: "2026-09-01",
    categoryId: "cat-healthcare",
    paymentMethod: "debit_card",
    active: true,
    autoReminder: true
  },
  {
    id: "rec-4",
    name: "Spotify Duo Family",
    merchant: "Spotify India",
    amount: 119,
    frequency: "monthly",
    nextRenewalDate: "2026-08-30",
    categoryId: "cat-subscriptions",
    paymentMethod: "upi",
    active: true,
    autoReminder: true
  },
  {
    id: "rec-5",
    name: "Google One (100GB Cloud Storage)",
    merchant: "Google India",
    amount: 130,
    frequency: "monthly",
    nextRenewalDate: "2026-09-05",
    categoryId: "cat-subscriptions",
    paymentMethod: "credit_card",
    active: true,
    autoReminder: false
  }
];

export const INITIAL_BUDGETS: Budget[] = [
  {
    id: "b-1",
    name: "Monthly Food & Dining",
    type: "category",
    categoryId: "cat-food",
    amount: 8000,
    spent: 6500,
    period: "monthly",
    alertThreshold: 0.8,
    startDate: "2026-08-01"
  },
  {
    id: "b-2",
    name: "Groceries & Supermarket",
    type: "category",
    categoryId: "cat-groceries",
    amount: 6000,
    spent: 4200,
    period: "monthly",
    alertThreshold: 0.8,
    startDate: "2026-08-01"
  },
  {
    id: "b-3",
    name: "Transport & Fuel",
    type: "category",
    categoryId: "cat-transport",
    amount: 4000,
    spent: 3200,
    period: "monthly",
    alertThreshold: 0.8,
    startDate: "2026-08-01"
  },
  {
    id: "b-4",
    name: "Shopping & Lifestyle",
    type: "category",
    categoryId: "cat-shopping",
    amount: 6000,
    spent: 4800,
    period: "monthly",
    alertThreshold: 0.8,
    startDate: "2026-08-01"
  },
  {
    id: "b-5",
    name: "Overall Monthly Expense Cap",
    type: "monthly",
    amount: 35000,
    spent: 31400,
    period: "monthly",
    alertThreshold: 0.85,
    startDate: "2026-08-01"
  }
];

export const INITIAL_GOA_GROUP: Group = {
  id: "grp-goa-2026",
  name: "Goa Beach Trip",
  description: "20 Aug – 25 Aug",
  coverEmoji: "🏖️",
  budget: 50000,
  currency: "INR",
  createdBy: "m-henil",
  createdAt: "2026-08-20",
  inviteCode: "GOA-FRIENDS-2026",
  members: [
    { id: "m-amit", name: "Amit" },
    { id: "m-henil", name: "You", isCurrentUser: true },
    { id: "m-rahul", name: "Rahul" },
    { id: "m-jay", name: "Jay" },
    { id: "m-dev", name: "Dev" }
  ],
  expenses: [
    {
      id: "ge-1",
      groupId: "grp-goa-2026",
      description: "Beachfront Villa & Resort Booking",
      amount: 22500,
      currency: "INR",
      categoryId: "cat-travel",
      paidByMemberId: "m-dev",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 4500 },
        { memberId: "m-rahul", amountOwed: 4500 },
        { memberId: "m-jay", amountOwed: 4500 },
        { memberId: "m-amit", amountOwed: 4500 },
        { memberId: "m-dev", amountOwed: 4500 }
      ],
      date: "2026-08-20",
      time: "11:30",
      createdAt: "2026-08-20T11:30:00Z"
    },
    {
      id: "ge-2",
      groupId: "grp-goa-2026",
      description: "Thalassa Seafood Dinner & Sunset Drinks",
      amount: 10000,
      currency: "INR",
      categoryId: "cat-food",
      paidByMemberId: "m-henil",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 2000 },
        { memberId: "m-rahul", amountOwed: 2000 },
        { memberId: "m-jay", amountOwed: 2000 },
        { memberId: "m-amit", amountOwed: 2000 },
        { memberId: "m-dev", amountOwed: 2000 }
      ],
      date: "2026-08-21",
      time: "20:45",
      createdAt: "2026-08-21T20:45:00Z"
    },
    {
      id: "ge-3",
      groupId: "grp-goa-2026",
      description: "Watersports & Scuba Diving Package",
      amount: 8870,
      currency: "INR",
      categoryId: "cat-entertainment",
      paidByMemberId: "m-rahul",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 1774 },
        { memberId: "m-rahul", amountOwed: 1774 },
        { memberId: "m-jay", amountOwed: 1774 },
        { memberId: "m-amit", amountOwed: 1774 },
        { memberId: "m-dev", amountOwed: 1774 }
      ],
      date: "2026-08-22",
      time: "10:15",
      createdAt: "2026-08-22T10:15:00Z"
    },
    {
      id: "ge-4",
      groupId: "grp-goa-2026",
      description: "Self-drive Thar & Scooty Rentals + Fuel",
      amount: 6480,
      currency: "INR",
      categoryId: "cat-transport",
      paidByMemberId: "m-jay",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 1296 },
        { memberId: "m-rahul", amountOwed: 1296 },
        { memberId: "m-jay", amountOwed: 1296 },
        { memberId: "m-amit", amountOwed: 1296 },
        { memberId: "m-dev", amountOwed: 1296 }
      ],
      date: "2026-08-23",
      time: "14:00",
      createdAt: "2026-08-23T14:00:00Z"
    }
  ],
  settlements: [
    {
      id: "set-1",
      groupId: "grp-goa-2026",
      fromMemberId: "m-amit",
      toMemberId: "m-dev",
      amount: 2200,
      currency: "INR",
      status: "suggested"
    },
    {
      id: "set-2",
      groupId: "grp-goa-2026",
      fromMemberId: "m-henil",
      toMemberId: "m-dev",
      amount: 700,
      currency: "INR",
      status: "suggested"
    },
    {
      id: "set-3",
      groupId: "grp-goa-2026",
      fromMemberId: "m-rahul",
      toMemberId: "m-dev",
      amount: 700,
      currency: "INR",
      status: "suggested"
    }
  ]
};

export const INITIAL_FLATMATES_GROUP: Group = {
  id: "grp-flat-402",
  name: "Flat 402 Roomies",
  description: "Monthly Shared Apartment & Utilities",
  coverEmoji: "🏠",
  budget: 45000,
  currency: "INR",
  createdBy: "m-henil",
  createdAt: "2026-08-01",
  inviteCode: "FLAT402-ROOMS",
  members: [
    { id: "m-henil", name: "You", isCurrentUser: true },
    { id: "m-pritesh", name: "Pritesh" },
    { id: "m-aman", name: "Aman" },
    { id: "m-rohan", name: "Rohan" }
  ],
  expenses: [
    {
      id: "ge-f1",
      groupId: "grp-flat-402",
      description: "Cook & Housekeeping Maid Salary",
      amount: 8000,
      currency: "INR",
      categoryId: "cat-bills",
      paidByMemberId: "m-henil",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 2000 },
        { memberId: "m-pritesh", amountOwed: 2000 },
        { memberId: "m-aman", amountOwed: 2000 },
        { memberId: "m-rohan", amountOwed: 2000 }
      ],
      date: "2026-08-05",
      time: "10:00",
      createdAt: "2026-08-05T10:00:00Z"
    },
    {
      id: "ge-f2",
      groupId: "grp-flat-402",
      description: "Airtel Fiber Gigabit Wifi + Water Cans",
      amount: 2400,
      currency: "INR",
      categoryId: "cat-bills",
      paidByMemberId: "m-pritesh",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 600 },
        { memberId: "m-pritesh", amountOwed: 600 },
        { memberId: "m-aman", amountOwed: 600 },
        { memberId: "m-rohan", amountOwed: 600 }
      ],
      date: "2026-08-08",
      time: "14:30",
      createdAt: "2026-08-08T14:30:00Z"
    },
    {
      id: "ge-f3",
      groupId: "grp-flat-402",
      description: "BigBasket Monthly Kitchen Staples & Spices",
      amount: 4800,
      currency: "INR",
      categoryId: "cat-groceries",
      paidByMemberId: "m-aman",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 1200 },
        { memberId: "m-pritesh", amountOwed: 1200 },
        { memberId: "m-aman", amountOwed: 1200 },
        { memberId: "m-rohan", amountOwed: 1200 }
      ],
      date: "2026-08-12",
      time: "18:00",
      createdAt: "2026-08-12T18:00:00Z"
    }
  ],
  settlements: []
};

export const INITIAL_OFFICE_GROUP: Group = {
  id: "grp-office-lunch",
  name: "Office Chai & Lunch Club",
  description: "Team Outings & Daily Evening Refreshments",
  coverEmoji: "☕",
  budget: 10000,
  currency: "INR",
  createdBy: "m-henil",
  createdAt: "2026-08-10",
  inviteCode: "OFFICE-CHAI-TEAM",
  members: [
    { id: "m-henil", name: "You", isCurrentUser: true },
    { id: "m-siddharth", name: "Siddharth" },
    { id: "m-neha", name: "Neha" },
    { id: "m-kunal", name: "Kunal" }
  ],
  expenses: [
    {
      id: "ge-o1",
      groupId: "grp-office-lunch",
      description: "Domino's Friday Gourmet Pizza Feast",
      amount: 2800,
      currency: "INR",
      categoryId: "cat-food",
      paidByMemberId: "m-henil",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 700 },
        { memberId: "m-siddharth", amountOwed: 700 },
        { memberId: "m-neha", amountOwed: 700 },
        { memberId: "m-kunal", amountOwed: 700 }
      ],
      date: "2026-08-15",
      time: "13:30",
      createdAt: "2026-08-15T13:30:00Z"
    },
    {
      id: "ge-o2",
      groupId: "grp-office-lunch",
      description: "Irani Chai & Bun Maska Snack Break",
      amount: 480,
      currency: "INR",
      categoryId: "cat-food",
      paidByMemberId: "m-siddharth",
      splitType: "equal",
      participants: [
        { memberId: "m-henil", amountOwed: 120 },
        { memberId: "m-siddharth", amountOwed: 120 },
        { memberId: "m-neha", amountOwed: 120 },
        { memberId: "m-kunal", amountOwed: 120 }
      ],
      date: "2026-08-18",
      time: "17:15",
      createdAt: "2026-08-18T17:15:00Z"
    }
  ],
  settlements: []
};

export const INITIAL_GROUPS: Group[] = [
  INITIAL_GOA_GROUP,
  INITIAL_FLATMATES_GROUP,
  INITIAL_OFFICE_GROUP
];

export const GROUP_TEMPLATES = [
  {
    id: "tpl-trip",
    name: "Vacation / Roadtrip",
    emoji: "🏖️",
    description: "Villa, Flights, Car rental, Food & Sightseeing",
    defaultBudget: 45000,
    sampleName: "Manali Snow Adventure",
    sampleDesc: "Weekend Mountain Getaway",
    suggestedMembers: ["You", "Amit", "Rahul", "Jay", "Dev"]
  },
  {
    id: "tpl-flat",
    name: "Flatmates / Room Rent",
    emoji: "🏠",
    description: "Rent, Maid, Wifi, Water, BigBasket Groceries",
    defaultBudget: 35000,
    sampleName: "Flat 402 Roomies",
    sampleDesc: "Shared monthly apartment bills",
    suggestedMembers: ["You", "Pritesh", "Aman", "Rohan"]
  },
  {
    id: "tpl-office",
    name: "Office & Colleagues",
    emoji: "💼",
    description: "Daily Chai & Snacks, Team Lunches, Offsite",
    defaultBudget: 8000,
    sampleName: "Office Chai Club",
    sampleDesc: "Evening snacks & Friday lunch",
    suggestedMembers: ["You", "Siddharth", "Neha", "Kunal"]
  },
  {
    id: "tpl-trek",
    name: "Trek & Adventure",
    emoji: "🏔️",
    description: "Tents, Trek Guides, Bonfire, Jeep Transfers",
    defaultBudget: 25000,
    sampleName: "Himalayan Trek 2026",
    sampleDesc: "5-Day mountain expedition",
    suggestedMembers: ["You", "Parth", "Harsh", "Dev"]
  },
  {
    id: "tpl-party",
    name: "Party & Fest",
    emoji: "🎉",
    description: "Catering, DJ, Decor, Birthday / Fest prep",
    defaultBudget: 15000,
    sampleName: "Birthday Bash 2026",
    sampleDesc: "Party planning & expenses",
    suggestedMembers: ["You", "Friend 1", "Friend 2", "Friend 3"]
  },
  {
    id: "tpl-custom",
    name: "Custom Anything",
    emoji: "✨",
    description: "Any group, trip, project, or shared outing",
    defaultBudget: 10000,
    sampleName: "My Custom Group",
    sampleDesc: "Universal group splitting",
    suggestedMembers: ["You", "Friend 1", "Friend 2"]
  }
];

export const INITIAL_FAMILY_SPACE: FamilySpace = {
  id: "fam-rangani",
  name: "Rangani Household",
  monthlyBudget: 45000,
  sharedCategories: ["cat-groceries", "cat-electricity", "cat-bills", "cat-rent", "cat-internet", "cat-healthcare"],
  members: [
    { id: "fm-1", name: "Father (Ramesh)", role: "parent", avatar: "👨", allowSharedViewing: true, monthlyAllowance: 15000 },
    { id: "fm-2", name: "Mother (Gita)", role: "parent", avatar: "👩", allowSharedViewing: true, monthlyAllowance: 15000 },
    { id: "fm-3", name: "You", role: "admin", avatar: "🧑‍💻", allowSharedViewing: true, monthlyAllowance: 20000 },
    { id: "fm-4", name: "Sister (Pooja)", role: "child", avatar: "👧", allowSharedViewing: true, monthlyAllowance: 5000 }
  ]
};

export const INITIAL_TRANSACTIONS: Transaction[] = [
  // Today's Transactions (matching master spec timeline)
  {
    id: "tx-today-1",
    userId: "u-henil",
    amount: 80,
    type: "expense",
    currency: "INR",
    merchant: "Udupi Breakfast Corner",
    description: "Masala Dosa & Filter Coffee",
    categoryId: "cat-food",
    date: localDateString(),
    time: "08:15",
    paymentMethod: "upi",
    source: "notification",
    status: "verified",
    confidence: 0.98,
    notes: "Quick breakfast before office",
    tags: ["breakfast", "south-indian"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "tx-today-2",
    userId: "u-henil",
    amount: 30,
    type: "expense",
    currency: "INR",
    merchant: "City Bus Metro feeder",
    description: "Bus ticket to tech park",
    categoryId: "cat-transport",
    date: localDateString(),
    time: "10:30",
    paymentMethod: "cash",
    source: "manual",
    status: "verified",
    confidence: 1.0,
    notes: "Cash ticket",
    tags: ["commute"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "tx-today-3",
    userId: "u-henil",
    amount: 120,
    type: "expense",
    currency: "INR",
    merchant: "Green Earth Salad & Meal",
    description: "Healthy Thali Lunch",
    categoryId: "cat-food",
    date: localDateString(),
    time: "13:20",
    paymentMethod: "upi",
    source: "connected",
    status: "verified",
    confidence: 0.95,
    notes: "Office canteen",
    tags: ["lunch"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "tx-today-4",
    userId: "u-henil",
    amount: 70,
    type: "expense",
    currency: "INR",
    merchant: "Chai Point",
    description: "Ginger Tea & Bun Maska",
    categoryId: "cat-food",
    date: localDateString(),
    time: "18:10",
    paymentMethod: "upi",
    source: "voice",
    status: "verified",
    confidence: 0.92,
    notes: "Evening break with coworkers",
    tags: ["snack", "tea"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "tx-today-5",
    userId: "u-henil",
    amount: 799,
    type: "expense",
    currency: "INR",
    merchant: "Amazon India",
    description: "Wireless Bluetooth Ergonomic Mouse",
    categoryId: "cat-shopping",
    date: localDateString(),
    time: "20:40",
    paymentMethod: "credit_card",
    source: "receipt",
    receiptData: {
      merchant: "Amazon Retail India",
      date: localDateString(),
      totalAmount: 799,
      taxAmount: 122,
      subtotal: 677,
      confidence: 0.98,
      items: [
        { name: "Portronics Toad 23 Wireless Mouse", quantity: 1, price: 799 }
      ]
    },
    status: "verified",
    confidence: 0.99,
    notes: "Desk upgrade",
    tags: ["electronics", "work-from-home"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  // Income this month
  {
    id: "tx-inc-1",
    userId: "u-henil",
    amount: 50000,
    type: "income",
    currency: "INR",
    merchant: "TechCorp Global Pvt Ltd",
    description: "Monthly Base Salary - August",
    categoryId: "cat-income-salary",
    date: "2026-08-01",
    time: "09:00",
    paymentMethod: "bank_transfer",
    source: "connected",
    status: "verified",
    confidence: 1.0,
    notes: "Credited to HDFC Bank",
    tags: ["salary", "fixed"],
    createdAt: "2026-08-01T09:00:00Z",
    updatedAt: "2026-08-01T09:00:00Z"
  },
  // Other Realistic Expenses from current month
  {
    id: "tx-hist-1",
    userId: "u-henil",
    amount: 6500,
    type: "expense",
    currency: "INR",
    merchant: "Swiggy & Zomato Orders",
    description: "Monthly Dining & Delivery",
    categoryId: "cat-food",
    date: "2026-08-14",
    time: "21:00",
    paymentMethod: "upi",
    source: "connected",
    status: "verified",
    confidence: 0.95,
    tags: ["food-delivery"],
    createdAt: "2026-08-14T21:00:00Z",
    updatedAt: "2026-08-14T21:00:00Z"
  },
  {
    id: "tx-hist-2",
    userId: "u-henil",
    amount: 3200,
    type: "expense",
    currency: "INR",
    merchant: "Uber & Indian Oil Fuel",
    description: "Cab Rides & Bike Petrol",
    categoryId: "cat-transport",
    date: "2026-08-12",
    time: "17:30",
    paymentMethod: "upi",
    source: "connected",
    status: "verified",
    confidence: 0.96,
    tags: ["travel"],
    createdAt: "2026-08-12T17:30:00Z",
    updatedAt: "2026-08-12T17:30:00Z"
  },
  {
    id: "tx-hist-3",
    userId: "u-henil",
    amount: 4800,
    type: "expense",
    currency: "INR",
    merchant: "Myntra & Zara Fashion",
    description: "Formal Shirts & Sneakers",
    categoryId: "cat-shopping",
    date: "2026-08-10",
    time: "16:00",
    paymentMethod: "credit_card",
    source: "connected",
    status: "verified",
    confidence: 0.94,
    tags: ["lifestyle"],
    createdAt: "2026-08-10T16:00:00Z",
    updatedAt: "2026-08-10T16:00:00Z"
  },
  {
    id: "tx-hist-4",
    userId: "u-henil",
    amount: 4200,
    type: "expense",
    currency: "INR",
    merchant: "Torrent Power & Adani Gas",
    description: "Household Electricity & Piped Gas Bill",
    categoryId: "cat-bills",
    date: "2026-08-05",
    time: "11:00",
    paymentMethod: "bank_transfer",
    source: "connected",
    status: "verified",
    confidence: 0.99,
    isFamilyShared: true,
    tags: ["household", "utilities"],
    createdAt: "2026-08-05T11:00:00Z",
    updatedAt: "2026-08-05T11:00:00Z"
  },
  {
    id: "tx-hist-5",
    userId: "u-henil",
    amount: 2500,
    type: "expense",
    currency: "INR",
    merchant: "Coursera & O'Reilly Media",
    description: "Cloud Architecture Pro Certification",
    categoryId: "cat-education",
    date: "2026-08-08",
    time: "14:20",
    paymentMethod: "credit_card",
    source: "connected",
    status: "verified",
    confidence: 0.97,
    taxCategory: "Professional Development (80C/Sec 10)",
    tags: ["learning", "tax-deductible"],
    createdAt: "2026-08-08T14:20:00Z",
    updatedAt: "2026-08-08T14:20:00Z"
  },
  {
    id: "tx-hist-6",
    userId: "u-henil",
    amount: 1800,
    type: "expense",
    currency: "INR",
    merchant: "PVR Inox Cinemas & IMAX",
    description: "Movie tickets & Popcorn combo",
    categoryId: "cat-entertainment",
    date: "2026-08-15",
    time: "19:00",
    paymentMethod: "upi",
    source: "connected",
    status: "verified",
    confidence: 0.91,
    tags: ["weekend", "movies"],
    createdAt: "2026-08-15T19:00:00Z",
    updatedAt: "2026-08-15T19:00:00Z"
  },
  {
    id: "tx-hist-7",
    userId: "u-henil",
    amount: 2400,
    type: "expense",
    currency: "INR",
    merchant: "Apollo Pharmacy & General",
    description: "Supplements & Routine Checkup Labs",
    categoryId: "cat-healthcare",
    date: "2026-08-07",
    time: "12:15",
    paymentMethod: "debit_card",
    source: "connected",
    status: "verified",
    confidence: 0.95,
    tags: ["health"],
    createdAt: "2026-08-07T12:15:00Z",
    updatedAt: "2026-08-07T12:15:00Z"
  }
];

export const INITIAL_ANOMALIES: AnomalyAlert[] = [
  {
    id: "anom-1",
    type: "category_spike",
    severity: "low",
    title: "Higher transport spending today",
    message: "Your transport expenses today are 2.4× higher than your usual weekday average.",
    date: localDateString()
  },
  {
    id: "anom-2",
    type: "bill_shock",
    severity: "medium",
    title: "Electricity bill update",
    message: "Torrent Power bill was ₹4,200 (18% higher than last month due to AC usage).",
    date: "2026-08-05"
  }
];

// ----------------------------------------------------
// Settlement Optimization Algorithm (Debt Simplification)
// Solves N-person debt graph to minimum transfers
// ----------------------------------------------------
/**
 * Net position per member in integer paise: paid minus consumed share,
 * adjusted for settlements already paid. Positive = should receive,
 * negative = owes. Always sums to exactly zero.
 *
 * Participant shares are re-allocated from each expense total (largest
 * remainder, weighted by the stored amountOwed) so legacy data whose shares
 * were rounded to whole rupees still balances to the paisa.
 */
export function computeGroupNetPaise(group: Group): Record<string, number> {
  const net: Record<string, number> = {};
  for (const m of group.members || []) net[m.id] = 0;

  for (const exp of group.expenses || []) {
    const totalPaise = toPaise(safeRupees(exp.amount));
    if (totalPaise <= 0) continue;
    net[exp.paidByMemberId] = (net[exp.paidByMemberId] || 0) + totalPaise;

    const participants =
      exp.participants && exp.participants.length > 0
        ? exp.participants
        : (group.members || []).map(m => ({ memberId: m.id, amountOwed: 1 }));
    if (participants.length === 0) {
      net[exp.paidByMemberId] -= totalPaise;
      continue;
    }
    const weights = participants.map(p => Math.max(0, safeRupees(p.amountOwed)));
    const shares = weights.some(w => w > 0)
      ? allocatePaise(totalPaise, weights)
      : allocatePaise(totalPaise, participants.map(() => 1));
    participants.forEach((p, i) => {
      net[p.memberId] = (net[p.memberId] || 0) - shares[i];
    });
  }

  // Settlements already paid reduce what is still owed.
  for (const s of group.settlements || []) {
    if (s.status !== "marked_paid" && s.status !== "verified") continue;
    const p = toPaise(safeRupees(s.amount));
    net[s.fromMemberId] = (net[s.fromMemberId] || 0) + p;
    net[s.toMemberId] = (net[s.toMemberId] || 0) - p;
  }
  return net;
}

/** Net positions in rupees (for display). */
export function computeGroupNetRupees(group: Group): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(computeGroupNetPaise(group))) out[k] = fromPaise(v);
  return out;
}

// ----------------------------------------------------
// Settlement Optimization Algorithm (Debt Simplification)
// Greedy largest-debtor / largest-creditor matching, in integer paise.
// Returns only the outstanding *suggested* transfers.
// ----------------------------------------------------
export function optimizeSettlements(group: Group): Settlement[] {
  const members = group.members;
  if (!members || members.length < 2) return [];

  interface PersonBalance {
    id: string;
    paise: number;
  }
  const debtors: PersonBalance[] = [];
  const creditors: PersonBalance[] = [];
  for (const [memberId, balance] of Object.entries(computeGroupNetPaise(group))) {
    if (balance < 0) debtors.push({ id: memberId, paise: -balance });
    else if (balance > 0) creditors.push({ id: memberId, paise: balance });
  }
  debtors.sort((a, b) => b.paise - a.paise || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.paise - a.paise || a.id.localeCompare(b.id));

  const transfers: Settlement[] = [];
  let dIdx = 0;
  let cIdx = 0;
  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const amount = Math.min(debtor.paise, creditor.paise);
    transfers.push({
      id: `settle-${group.id}-${debtor.id}-${creditor.id}-${transfers.length}`,
      groupId: group.id,
      fromMemberId: debtor.id,
      toMemberId: creditor.id,
      amount: fromPaise(amount),
      currency: group.currency || "INR",
      status: "suggested"
    });
    debtor.paise -= amount;
    creditor.paise -= amount;
    if (debtor.paise === 0) dIdx++;
    if (creditor.paise === 0) cIdx++;
  }
  return transfers;
}

/**
 * Keep the history of paid settlements and replace the outstanding suggestions.
 * (Previously every new expense wiped paid settlements, re-creating old debts.)
 */
export function recomputeSettlements(group: Group): Settlement[] {
  const paid = (group.settlements || []).filter(s => s.status === "marked_paid" || s.status === "verified");
  const suggested = optimizeSettlements({ ...group, settlements: paid }).map(s => ({ ...s, id: `${s.id}-r${paid.length}` }));
  return [...paid, ...suggested];
}

// ----------------------------------------------------
// Duplicate Detection Algorithm
// Same amount (to the paisa), within ±1 calendar day, similar merchant/note.
// ----------------------------------------------------
export function detectDuplicateTransaction(
  newTx: Partial<Transaction>,
  existing: Transaction[]
): { isDuplicate: boolean; duplicateOf?: Transaction; reason?: string } {
  if (!newTx.amount) return { isDuplicate: false };
  const newPaise = toPaise(safeRupees(newTx.amount));
  const newDate = newTx.date || localDateString();

  for (const tx of existing) {
    if (tx.id === newTx.id) continue;
    if (tx.status === "soft_deleted") continue;
    if (newTx.type && tx.type !== newTx.type) continue;
    if (toPaise(safeRupees(tx.amount)) !== newPaise) continue;
    if (!tx.date || daysBetween(tx.date, newDate) > 1) continue;

    const m1 = (tx.merchant || "").toLowerCase().trim();
    const m2 = (newTx.merchant || "").toLowerCase().trim();
    const d1 = (tx.description || "").toLowerCase().trim();
    const d2 = (newTx.description || "").toLowerCase().trim();

    if (m1 && m2 && (m1.includes(m2) || m2.includes(m1))) {
      return {
        isDuplicate: true,
        duplicateOf: tx,
        reason: `Found matching ${formatINR(tx.amount)} transaction at "${tx.merchant}" on ${tx.date}`
      };
    }
    if (d1 && d2 && (d1.includes(d2) || d2.includes(d1))) {
      return {
        isDuplicate: true,
        duplicateOf: tx,
        reason: `Found matching ${formatINR(tx.amount)} note "${tx.description}" on ${tx.date}`
      };
    }
  }
  return { isDuplicate: false };
}

// ----------------------------------------------------
// Financial Health Score Calculation
// ----------------------------------------------------
export function calculateFinancialHealth(
  transactions: Transaction[],
  income: number,
  budgets: Budget[],
  recurring: RecurringExpense[]
): FinancialHealthScore {
  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeBudgets = Array.isArray(budgets) ? budgets : [];
  const safeRecurring = Array.isArray(recurring) ? recurring : [];

  const currentMonth = localMonthPrefix();
  const monthlyExpenses = safeTxs
    .filter(t => t && t.type === "expense" && t.status !== "soft_deleted" && t.date && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  if (safeTxs.length === 0 && income <= 0) {
    return {
      score: 0,
      grade: "Needs Attention",
      breakdown: {
        budgetAdherence: 0,
        savingsConsistency: 0,
        recurringBurden: 0,
        spendingStability: 0
      },
      insights: [
        "Log your monthly income and expenses to unlock your personalized Financial Health Index."
      ]
    };
  }

  // 1. Budget Adherence (25 pts)
  let budgetScore = 0;
  const totalBudget = safeBudgets.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
  if (totalBudget > 0) {
    const ratio = monthlyExpenses / totalBudget;
    if (ratio <= 0.8) budgetScore = 25;
    else if (ratio <= 1.0) budgetScore = 22;
    else if (ratio <= 1.15) budgetScore = 15;
    else budgetScore = 8;
  } else if (monthlyExpenses > 0) {
    budgetScore = 15; // Unbudgeted spending tracked
  }

  // 2. Savings Consistency (25 pts)
  let savingsScore = 0;
  const savingsRate = income > 0 ? (income - monthlyExpenses) / income : 0;
  if (income > 0) {
    if (savingsRate >= 0.3) savingsScore = 25;
    else if (savingsRate >= 0.2) savingsScore = 22;
    else if (savingsRate >= 0.1) savingsScore = 17;
    else if (savingsRate > 0) savingsScore = 12;
    else savingsScore = 5;
  }

  // 3. Recurring Expense Burden (25 pts)
  const totalRecurring = safeRecurring.filter(r => r && r.active).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const recurringRatio = income > 0 ? totalRecurring / income : 0;
  let recurringScore = 0;
  if (income > 0) {
    if (recurringRatio === 0) recurringScore = 25;
    else if (recurringRatio < 0.1) recurringScore = 24;
    else if (recurringRatio < 0.2) recurringScore = 20;
    else if (recurringRatio < 0.3) recurringScore = 15;
    else recurringScore = 8;
  }

  // 4. Spending Stability (25 pts)
  let stabilityScore = 0;
  if (safeTxs.length >= 10) stabilityScore = 24;
  else if (safeTxs.length >= 5) stabilityScore = 20;
  else if (safeTxs.length > 0) stabilityScore = 15;

  const totalScore = Math.min(100, Math.max(0, budgetScore + savingsScore + recurringScore + stabilityScore));

  let grade: FinancialHealthScore["grade"] = "Needs Attention";
  if (totalScore >= 85) grade = "Excellent";
  else if (totalScore >= 70) grade = "Good";
  else if (totalScore >= 50) grade = "Fair";
  else grade = "Needs Attention";

  const insights: string[] = [];
  if (income > 0) {
    insights.push(`Your savings rate this month is ${Math.max(0, Math.round(savingsRate * 100))}% (Target: 20%+).`);
  }
  if (totalRecurring > 0) {
    insights.push(`Fixed recurring subscriptions account for ₹${totalRecurring.toLocaleString('en-IN')}/month.`);
  }
  if (safeBudgets.length > 0) {
    insights.push(`You are monitoring ${safeBudgets.length} budget categories.`);
  }
  if (insights.length === 0) {
    insights.push("Continue recording transactions to refine your health insights.");
  }

  return {
    score: totalScore,
    grade,
    breakdown: {
      budgetAdherence: budgetScore,
      savingsConsistency: savingsScore,
      recurringBurden: recurringScore,
      spendingStability: stabilityScore
    },
    insights
  };
}
