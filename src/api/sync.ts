/**
 * Account sync: pull from the server and push local changes via a durable outbox.
 *
 * - Every write is applied to the UI first, then queued here. The queue is
 *   saved in the account profile's storage, so it survives reloads and offline periods.
 * - Creates carry an Idempotency-Key derived from the local id, so a retry
 *   after a network failure can never post twice.
 * - Operations run in order; a failing op stops the queue (later ops may
 *   depend on it) and is retried on the next run.
 */
import type { Budget, FinancialGoal, Transaction } from "../types";
import { ApiError, api, apiWithStatus } from "./client";
import {
  fromServerBudget,
  fromServerGoal,
  fromServerTx,
  toServerBudget,
  toServerCreate,
  toServerGoal,
  toServerUpdate,
  type AccountRefs,
  type ServerAccount,
  type ServerTx,
} from "./mappers";
import { profileKey, type Profile } from "./profile";
import { toPaise } from "../utils/money";

export type OutboxOp =
  | { kind: "tx_create"; localId: string; tx: Transaction }
  | { kind: "tx_update"; localId: string; updates: Partial<Transaction>; current: Transaction }
  | { kind: "tx_delete"; localId: string }
  | { kind: "tx_adjust"; localId: string; amountPaise: number; direction: "debit" | "credit" }
  | { kind: "budget_create"; localId: string; budget: Omit<Budget, "id" | "spent"> }
  | { kind: "budget_update"; localId: string; updates: Partial<Budget> }
  | { kind: "goal_create"; localId: string; goal: any }
  | { kind: "goal_contrib"; localId: string; amountRupees: number };

interface OutboxState {
  ops: (OutboxOp & { opId: string; attempts: number; lastError?: string })[];
  idMap: Record<string, string>; // localId -> serverId
}

const OUTBOX = "bagla_outbox_v1";

export function loadOutbox(p: Profile): OutboxState {
  try {
    const raw = localStorage.getItem(profileKey(OUTBOX, p));
    if (raw) return JSON.parse(raw);
  } catch {
    /* corrupt or unavailable: start empty */
  }
  return { ops: [], idMap: {} };
}

