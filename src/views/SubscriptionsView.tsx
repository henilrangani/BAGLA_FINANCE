import React, { useCallback, useEffect, useState } from "react";
import { useFinance } from "../context/FinanceContext";
import { AlertCircle, Bell, CheckCircle2, Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";
import type { RecurringExpense } from "../types";
import { api } from "../api/client";
import { formatINR, fromPaise, parseRupeeInput, toPaise } from "../utils/money";
import { localDateString } from "../utils/dates";

type Freq = "weekly" | "monthly" | "quarterly" | "yearly";
import { monthlyPaise } from "../utils/recurring";

const card = "p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-4";
const input = "w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#F2F4F7] dark:bg-slate-800 font-medium outline-none focus:ring-2 focus:ring-indigo-500";

interface FormValues { name: string; amountPaise: number; frequency: Freq; startDate: string; accountId?: string }

function AddForm({ accounts, onSave, onClose }: { accounts?: { id: string; name: string }[];
  onSave: (v: FormValues) => Promise<void> | void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Freq>("monthly");
  const [startDate, setStartDate] = useState(localDateString());
  const [accountId, setAccountId] = useState(accounts?.[0]?.id || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseRupeeInput(amount);
    if (p.ok === false) return setError(p.error);
    setBusy(true);
    try {
      await onSave({ name: name.trim() || "Bill", amountPaise: p.paise, frequency, startDate, accountId: accountId || undefined });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm" role="dialog" aria-label="Add a recurring bill">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 p-6 space-y-3.5 text-xs">
        <h3 className="font-bold text-base text-gray-900 dark:text-white">Add a bill or subscription</h3>
        <label className="block text-gray-500 font-bold">Name *
          <input className={`${input} mt-1`} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Internet, Rent, Netflix" required maxLength={120} />
        </label>
        <label className="block text-gray-500 font-bold">Amount (₹) *
          <input className={`${input} mt-1`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="649" required />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block text-gray-500 font-bold">Repeats
            <select className={`${input} mt-1`} value={frequency} onChange={e => setFrequency(e.target.value as Freq)}>
              <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              <option value="quarterly">Every 3 months</option><option value="yearly">Yearly</option>
            </select>
          </label>
          <label className="block text-gray-500 font-bold">First due date
            <input className={`${input} mt-1`} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </label>
        </div>
        {accounts && (
          <label className="block text-gray-500 font-bold">Paid from
            <select className={`${input} mt-1`} value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        {error && <p role="alert" className="font-semibold text-rose-600">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-3 border border-gray-200 dark:border-slate-700 font-bold rounded-2xl cursor-pointer">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-2xl cursor-pointer">Save</button>
        </div>
      </form>
    </div>
  );
}

function Summary({ monthly, count, overdue, soon }: { monthly: number; count: number; overdue: number; soon: number }) {
  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-6 border border-slate-800">
      <div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 block mb-1">Monthly fixed commitments</span>
        <span className="text-3xl sm:text-4xl font-black tracking-tight">{formatINR(fromPaise(monthly))}<span className="text-xs font-medium text-slate-400 ml-1.5">/ month</span></span>
        <p className="text-xs text-slate-400 mt-2">{formatINR(fromPaise(monthly * 12))} a year across {count} active bill{count === 1 ? "" : "s"}.</p>
      </div>
      <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs space-y-1.5 max-w-xs" role="status">
        <span className="font-bold text-indigo-400 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Reminders</span>
        <p className="text-slate-300 text-[11px]">
          {overdue > 0 ? `${overdue} payment${overdue === 1 ? "" : "s"} overdue. ` : "Nothing overdue. "}
          {soon > 0 ? `${soon} due in the next 7 days.` : "Nothing due in the next 7 days."}
        </p>
      </div>
    </div>
  );
}

/** Device-only mode: bills stored in this browser. */
function LocalBills() {
  const { recurring, addRecurring, toggleRecurring, deleteRecurring } = useFinance();
  const [open, setOpen] = useState(false);
  const today = localDateString();
  const in7 = localDateString(new Date(Date.now() + 7 * 86_400_000));
  const active = recurring.filter(r => r.active);
  return (
    <>
      <Summary monthly={monthlyPaise(active.map(r => ({ amountPaise: toPaise(r.amount), frequency: r.frequency })))}
        count={active.length} overdue={active.filter(r => r.nextRenewalDate < today).length}
        soon={active.filter(r => r.nextRenewalDate >= today && r.nextRenewalDate <= in7).length} />
      <button onClick={() => setOpen(true)} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
        <Plus className="w-4 h-4" /> Add bill
      </button>
      {recurring.length === 0 && <p className="text-sm text-gray-500">No recurring bills yet. Add rent, internet or subscriptions to see what's coming up.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {recurring.map(r => (
          <div key={r.id} className={card}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 dark:text-white">{r.name}</span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold capitalize">{r.active ? r.frequency : "paused"}</span>
            </div>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{formatINR(r.amount)}</span>
            <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-gray-500">Next due: <strong className="text-gray-800 dark:text-slate-200">{r.nextRenewalDate || "—"}</strong></span>
              <div className="flex gap-1">
                <button onClick={() => toggleRecurring(r.id)} aria-label={r.active ? `Pause ${r.name}` : `Resume ${r.name}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer">{r.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
                <button onClick={() => deleteRecurring(r.id)} aria-label={`Remove ${r.name}`} className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {open && <AddForm onClose={() => setOpen(false)} onSave={v => addRecurring({
        name: v.name, merchant: v.name, amount: fromPaise(v.amountPaise), frequency: v.frequency as RecurringExpense["frequency"],
        nextRenewalDate: v.startDate, categoryId: "cat-bills", paymentMethod: "upi", active: true, autoReminder: true })} />}
    </>
  );
}

/** Account mode: bills stored on the server; pay/skip post audited, de-duplicated ledger entries. */
function AccountBills() {
  const { syncNow } = useFinance();
  const [bills, setBills] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; amount: string } | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, a] = await Promise.all([api<any[]>("GET", "/api/v1/recurring"), api<any[]>("GET", "/api/v1/accounts")]);
      setBills(b);
      setAccounts(a.map(x => ({ id: x.id, name: x.name })));
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, posted = false) => {
    setBusy(key); setError(null);
    try { await fn(); await load(); if (posted) syncNow(true); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const today = localDateString();
  const in7 = localDateString(new Date(Date.now() + 7 * 86_400_000));

  if (!bills) {
    return error
      ? <p role="alert" className="text-sm text-rose-600 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error} <button onClick={load} className="underline font-bold cursor-pointer">Retry</button></p>
      : <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading bills…</p>;
  }
  const active = bills.filter(b => b.status === "active");
  return (
    <>
      <Summary monthly={monthlyPaise(active.map(b => ({ amountPaise: b.amount_paise, frequency: b.frequency })))}
        count={active.length} overdue={active.reduce((s, b) => s + b.overdue_dates.length, 0)}
        soon={active.filter(b => b.next_due_date && b.next_due_date > today && b.next_due_date <= in7).length} />
      <button onClick={() => setOpen(true)} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
        <Plus className="w-4 h-4" /> Add bill
      </button>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
      {bills.length === 0 && <p className="text-sm text-gray-500">No recurring bills yet. Add rent, internet or subscriptions to see what's coming up.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {bills.map(b => (
          <div key={b.id} className={card}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 dark:text-white">{b.name}</span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold capitalize">{b.status === "active" ? b.frequency : b.status}</span>
            </div>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{formatINR(fromPaise(b.amount_paise))}</span>
            {b.overdue_dates.length > 0 && (
              <div className="space-y-1.5" aria-label={`Overdue payments for ${b.name}`}>
                {b.overdue_dates.slice(0, 3).map((d: string) => (
                  <div key={d} className="flex items-center justify-between text-xs p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                    <span className="font-bold text-amber-900 dark:text-amber-200">Due {d}</span>
                    <span className="flex gap-1">
                      <button disabled={busy !== null} onClick={() => act(`${b.id}:${d}`, () => api("POST", `/api/v1/recurring/${b.id}/occurrences/${d}/pay`, {}), true)}
                        className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer disabled:opacity-50">{busy === `${b.id}:${d}` ? "…" : "Mark paid"}</button>
                      <button disabled={busy !== null} onClick={() => act(`${b.id}:${d}:s`, () => api("POST", `/api/v1/recurring/${b.id}/occurrences/${d}/skip`))}
                        className="px-2 py-1 rounded-lg border border-amber-300 font-bold cursor-pointer disabled:opacity-50">Skip</button>
                    </span>
                  </div>
                ))}
                {b.overdue_dates.length > 3 && <p className="text-[11px] text-amber-800">+{b.overdue_dates.length - 3} more overdue</p>}
              </div>
            )}
            {editing?.id === b.id && (
              <form className="space-y-2" aria-label={`Edit ${b.name}`} onSubmit={e => {
                e.preventDefault();
                const parsed = parseRupeeInput(editing.amount);
                if (!editing.name.trim()) { setError("Enter a name."); return; }
                if (parsed.ok === false || parsed.rupees <= 0) { setError(parsed.ok === false ? parsed.error : "Enter an amount greater than zero."); return; }
                act(`${b.id}:e`, async () => {
                  await api("PATCH", `/api/v1/recurring/${b.id}`, { name: editing.name.trim(), amount_paise: toPaise(parsed.rupees) });
                  setEditing(null);
                });
              }}>
                <input className={input} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} aria-label="Bill name" maxLength={120} />
                <input className={input} value={editing.amount} onChange={e => setEditing({ ...editing, amount: e.target.value })} aria-label="Bill amount in rupees" inputMode="decimal" />
                <p className="text-[10px] text-gray-500">New amount applies to payments you mark from now on.</p>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy !== null} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs cursor-pointer">Cancel</button>
                </div>
              </form>
            )}
            <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-gray-500">Next due: <strong className="text-gray-800 dark:text-slate-200">{b.next_due_date || "—"}</strong>
                {b.history.length > 0 && <span className="ml-2 text-emerald-700 inline-flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />{b.history.filter((h: any) => h.status === "paid").length} paid</span>}</span>
              <div className="flex gap-1">
                <button aria-label={b.status === "active" ? `Pause ${b.name}` : `Resume ${b.name}`} disabled={busy !== null}
                  onClick={() => act(`${b.id}:p`, () => api("PATCH", `/api/v1/recurring/${b.id}`, { status: b.status === "active" ? "paused" : "active" }))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer">{b.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
                <button aria-label={`Edit ${b.name}`} disabled={busy !== null}
                  onClick={() => setEditing({ id: b.id, name: b.name, amount: String(fromPaise(b.amount_paise)) })}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer text-[11px] font-bold">Edit</button>
                <button aria-label={`Cancel ${b.name}`} disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm(`Cancel "${b.name}"? It stops appearing as due. Payments already recorded stay in your transactions.`)) {
                      act(`${b.id}:c`, () => api("PATCH", `/api/v1/recurring/${b.id}`, { status: "cancelled" }));
                    }
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {open && <AddForm accounts={accounts} onClose={() => setOpen(false)} onSave={async v => {
        await api("POST", "/api/v1/recurring", { name: v.name, amount_paise: v.amountPaise, frequency: v.frequency,
          start_date: v.startDate, account_id: v.accountId, category: "cat-bills" });
        await load();
      }} />}
    </>
  );
}

export const SubscriptionsView: React.FC = () => {
  const { cloud } = useFinance();
  const account = cloud.enabled && cloud.state !== "signed_out";
  return (
    <div className="space-y-6 pb-12">
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">Commitment tracker</span>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Recurring bills & subscriptions</h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium">
          {account ? "Saved to your account. Marking a bill paid records it in your ledger once, even if you tap twice."
            : "Saved on this device only. Sign in to keep them in your account."}
        </p>
      </div>
      {account ? <AccountBills /> : <LocalBills />}
    </div>
  );
};
