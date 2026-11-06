import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileUp, Loader2, MessageSquare, RefreshCw, Users, Crown } from "lucide-react";
import { useFinance } from "../context/FinanceContext";
import { ApiError, api } from "../api/client";
import { formatINR } from "../utils/money";

const card = "p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs space-y-4";
const input = "w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500";
const btn = "px-4 py-2.5 rounded-xl bg-[#047857] hover:bg-[#065f46] disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer";
const ghost = "px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 text-xs font-bold text-gray-700 dark:text-slate-200 inline-flex items-center gap-2 cursor-pointer";

/** Small loader hook with loading / error / retry. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await fn()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

const Status: React.FC<{ loading: boolean; error: string | null; onRetry: () => void }> = ({ loading, error, onRetry }) =>
  loading ? <p className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
  : error ? <p role="alert" className="text-xs text-rose-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}
      <button onClick={onRetry} className="underline font-bold cursor-pointer">Retry</button></p>
  : null;

function readFileBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = () => rej(new Error("Couldn't read the file"));
    r.readAsDataURL(file);
  });
}

// --------------------------------------------------------------------------- import

function ImportPanel() {
  const { syncNow } = useFinance();
  const accounts = useLoad(() => api<any[]>("GET", "/api/v1/accounts"));
  const [accountId, setAccountId] = useState("");
  const [batch, setBatch] = useState<any | null>(null);
  const [exclude, setExclude] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setDone(null); setBatch(null);
    if (file.size > 700_000) { setError("File is too large (max 700 KB). Export a shorter date range."); return; }
    setBusy(true);
    try {
      const b = await api<any>("POST", "/api/v1/imports/preview", {
        account_id: accountId || accounts.data?.[0]?.id, filename: file.name, content_base64: await readFileBase64(file) });
      setBatch(b);
      setExclude(new Set());
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<any>("POST", `/api/v1/imports/${batch.id}/commit`, { exclude_row_numbers: [...exclude] });
      setDone(`${r.imported_count} entr${r.imported_count === 1 ? "y" : "ies"} added to your ledger.`);
      setBatch(null);
      syncNow(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const ok = batch?.rows?.filter((r: any) => !r.error && !r.duplicate_of_id) || [];
  return (
    <section className={card} aria-labelledby="imp">
      <h2 id="imp" className="font-bold text-gray-950 dark:text-white flex items-center gap-2"><FileUp className="w-5 h-5 text-emerald-600" /> Import a bank statement</h2>
      <p className="text-xs text-gray-500 dark:text-slate-400">CSV or Excel (.xlsx) from your bank's website. You'll review every row before anything is added. Uploading the same statement twice never adds duplicates.</p>
      <Status loading={accounts.loading} error={accounts.error} onRetry={accounts.reload} />
      {accounts.data && (
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="text-xs font-bold text-gray-700 dark:text-slate-300 flex-1">Account
            <select className={`${input} mt-1`} value={accountId || accounts.data[0]?.id || ""} onChange={e => setAccountId(e.target.value)}>
              {accounts.data.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-gray-700 dark:text-slate-300 flex-1">Statement file
            <input className={`${input} mt-1`} type="file" accept=".csv,.xlsx,text/csv" disabled={busy}
              onChange={e => onFile(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {busy && <p className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Working…</p>}
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
      {done && <p role="status" className="text-xs font-semibold text-emerald-700">{done}</p>}
      {batch && (
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-slate-300">{batch.row_count} rows · {batch.error_count} with problems · {batch.duplicate_count} already in your ledger (skipped)</p>
          <div className="max-h-80 overflow-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0"><tr>
                <th className="p-2 text-left">Add?</th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Description</th>
                <th className="p-2 text-right">Amount</th><th className="p-2 text-left">Note</th></tr></thead>
              <tbody>{batch.rows.map((r: any) => (
                <tr key={r.row_number} className="border-t border-gray-100 dark:border-slate-800">
                  <td className="p-2">{!r.error && !r.duplicate_of_id && (
                    <input type="checkbox" aria-label={`Include row ${r.row_number}`} checked={!exclude.has(r.row_number)}
                      onChange={e => { const n = new Set(exclude); e.target.checked ? n.delete(r.row_number) : n.add(r.row_number); setExclude(n); }} />)}</td>
                  <td className="p-2 whitespace-nowrap">{r.local_date || "—"}</td>
                  <td className="p-2">{r.description}</td>
                  <td className={`p-2 text-right whitespace-nowrap ${r.direction === "credit" ? "text-emerald-700" : ""}`}>
                    {r.amount_paise != null ? `${r.direction === "credit" ? "+" : "−"}${formatINR(r.amount_paise / 100)}` : "—"}</td>
                  <td className="p-2 text-gray-500">{r.error ? <span className="text-rose-600">{r.error}</span> : r.duplicate_of_id ? "Already recorded" : r.category || "Needs a category"}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button className={btn} disabled={busy || ok.length - exclude.size <= 0} onClick={commit}>Add {Math.max(0, ok.length - exclude.size)} entries</button>
            <button className={ghost} onClick={() => setBatch(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------- family

function FamilyPanel() {
  const fams = useLoad(() => api<any[]>("GET", "/api/v1/families"));
  const [active, setActive] = useState<string | null>(null);
  const detail = useLoad(() => (active ? api<any>("GET", `/api/v1/families/${active}`) : Promise.resolve(null)), [active]);
  const shared = useLoad(() => (active ? api<any>("GET", `/api/v1/families/${active}/transactions`) : Promise.resolve(null)), [active]);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [invite, setInvite] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const act = async (fn: () => Promise<any>, ok?: string) => {
    setMsg(null);
    try { await fn(); if (ok) setMsg(ok); fams.reload(); detail.reload(); shared.reload(); }
    catch (e) { setMsg((e as ApiError).message); }
  };

  return (
    <section className={card} aria-labelledby="fam">
      <h2 id="fam" className="font-bold text-gray-950 dark:text-white flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> Family</h2>
      <p className="text-xs text-gray-500 dark:text-slate-400">Your entries stay private. Only entries you choose to share are visible to your family.</p>
      <Status loading={fams.loading} error={fams.error} onRetry={fams.reload} />
      {fams.data && fams.data.length === 0 && <p className="text-xs text-gray-500">You're not in a family group yet.</p>}
      <div className="flex flex-wrap gap-2">
        {fams.data?.map(f => (
          <button key={f.id} onClick={() => setActive(f.id)} className={active === f.id ? btn : ghost}>{f.name} · {f.my_role}</button>))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); act(() => api("POST", "/api/v1/families", { name }), "Family created"); setName(""); }}>
          <input className={input} placeholder="New family name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} aria-label="New family name" />
          <button className={btn}>Create</button>
        </form>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); act(() => api("POST", "/api/v1/families/invites/accept", { token: token.trim() }), "You joined the family"); setToken(""); }}>
          <input className={input} placeholder="Paste an invite code" value={token} onChange={e => setToken(e.target.value)} required aria-label="Invite code" />
          <button className={btn}>Join</button>
        </form>
      </div>
      {msg && <p role="status" className="text-xs font-semibold text-gray-700 dark:text-slate-300">{msg}</p>}
      {active && (
        <div className="space-y-3">
          <Status loading={detail.loading} error={detail.error} onRetry={detail.reload} />
          {detail.data && (
            <>
              <ul className="text-xs space-y-1">{detail.data.members.map((m: any) => (
                <li key={m.member_id} className="flex justify-between"><span>{m.name}</span><span className="text-gray-500">{m.role}</span></li>))}</ul>
              {detail.data.my_role === "admin" && (
                <div className="flex items-center gap-2">
                  <button className={ghost} onClick={() => act(async () => {
                    const r = await api<any>("POST", `/api/v1/families/${active}/invites`, { role: "adult" });
                    setInvite(r.token);
                  })}>Create invite code</button>
                  {invite && <code className="text-[11px] bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded break-all">{invite}</code>}
                </div>)}
              {invite && <p className="text-[11px] text-gray-500">Share this code yourself (it isn't emailed). It works once and expires in 7 days.</p>}
            </>)}
          <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300">Shared entries</h3>
          <Status loading={shared.loading} error={shared.error} onRetry={shared.reload} />
          {shared.data && shared.data.items.length === 0 && <p className="text-xs text-gray-500">Nothing shared yet. Use “Share one of my entries” below.</p>}
          {shared.data?.items.map((t: any) => (
            <div key={t.id} className="flex justify-between text-xs"><span>{t.local_date} · {t.member} · {t.description}</span><span>{formatINR(t.amount_paise / 100)}</span></div>))}
          {shared.data && shared.data.items.length > 0 && <p className="text-xs font-bold">Shared spending: {formatINR(shared.data.shared_net_spend_paise / 100)}</p>}
          {detail.data && detail.data.my_role !== "viewer" && <ShareMine familyId={active} onChange={() => shared.reload()} />}
        </div>)}
    </section>
  );
}

/** The owner's own recent entries, each with an explicit share / make-private toggle. */
function ShareMine({ familyId, onChange }: { familyId: string; onChange: () => void }) {
  const mine = useLoad(() => api<any>("GET", "/api/v1/transactions?limit=15"), [familyId]);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async (t: any) => {
    setErr(null);
    try {
      await api("POST", `/api/v1/families/share/${t.id}`, { family_id: t.shared_family_id === familyId ? null : familyId });
      mine.reload();
      onChange();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <details className="text-xs">
      <summary className="font-bold cursor-pointer text-gray-700 dark:text-slate-300">Share one of my entries</summary>
      <Status loading={mine.loading} error={mine.error} onRetry={mine.reload} />
      {mine.data?.items.length === 0 && <p className="text-gray-500 mt-2">You have no entries yet.</p>}
      <ul className="mt-2 space-y-1">{mine.data?.items.map((t: any) => (
        <li key={t.id} className="flex justify-between items-center gap-2">
          <span>{t.local_date} · {t.description} · {formatINR(t.amount_paise / 100)}</span>
          <button className={ghost} onClick={() => toggle(t)}>{t.shared_family_id === familyId ? "Make private" : "Share"}</button>
        </li>))}</ul>
      {err && <p role="alert" className="text-rose-600">{err}</p>}
    </details>
  );
}

// --------------------------------------------------------------------------- support, feedback, plan

function SupportPanel() {
  const tickets = useLoad(() => api<any[]>("GET", "/api/v1/support/tickets"));
  const [form, setForm] = useState({ category: "question", subject: "", message: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [rating, setRating] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try {
      const t = await api<any>("POST", "/api/v1/support/tickets", form);
      setMsg(`Request ${t.reference} recorded. ${t.notice}`);
      setForm({ category: "question", subject: "", message: "" });
      tickets.reload();
    } catch (e2) { setMsg((e2 as Error).message); }
  };

  return (
    <section className={card} aria-labelledby="sup">
      <h2 id="sup" className="font-bold text-gray-950 dark:text-white flex items-center gap-2"><MessageSquare className="w-5 h-5 text-purple-600" /> Help & support</h2>
      <p className="text-xs text-gray-500 dark:text-slate-400">We'll never ask for your UPI PIN, OTP, card CVV or bank password.</p>
      <form onSubmit={submit} className="grid gap-2">
        <select className={input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} aria-label="Topic">
          {["question", "bug", "import", "data_issue", "account_access", "security", "billing", "other"].map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
        </select>
        <input className={input} placeholder="Subject" required minLength={3} maxLength={160} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} aria-label="Subject" />
        <textarea className={input} placeholder="What happened? (at least 10 characters)" required minLength={10} maxLength={4000} rows={3} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} aria-label="Message" />
        <button className={btn}>Send request</button>
      </form>
      {msg && <p role="status" className="text-xs font-semibold text-gray-700 dark:text-slate-300">{msg}</p>}
      <Status loading={tickets.loading} error={tickets.error} onRetry={tickets.reload} />
      {tickets.data?.length === 0 && <p className="text-xs text-gray-500">No requests yet.</p>}
      {tickets.data?.map(t => <div key={t.reference} className="text-xs flex justify-between"><span>{t.reference} · {t.subject}</span><span className="text-gray-500">{t.status}</span></div>)}
      <div className="pt-2 border-t border-gray-100 dark:border-slate-800 text-xs flex items-center gap-2" aria-label="Rate Bagla">
        <span>How is Bagla working for you?</span>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} aria-label={`${n} star${n > 1 ? "s" : ""}`} className={`w-8 h-8 rounded-lg border cursor-pointer ${rating >= n ? "bg-amber-100 border-amber-300" : "border-gray-200 dark:border-slate-700"}`}
            onClick={async () => { setRating(n); try { await api("POST", "/api/v1/feedback", { kind: "satisfaction", rating: n, context: "cloud_hub" }); } catch { /* best effort */ } }}>★</button>))}
        {rating > 0 && <span className="text-emerald-700">Thanks!</span>}
      </div>
    </section>
  );
}