function saveOutbox(p: Profile, s: OutboxState) {
  try {
    localStorage.setItem(profileKey(OUTBOX, p), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function enqueue(p: Profile, op: OutboxOp) {
  const s = loadOutbox(p);
  s.ops.push({ ...op, opId: `${op.kind}:${op.localId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    attempts: 0 } as any);
  saveOutbox(p, s);
}

export function pendingCount(p: Profile): number {
  return loadOutbox(p).ops.length;
}

/** Local ids whose create hasn't reached the server yet (kept visible after a pull). */
export function unsyncedIds(p: Profile): Set<string> {
  return new Set(loadOutbox(p).ops.filter(o => o.kind.endsWith("_create")).map(o => o.localId));
}

export async function ensureAccounts(): Promise<AccountRefs> {
  let accounts = await api<ServerAccount[]>("GET", "/api/v1/accounts");
  let cash = accounts.find(a => a.account_type === "cash");
  if (!cash) cash = await api<ServerAccount>("POST", "/api/v1/accounts", { name: "Cash Wallet", account_type: "cash" });
  let bank = accounts.find(a => a.account_type === "bank" && a.name === "Bank & UPI") ||
    accounts.find(a => a.account_type === "bank");
  if (!bank) bank = await api<ServerAccount>("POST", "/api/v1/accounts", { name: "Bank & UPI", account_type: "bank" });
  accounts = await api<ServerAccount[]>("GET", "/api/v1/accounts");
  return { cashId: cash.id, bankId: bank.id, byId: Object.fromEntries(accounts.map(a => [a.id, a])) };
}

export interface PulledData {
  refs: AccountRefs;
  transactions: Transaction[];
  budgets: Budget[];
  goals: FinancialGoal[];
  cashBalanceRupees: number;
  /** The account holder's name and email from /users/me (shown in the UI instead of any default). */
  user: { fullName: string; email: string };
}

export async function pullAll(): Promise<PulledData> {
  const refs = await ensureAccounts();
  const me = await api<{ full_name: string; email: string }>("GET", "/api/v1/users/me");
  const items: ServerTx[] = [];
  for (let offset = 0, guard = 0; guard < 100; guard++) {
    const page = await api<{ items: ServerTx[]; next_offset: number | null }>(
      "GET", `/api/v1/transactions?limit=200&offset=${offset}`);
    items.push(...page.items);
    if (page.next_offset === null) break;
    offset = page.next_offset;
  }
  const reversed = new Set(items.filter(t => t.reverses_id).map(t => t.reverses_id as string));
  const budgets = await api<any[]>("GET", "/api/v1/budgets");
  const goals = await api<any[]>("GET", "/api/v1/goals");
  return {
    refs,
    transactions: items.map(t => fromServerTx(t, refs.byId, reversed)),
    budgets: budgets.map(fromServerBudget),
    goals: goals.map(fromServerGoal),
    cashBalanceRupees: (refs.byId[refs.cashId]?.balance_paise ?? 0) / 100,
    user: { fullName: me.full_name, email: me.email },
  };
}

export interface RunResult {
  done: number;
  remaining: number;
  error?: string;
  offline?: boolean;
  /** Local id → server id for entities created in this run. */
  created: Record<string, string>;
}

/** Process the queue in order. Stops at the first failure (kept for retry). */
export async function runOutbox(p: Profile, refs: AccountRefs): Promise<RunResult> {
  const state = loadOutbox(p);
  const created: Record<string, string> = {};
  let done = 0;
  const idOf = (localId: string) => state.idMap[localId] || localId;
  while (state.ops.length) {
    const op = state.ops[0];
    try {
      switch (op.kind) {
        case "tx_create": {
          const r = toServerCreate(op.tx, refs);
          if (r.ok === false) {
            // Not representable on the server yet: drop it from the queue, record why.
            op.lastError = r.reason;
            break;
          }
          const s = await api<ServerTx>("POST", "/api/v1/transactions", r.body, { idempotencyKey: `local:${op.localId}` });
          state.idMap[op.localId] = s.id;
          created[op.localId] = s.id;
          break;
        }
        case "tx_update": {
          const body = toServerUpdate(op.updates, op.current);
          if (Object.keys(body).length) await api("PATCH", `/api/v1/transactions/${idOf(op.localId)}`, body);
          break;
        }
        case "tx_delete":
          try {
            await api("DELETE", `/api/v1/transactions/${idOf(op.localId)}`);
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 404)) throw e; // already gone
          }
          break;
        case "tx_adjust": {
          const s = await api<ServerTx>("POST", "/api/v1/transactions", {
            account_id: refs.cashId, amount_paise: op.amountPaise, kind: "adjustment", direction: op.direction,
            description: "Cash wallet count adjustment" }, { idempotencyKey: `local:${op.localId}` });
          created[op.localId] = s.id;
          break;
        }
        case "budget_create": {
          const s = await api<any>("POST", "/api/v1/budgets", toServerBudget(op.budget));
          state.idMap[op.localId] = s.id;
          created[op.localId] = s.id;
          break;
        }
        case "budget_update": {
          const body: Record<string, unknown> = {};
          if (op.updates.amount !== undefined) body.amount_paise = toPaise(Math.abs(op.updates.amount));
          if (op.updates.name !== undefined) body.name = op.updates.name;
          if ((op.updates as any).isArchived !== undefined) body.is_archived = (op.updates as any).isArchived;
          if (Object.keys(body).length) await api("PATCH", `/api/v1/budgets/${idOf(op.localId)}`, body);
          break;
        }
        case "goal_create": {
          const s = await api<any>("POST", "/api/v1/goals", toServerGoal(op.goal));
          state.idMap[op.localId] = s.id;
          created[op.localId] = s.id;
          const start = Math.abs(Number(op.goal.currentAmount) || 0);
          if (start > 0) {
            await api("POST", `/api/v1/goals/${s.id}/contributions`, { amount_paise: toPaise(start) });
          }
          break;
        }
        case "goal_contrib": {
          const paise = toPaise(Math.abs(op.amountRupees));
          if (paise > 0) {
            await api("POST", `/api/v1/goals/${idOf(op.localId)}/contributions`, {
              amount_paise: paise, direction: op.amountRupees < 0 ? "withdrawal" : "deposit" });
          }
          break;
        }
      }
      state.ops.shift();
      done++;
      saveOutbox(p, state);
    } catch (e) {
      const err = e as ApiError;
      op.attempts += 1;
      op.lastError = err.message;
      // Permanent rejections (validation / conflict) would block the queue forever: drop them, keep the error.
      if (err instanceof ApiError && [400, 404, 409, 422].includes(err.status)) {
        state.ops.shift();
        saveOutbox(p, state);
        return { done, remaining: state.ops.length, error: `A change was rejected by the server: ${err.message}`, created };
      }
      saveOutbox(p, state);
      return { done, remaining: state.ops.length, error: err.message, offline: err.isOffline, created };
    }
  }
  return { done, remaining: 0, created };
}

// --------------------------------------------------------------------------- migration

export interface MigrationReport {
  at: string;
  transactions: { eligible: number; created: number; alreadyThere: number; skipped: { id: string; reason: string }[] };
  budgets: { created: number; alreadyThere: number };
  goals: { created: number; alreadyThere: number };
  totals: { localIncomePaise: number; localExpensePaise: number; serverIncomePaise: number; serverExpensePaise: number;
    match: boolean };
  errors: string[];
}

function readJson(key: string): any {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Copy the local-only (browser) ledger into the signed-in account.
 * Reads the original local keys and NEVER writes or deletes them.
 * Safe to run again: transactions use `local:<id>` idempotency keys; budgets and
 * goals are matched by name.
 */
export async function migrateLocalData(cloud: Profile, onProgress?: (done: number, total: number) => void):
Promise<MigrationReport> {
  const local: Profile = { kind: "local" };
  const refs = await ensureAccounts();
  const txs: Transaction[] = Array.isArray(readJson(profileKey("bagla_transactions_v1", local)))
    ? readJson(profileKey("bagla_transactions_v1", local)) : [];
  const report: MigrationReport = {
    at: new Date().toISOString(),
    transactions: { eligible: 0, created: 0, alreadyThere: 0, skipped: [] },
    budgets: { created: 0, alreadyThere: 0 },
    goals: { created: 0, alreadyThere: 0 },
    totals: { localIncomePaise: 0, localExpensePaise: 0, serverIncomePaise: 0, serverExpensePaise: 0, match: false },
    errors: [],
  };

  const eligible = txs.filter(t => t && t.status !== "soft_deleted");
  for (let i = 0; i < eligible.length; i++) {
    const t = eligible[i];
    onProgress?.(i, eligible.length);
    const body = toServerCreate(t, refs);
    if (body.ok === false) {
      report.transactions.skipped.push({ id: t.id, reason: body.reason });
      continue;
    }
    report.transactions.eligible++;
    const paise = body.body.amount_paise as number;
    if (t.type === "income") report.totals.localIncomePaise += paise;
    else report.totals.localExpensePaise += paise;
    try {
      const res = await fetchCreate(body.body, `local:${t.id}`);
      if (res.replayed) report.transactions.alreadyThere++;
      else report.transactions.created++;
      if (res.tx.kind === "income") report.totals.serverIncomePaise += res.tx.amount_paise;
      else report.totals.serverExpensePaise += res.tx.amount_paise;
    } catch (e) {
      report.errors.push(`${t.date} ${t.description}: ${(e as Error).message}`);
      if ((e as ApiError).isOffline) break;
    }
  }
  onProgress?.(eligible.length, eligible.length);

  const serverBudgets = await api<any[]>("GET", "/api/v1/budgets?include_archived=true");
  for (const b of (readJson(profileKey("bagla_budgets_v1", local)) || []) as Budget[]) {
    if (serverBudgets.some(s => s.name === b.name)) { report.budgets.alreadyThere++; continue; }
    try {
      await api("POST", "/api/v1/budgets", toServerBudget(b));
      report.budgets.created++;
    } catch (e) {
      report.errors.push(`Budget "${b.name}": ${(e as Error).message}`);
    }
  }
  const serverGoals = await api<any[]>("GET", "/api/v1/goals");
  for (const g of (readJson(profileKey("bagla_goals_v1", local)) || []) as any[]) {
    const name = g.name || g.title;
    if (serverGoals.some(s => s.name === name)) { report.goals.alreadyThere++; continue; }
    try {
      const s = await api<any>("POST", "/api/v1/goals", toServerGoal(g));
      if (Number(g.currentAmount) > 0) {
        await api("POST", `/api/v1/goals/${s.id}/contributions`, { amount_paise: toPaise(Number(g.currentAmount)) });
      }
      report.goals.created++;
    } catch (e) {
      report.errors.push(`Goal "${name}": ${(e as Error).message}`);
    }
  }

  // Stores the server doesn't hold yet (groups, recurring bills, family space,
  // categories) are copied into the account's on-device cache if it has none.
  for (const base of ["bagla_groups_v1", "bagla_recurring_v1", "bagla_family_v1", "bagla_categories_v1"]) {
    const src = localStorage.getItem(profileKey(base, local));
    if (src && !localStorage.getItem(profileKey(base, cloud))) {
      try { localStorage.setItem(profileKey(base, cloud), src); } catch { /* ignore */ }
    }
  }

  report.totals.match = report.totals.localIncomePaise === report.totals.serverIncomePaise &&
    report.totals.localExpensePaise === report.totals.serverExpensePaise && report.errors.length === 0;
  try { localStorage.setItem(profileKey("bagla_migration_v1", cloud), JSON.stringify(report)); } catch { /* ignore */ }
  return report;
}

/** POST with idempotency, reporting whether the server replayed an existing row. */
async function fetchCreate(body: Record<string, unknown>, key: string): Promise<{ tx: ServerTx; replayed: boolean }> {
  const r = await apiWithStatus<ServerTx>("POST", "/api/v1/transactions", body, { idempotencyKey: key });
  return { tx: r.data, replayed: r.status === 200 }; // 200 = idempotent replay, 201 = newly created
}
