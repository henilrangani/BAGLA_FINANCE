export type ProfileType = "student" | "professional" | "family" | "traveller" | "freelancer";

export type PaymentMethod = 
  | "cash" 
  | "upi" 
  | "debit_card" 
  | "credit_card" 
  | "bank_transfer" 
  | "wallet" 
  | "cheque" 
  | "other";

export type TransactionSource = 
  | "manual" 
  | "connected" 
  | "notification" 
  | "receipt" 
  | "voice" 
  | "imported";

export type TransactionType = "expense" | "income";

export interface ReceiptItem {
  name: string;
  quantity?: number;
  price: number;
  assignedTo?: string[]; // user IDs for item-based splitting
}

export interface ReceiptData {
  merchant: string;
  date: string;
  totalAmount: number;
  taxAmount?: number;
  subtotal?: number;
  items: ReceiptItem[];
  imageUrl?: string;
  confidence: number;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  currency: string; // Defaults to "INR" (₹)
  merchant: string;
  description: string;
  categoryId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  paymentMethod: PaymentMethod;
  source: TransactionSource;
  sourceTransactionId?: string;
  accountId?: string;
  receiptData?: ReceiptData;
  groupId?: string;
  isFamilyShared?: boolean;
  isRecurring?: boolean;
  status: "verified" | "pending_review" | "duplicate_flagged" | "soft_deleted";
  confidence: number;
  notes?: string;
  tags?: string[];
  taxCategory?: string; // For freelancer / business mode
  projectClient?: string; // For freelancer mode
  duplicateOfId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  color: string;
  defaultType: TransactionType;
  budgetLimit?: number;
  isCustom?: boolean;
}

export type BudgetPeriod = "daily" | "weekly" | "monthly" | "yearly";
export type BudgetType = "daily" | "weekly" | "monthly" | "category" | "family" | "trip";

export interface Budget {
  id: string;
  name: string;
  type: BudgetType;
  categoryId?: string; // If category specific
  groupId?: string; // If trip/group specific
  familySpaceId?: string; // If family space
  amount: number;
  spent: number;
  period: BudgetPeriod;
  alertThreshold: number; // e.g. 80% (0.8)
  startDate: string;
  endDate?: string;
}

export interface GroupMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  isCurrentUser?: boolean;
  upiId?: string;
  phone?: string;
}

export type SplitType = "equal" | "percentage" | "exact" | "itemized";

export interface SplitParticipant {
  memberId: string;
  amountOwed: number;
  percentage?: number;
  itemIndices?: number[];
}

export interface GroupExpense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  currency: string;
  categoryId: string;
  paidByMemberId: string;
  splitType: SplitType;
  participants: SplitParticipant[];
  date: string;
  time: string;
  receiptData?: ReceiptData;
  notes?: string;
  createdAt: string;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string;
  status: "suggested" | "marked_paid" | "verified";
  settledAt?: string;
  paymentMethod?: PaymentMethod;
  transactionReference?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  coverEmoji: string;
  budget?: number;
  currency: string;
  createdBy: string;
  members: GroupMember[];
  expenses: GroupExpense[];
  settlements: Settlement[];
  inviteCode: string;
  createdAt: string;
  archived?: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: "admin" | "parent" | "partner" | "child" | "member";
  avatar: string;
  allowSharedViewing: boolean;
  monthlyAllowance?: number;
}

export interface FamilySpace {
  id: string;
  name: string;
  members: FamilyMember[];
  sharedCategories: string[];
  monthlyBudget: number;
}

export interface RecurringExpense {
  id: string;
  name: string;
  merchant: string;
  amount: number;
  frequency: "monthly" | "yearly" | "quarterly" | "weekly";
  nextRenewalDate: string; // YYYY-MM-DD
  categoryId: string;
  paymentMethod: PaymentMethod;
  active: boolean;
  autoReminder: boolean;
  lastAmount?: number;
  priceSpike?: boolean; // If recent bill increased
}

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: string;
  icon: string;
  color: string;
  monthlyRecommended: number;
  createdAt: string;
}

export interface CashWallet {
  openingBalance: number;
  cashReceived: number;
  cashSpent: number;
  currentBalance: number;
  lastAdjustedDate: string;
}

export interface FinancialHealthScore {
  score: number; // 0 to 100
  grade: "Excellent" | "Good" | "Fair" | "Needs Attention";
  breakdown: {
    budgetAdherence: number; // out of 25
    savingsConsistency: number; // out of 25
    recurringBurden: number; // out of 25
    spendingStability: number; // out of 25
  };
  insights: string[];
}

export interface DailySummaryConfig {
  enabled: boolean;
  time: string; // e.g., "23:00" (11 PM)
  channel: "in_app" | "browser_notification";
  lastGeneratedDate?: string;
}

export interface FinancialConnection {
  id: string;
  institutionName: string;
  type: "bank" | "account_aggregator" | "sms_parser" | "statement_import";
  accountNumberMasked: string;
  status: "connected" | "syncing" | "needs_consent" | "disconnected";
  lastSyncedAt: string;
  isDemo: boolean;
}

export interface AutoSyncUpiConfig {
  gpay: boolean;
  phonepe: boolean;
  paytm: boolean;
  cred: boolean;
  bankSms: boolean;
  autoIngestionAlerts: boolean;
}

export interface NightlyCashReminderConfig {
  enabled: boolean;
  time: string; // e.g. "22:00" (10 PM)
  lastNotifiedDate?: string;
  autoPromptInApp: boolean;
}

export interface UserSettings {
  name: string;
  email: string;
  profileType: ProfileType;
  currency: string;
  accessibilityMode: "default" | "child_friendly" | "elder_friendly" | "pro";
  darkMode: boolean;
  dailySummaryConfig: DailySummaryConfig;
  monthlyIncome: number;
  dailyBudgetLimit: number;
  stealthMode?: boolean; // Masks balances with •••••• for privacy in public
  passcodeLockEnabled?: boolean;
  passcode?: string;
  isAppLocked?: boolean;
  localEncryptionEnabled?: boolean;
  offlineMode?: boolean; // When true, runs 100% air-gapped without external network calls
  isDemoMode?: boolean; // Explicit toggle for Demo / Sample Sandbox mode
  autoSyncUpiConfig?: AutoSyncUpiConfig;
  nightlyCashReminderConfig?: NightlyCashReminderConfig;
}

export interface AnomalyAlert {
  id: string;
  type: "unusual_transaction" | "category_spike" | "bill_shock" | "duplicate_detected";
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  transactionId?: string;
  date: string;
  acknowledged?: boolean;
}

export interface StatementImportPreviewItem {
  id: string;
  date: string;
  description: string;
  merchant: string;
  amount: number;
  type: TransactionType;
  suggestedCategory: string;
  paymentMethod: PaymentMethod;
  isDuplicate: boolean;
  selected: boolean;
}