function PlanPanel() {
  const me = useLoad(() => api<any>("GET", "/api/v1/billing/me"));
  const plans = useLoad(() => api<any[]>("GET", "/api/v1/billing/plans"));
  const [msg, setMsg] = useState<string | null>(null);
  const call = async (path: string, body?: unknown) => {
    setMsg(null);
    try { me.setData(await api("POST", path, body)); } catch (e) { setMsg((e as Error).message); }
  };
  const s = me.data;
  return (
    <section className={card} aria-labelledby="plan">
      <h2 id="plan" className="font-bold text-gray-950 dark:text-white flex items-center gap-2"><Crown className="w-5 h-5 text-amber-500" /> Your plan</h2>
      <Status loading={me.loading} error={me.error} onRetry={me.reload} />
      {s && (
        <p className="text-xs text-gray-700 dark:text-slate-300">
          {s.has_access ? `${s.plan} · ${s.status}${s.access_until ? ` · access until ${new Date(s.access_until).toLocaleDateString("en-IN")}` : ""}` : "Free plan"}
          {s.cancel_at_period_end && " · won't renew"}
        </p>)}
      {plans.data && plans.data.length === 0 && <p className="text-xs text-gray-500">Paid plans aren't available yet.</p>}
      {s && !s.has_access && s.status !== "expired" && plans.data?.map(p => (
        <button key={p.code} className={btn} onClick={() => call("/api/v1/billing/trial", { plan_code: p.code })}>Start {p.trial_days}-day free trial of {p.name}</button>))}
      {s?.has_access && !s.cancel_at_period_end && <button className={ghost} onClick={() => call("/api/v1/billing/cancel")}>Cancel renewal (keep access until the end date)</button>}
      {s?.has_access && s.cancel_at_period_end && <button className={ghost} onClick={() => call("/api/v1/billing/resume")}>Keep my plan</button>}
      <p className="text-[11px] text-gray-400">No payment method is collected. Trials end automatically.</p>
      {msg && <p role="alert" className="text-xs text-rose-600">{msg}</p>}
    </section>
  );
}

export const CloudHubView: React.FC = () => {
  const { cloud, setCurrentTab } = useFinance();
  if (!cloud.enabled || cloud.state === "signed_out") {
    return (
      <div className={card}>
        <h1 className="text-xl font-black text-gray-950 dark:text-white">Account features</h1>
        <p className="text-sm text-gray-600 dark:text-slate-300">Statement import, family sharing, support requests and plans need a Bagla account.</p>
        <button className={btn} onClick={() => setCurrentTab("account")}>Sign in or create an account</button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-950 dark:text-white">Account features</h1>
        <button className={ghost} onClick={() => window.location.reload()}><RefreshCw className="w-4 h-4" /> Refresh</button>
      </header>
      <ImportPanel />
      <FamilyPanel />
      <SupportPanel />
      <PlanPanel />
    </div>
  );
};
