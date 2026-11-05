/**
 * Family Space (account mode): shared spending, budgets, goals, members, privacy and
 * activity, all from the server. Personal entries stay private unless their owner
 * shares a specific one; the server enforces every rule shown here.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Shield, Users } from "lucide-react";
import { useFinance } from "../context/FinanceContext";
import { api } from "../api/client";
import {
  acceptFamilyInvite, addFamilyBudget, addFamilyGoal, changeFamilyRole, contributeToGoal, createFamily,
  familyErrorMessage, getActivity, getFamily, getSummary, inviteToFamily, listFamilies, monthKey,
  removeFamilyMember, ROLE_INFO, setFamilyGoalStatus, shareEntry, shiftMonth, unshareAllMine, voidContribution,
  archiveFamilyBudget,
  type FamilyActivity, type FamilyDetail, type FamilyListItem, type FamilyRole, type FamilySummary,
} from "../api/family";
import { formatINR, fromPaise, parseRupeeInput, toPaise } from "../utils/money";

const card = "p-5 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 space-y-3";
const input = "px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-900 dark:text-white";
const btn = "px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer";
const link = "text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer disabled:opacity-60";
const rs = (p: number) => formatINR(fromPaise(p));
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function rupeesToPaise(text: string): number | string {
  const r = parseRupeeInput(text);
  if (r.ok === false) return r.error;
  if (r.rupees <= 0) return "Enter an amount greater than zero.";
  return toPaise(r.rupees);
}

interface MyTx { id: string; description: string; amount_paise: number; kind: string; local_date: string;
  shared_family_id: string | null }

export const FamilySpaceAccount: React.FC = () => {
  const { categories } = useFinance();
  const catName = (id: string | null) => (id ? categories.find(c => c.id === id)?.name || id : "All shared spending");
  const [families, setFamilies] = useState<FamilyListItem[] | null>(null);
  const [activeId, setActiveId] = useState("");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [summary, setSummary] = useState<FamilySummary | null>(null);
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [activity, setActivity] = useState<FamilyActivity[]>([]);
  const [myTx, setMyTx] = useState<MyTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [myUserId, setMyUserId] = useState("");

  const loadList = useCallback(async (select?: string) => {
    setLoading(true); setError("");
    try {
      const list = await listFamilies();
      setFamilies(list);
      setActiveId(prev => select || (list.some(f => f.id === prev) ? prev : list[0]?.id || ""));
    } catch (e) { setError(familyErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

  const loadFamily = useCallback(async () => {
    if (!activeId) return;
    setLoading(true); setError("");
    try {
      const [s, d, a, t, me] = await Promise.all([getSummary(activeId, month), getFamily(activeId), getActivity(activeId),
        api<{ items: MyTx[] }>("GET", "/api/v1/transactions?limit=20&status=posted"),
        api<{ id: string }>("GET", "/api/v1/users/me")]);
      setMyUserId(me.id);
      setSummary(s); setDetail(d); setActivity(a); setMyTx(t.items.filter(x => x.kind === "expense" || x.kind === "refund"));
    } catch (e) { setError(familyErrorMessage(e)); }
    finally { setLoading(false); }
  }, [activeId, month]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadFamily(); }, [loadFamily]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string, after: () => Promise<void> = loadFamily) => {
    setBusy(key); setNotice(""); setError("");
    try { await fn(); setNotice(ok); await after(); }
    catch (e) { setError(familyErrorMessage(e)); }
    finally { setBusy(""); }
  };

  if (families === null) {
    return <State loading={loading} error={error} retry={() => loadList()} />;
  }
  if (families.length === 0) {
    return <NoFamily busy={busy} error={error} notice={notice} onCreate={name => act("create", async () => {
      const f = await createFamily(name); await loadList(f.id);
    }, "Family created", async () => {})} onJoin={code => act("join", async () => {
      const r = await acceptFamilyInvite(code); await loadList(r.family_id);
    }, "You joined the family", async () => {})} />;
  }

  const role = summary?.family.my_role || detail?.my_role;
  const canManage = role === "admin" || role === "adult";
  const canContribute = canManage || role === "child";
  const canShare = role !== "viewer";

  return (
    <div className="space-y-5 pb-12" data-testid="family-space">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Family Space</span>
          <div className="flex items-center gap-2">
            {families.length > 1 ? (
              <select value={activeId} onChange={e => setActiveId(e.target.value)} aria-label="Choose family"
                className="text-2xl font-black bg-transparent text-gray-900 dark:text-white">
                {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            ) : <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">{families[0].name}</h1>}
            {role && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold capitalize">{role}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className={link} onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-xs font-bold text-gray-700 dark:text-slate-300 w-16 text-center">{month}</span>
          <button className={link} onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
          <button className={link} onClick={() => loadFamily()} aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex gap-3 text-xs">
        <Shield className="w-5 h-5 text-indigo-600 shrink-0" />
        <p className="text-gray-700 dark:text-indigo-200">
          Your entries are <strong>private</strong>. The family sees only entries you choose to share below, and you can make them private again at any time. Goal contributions are records of money you set aside; they don't move money.
        </p>
      </div>

      {error && <div role="alert" className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between">
        <span>{error}</span><button className={link} onClick={() => loadFamily()}>Retry</button></div>}
      {notice && <div role="status" className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">{notice}</div>}

      {!summary ? <State loading={loading} error="" retry={loadFamily} /> : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-5">
            <section className={card} aria-label="Shared spending">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Shared spending · {month}</h3>
              <p className="text-3xl font-black text-gray-900 dark:text-white" data-testid="family-shared-total">{rs(summary.shared_spend_paise)}</p>
              {summary.by_member.length === 0
                ? <p className="text-xs text-gray-500">Nothing shared this month yet.</p>
                : <ul className="text-xs space-y-1">{summary.by_member.map(m => (
                  <li key={m.member} className="flex justify-between"><span>{m.member}{m.mine ? " (you)" : ""} · {m.entries} entr{m.entries === 1 ? "y" : "ies"}</span><strong>{rs(m.spend_paise)}</strong></li>))}</ul>}
              {summary.by_category.length > 0 && <ul className="text-[11px] text-gray-500 grid grid-cols-2 gap-1 pt-2 border-t border-gray-100 dark:border-slate-800">
                {summary.by_category.map(c => <li key={c.category} className="flex justify-between pr-3"><span>{catName(c.category)}</span><span>{rs(c.spend_paise)}</span></li>)}</ul>}
            </section>

            <section className={card} aria-label="Family budgets">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Budgets (per month)</h3>
              {summary.budgets.length === 0 && <p className="text-xs text-gray-500">No family budgets yet.</p>}
              {summary.budgets.map(b => {
                const pct = Math.min(100, Math.round((b.spent_paise / b.limit_paise) * 100));
                return (
                  <div key={b.id} className="space-y-1" data-testid="family-budget">
                    <div className="flex justify-between text-xs"><span className="font-bold">{b.name} <span className="text-gray-400 font-normal">· {catName(b.category)}</span></span>
                      <span className={b.over ? "text-rose-600 font-bold" : ""}>{rs(b.spent_paise)} / {rs(b.limit_paise)}</span></div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"><div className={`h-full ${b.over ? "bg-rose-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} /></div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>{b.over ? `Over by ${rs(-b.remaining_paise)}` : `${rs(b.remaining_paise)} left`}</span>
                      {canManage && <button className={link} disabled={!!busy} onClick={() => { if (window.confirm(`Archive the budget "${b.name}"?`)) act(`ab-${b.id}`, () => archiveFamilyBudget(activeId, b.id), "Budget archived"); }}>Archive</button>}
                    </div>
                  </div>);
              })}
              {canManage && <AddBudget categories={categories.map(c => ({ id: c.id, name: c.name }))} busy={busy === "budget"}
                onAdd={(name, paise, cat) => act("budget", () => addFamilyBudget(activeId, name, paise, cat), "Budget added")} />}
            </section>

            <section className={card} aria-label="Family goals">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Goals</h3>
              {summary.goals.length === 0 && <p className="text-xs text-gray-500">No family goals yet.</p>}
              {summary.goals.map(g => {
                const pct = Math.min(100, Math.round((g.saved_paise / g.target_paise) * 100));
                return (
                  <div key={g.id} className="space-y-1.5 pb-3 border-b border-gray-100 dark:border-slate-800 last:border-0" data-testid="family-goal">
                    <div className="flex justify-between text-xs"><span className="font-bold">{g.name}{g.status === "completed" ? " ✓" : ""}</span>
                      <span>{rs(g.saved_paise)} of {rs(g.target_paise)}</span></div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                    {g.by_member.length > 0 && <p className="text-[11px] text-gray-500">{g.by_member.map(m => `${m.member}${m.mine ? " (you)" : ""}: ${rs(m.amount_paise)}`).join(" · ")}</p>}
                    {g.contributions.filter(c => c.mine || role === "admin").slice(0, 5).map(c => (
                      <div key={c.id} className="flex justify-between text-[10px] text-gray-500"><span>{c.contributed_on} · {c.member} · {rs(c.amount_paise)}</span>
                        <button className={link} disabled={!!busy} onClick={() => { if (window.confirm(`Remove this ${rs(c.amount_paise)} contribution? It stays in the history as removed.`)) act(`vc-${c.id}`, () => voidContribution(activeId, g.id, c.id), "Contribution removed"); }}>Remove</button></div>))}
                    <div className="flex flex-wrap gap-3 items-center">
                      {canContribute && g.status === "active" && <Contribute busy={busy === `c-${g.id}`}
                        onAdd={paise => act(`c-${g.id}`, () => contributeToGoal(activeId, g.id, paise, newKey()), "Contribution recorded")} />}
                      {canManage && g.status === "active" && <button className={link} disabled={!!busy} onClick={() => act(`gc-${g.id}`, () => setFamilyGoalStatus(activeId, g.id, "completed"), "Goal marked complete")}>Mark complete</button>}
                    </div>
                  </div>);
              })}
              {canManage && <AddGoal busy={busy === "goal"} onAdd={(name, paise, d) => act("goal", () => addFamilyGoal(activeId, name, paise, d), "Goal added")} />}
            </section>
          </div>

          <div className="lg:col-span-5 space-y-5">
            <section className={card} aria-label="Family members">
              <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5"><Users className="w-4 h-4" />Members</h3>
              {detail?.members.map(m => (
                <MemberRow key={m.member_id} m={m} isAdmin={role === "admin"} busy={!!busy}
                  isMe={m.user_id === myUserId}
                  onRole={r => act(`r-${m.member_id}`, () => changeFamilyRole(activeId, m.member_id, r), "Role updated")}
                  onRemove={(self) => act(`rm-${m.member_id}`, () => removeFamilyMember(activeId, m.member_id),
                    self ? "You left the family" : "Member removed", self ? () => loadList() : loadFamily)} />
              ))}
              {role === "admin" && <Invite familyName={summary.family.name} onInvite={r => inviteToFamily(activeId, r)} />}
            </section>

            <section className={card} aria-label="My sharing">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">What I share</h3>
              <p className="text-[11px] text-gray-500">You share {summary.my_shared_entries} entr{summary.my_shared_entries === 1 ? "y" : "ies"} with this family. Only you can share or un-share your entries.</p>
              {!canShare && <p className="text-[11px] text-amber-600">Viewers can't share entries.</p>}
              {canShare && myTx.length === 0 && <p className="text-xs text-gray-500">No recent expenses to share.</p>}
              {canShare && myTx.slice(0, 10).map(t => {
                const sharedHere = t.shared_family_id === activeId;
                return (
                  <div key={t.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="truncate">{t.local_date} · {t.description}</span>
                    <span className="flex items-center gap-2 shrink-0"><strong>{rs(t.amount_paise)}</strong>
                      <button className={link} disabled={!!busy} onClick={() => act(`s-${t.id}`, () => shareEntry(t.id, sharedHere ? null : activeId), sharedHere ? "Entry is private again" : "Entry shared with the family")}>
                        {sharedHere ? "Make private" : "Share"}</button></span>
                  </div>);
              })}
              {summary.my_shared_entries > 0 && <button className={link} disabled={!!busy} onClick={() => {
                if (window.confirm("Make every entry you've shared with this family private again?")) {
                  act("unshare", () => unshareAllMine(activeId), "All your entries are private again");
                }
              }}>Make all my shared entries private</button>}
            </section>

            <section className={card} aria-label="Family activity">
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Activity</h3>
              {activity.length === 0 ? <p className="text-xs text-gray-500">No activity yet.</p> : (
                <ul className="text-[11px] space-y-1.5 text-gray-600 dark:text-slate-300">{activity.slice(0, 15).map((a, i) => (
                  <li key={i}><strong>{a.mine ? "You" : a.actor}</strong> {a.label}
                    {typeof a.details.name === "string" ? ` "${a.details.name}"` : typeof a.details.goal === "string" ? ` "${a.details.goal}"` : ""}
                    {typeof a.details.amount_paise === "number" ? ` · ${rs(a.details.amount_paise)}` : ""}
                    <span className="text-gray-400"> · {new Date(a.at).toLocaleDateString("en-IN")}</span></li>))}</ul>)}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

const State: React.FC<{ loading: boolean; error: string; retry: () => void }> = ({ loading, error, retry }) => (
  <div className="py-16 text-center text-xs text-gray-500" role={error ? "alert" : "status"}>
    {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading Family Space…</span>
      : error ? <span className="space-x-2"><span className="text-rose-600 font-semibold">{error}</span><button className={link} onClick={retry}>Retry</button></span> : null}
  </div>
);

const NoFamily: React.FC<{ busy: string; error: string; notice: string; onCreate: (n: string) => void; onJoin: (c: string) => void }> = (
  { busy, error, notice, onCreate, onJoin }) => {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <div className="max-w-lg mx-auto my-10 space-y-4" data-testid="family-empty">
      <div className={card}>
        <h2 className="text-lg font-black text-gray-900 dark:text-white">Start a Family Space</h2>
        <p className="text-xs text-gray-500">Track shared household spending, budgets and goals together. Everyone's personal entries stay private unless they share one.</p>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name); }}>
          <input className={`${input} flex-1`} value={name} onChange={e => setName(e.target.value)} placeholder="Family name, e.g. Shah Family" aria-label="Family name" maxLength={120} />
          <button className={btn} disabled={busy === "create" || !name.trim()}>{busy === "create" ? "Creating…" : "Create"}</button>
        </form>
      </div>
      <div className={card}>
        <h3 className="text-sm font-black text-gray-900 dark:text-white">Have an invite code?</h3>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (code.trim()) onJoin(code); }}>
          <input className={`${input} flex-1 font-mono`} value={code} onChange={e => setCode(e.target.value)} placeholder="Paste the code" aria-label="Family invite code" />
          <button className={btn} disabled={busy === "join" || !code.trim()}>{busy === "join" ? "Joining…" : "Join"}</button>
        </form>
      </div>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600 text-center">{error}</p>}
      {notice && <p role="status" className="text-xs font-semibold text-emerald-600 text-center">{notice}</p>}
    </div>
  );
};

const AddBudget: React.FC<{ categories: { id: string; name: string }[]; busy: boolean; onAdd: (n: string, p: number, c: string | null) => void }> = (
  { categories, busy, onAdd }) => {
  const [name, setName] = useState(""); const [amt, setAmt] = useState(""); const [cat, setCat] = useState(""); const [err, setErr] = useState("");
  return (
    <form className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-slate-800" aria-label="Add family budget" onSubmit={e => {
      e.preventDefault(); setErr("");
      const p = rupeesToPaise(amt);
      if (!name.trim()) { setErr("Enter a budget name."); return; }
      if (typeof p === "string") { setErr(p); return; }
      onAdd(name, p, cat || null); setName(""); setAmt("");
    }}>
      <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Budget name" aria-label="Budget name" maxLength={120} />
      <input className={`${input} w-28`} value={amt} onChange={e => setAmt(e.target.value)} placeholder="₹ per month" inputMode="decimal" aria-label="Monthly limit in rupees" />
      <select className={input} value={cat} onChange={e => setCat(e.target.value)} aria-label="Budget category">
        <option value="">All shared spending</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className={btn} disabled={busy}>{busy ? "Adding…" : "Add budget"}</button>
      {err && <p role="alert" className="w-full text-[11px] text-rose-600 font-semibold">{err}</p>}
    </form>);
};

const AddGoal: React.FC<{ busy: boolean; onAdd: (n: string, p: number, d?: string) => void }> = ({ busy, onAdd }) => {
  const [name, setName] = useState(""); const [amt, setAmt] = useState(""); const [d, setD] = useState(""); const [err, setErr] = useState("");
  return (
    <form className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-slate-800" aria-label="Add family goal" onSubmit={e => {
      e.preventDefault(); setErr("");
      const p = rupeesToPaise(amt);
      if (!name.trim()) { setErr("Enter a goal name."); return; }
      if (typeof p === "string") { setErr(p); return; }
      onAdd(name, p, d || undefined); setName(""); setAmt(""); setD("");
    }}>
      <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Goal, e.g. Goa holiday" aria-label="Goal name" maxLength={120} />
      <input className={`${input} w-28`} value={amt} onChange={e => setAmt(e.target.value)} placeholder="₹ target" inputMode="decimal" aria-label="Goal target in rupees" />
      <input className={input} type="date" value={d} onChange={e => setD(e.target.value)} aria-label="Target date (optional)" />
      <button className={btn} disabled={busy}>{busy ? "Adding…" : "Add goal"}</button>
      {err && <p role="alert" className="w-full text-[11px] text-rose-600 font-semibold">{err}</p>}
    </form>);
};

const Contribute: React.FC<{ busy: boolean; onAdd: (p: number) => void }> = ({ busy, onAdd }) => {
  const [amt, setAmt] = useState(""); const [err, setErr] = useState("");
  return (
    <form className="flex gap-2 items-center" aria-label="Contribute to goal" onSubmit={e => {
      e.preventDefault(); setErr("");
      const p = rupeesToPaise(amt);
      if (typeof p === "string") { setErr(p); return; }
      onAdd(p); setAmt("");
    }}>
      <input className={`${input} w-24`} value={amt} onChange={e => setAmt(e.target.value)} placeholder="₹ amount" inputMode="decimal" aria-label="Contribution in rupees" />
      <button className={btn} disabled={busy}>{busy ? "Saving…" : "Contribute"}</button>
      {err && <span role="alert" className="text-[11px] text-rose-600 font-semibold">{err}</span>}
    </form>);
};

const MemberRow: React.FC<{ m: { member_id: string; user_id: string; name: string; role: FamilyRole }; isAdmin: boolean; isMe: boolean; busy: boolean;
  onRole: (r: FamilyRole) => void; onRemove: (self: boolean) => void }> = ({ m, isAdmin, isMe, busy, onRole, onRemove }) => (
  <div className="flex items-center justify-between gap-2 text-xs" data-testid="family-member">
    <div><strong>{m.name}{isMe ? " (you)" : ""}</strong><span className="block text-[10px] text-gray-400" title={ROLE_INFO[m.role]}>{ROLE_INFO[m.role].split(":")[0]}</span></div>
    <div className="flex items-center gap-2">
      {isAdmin && <select className={`${input} py-1`} value={m.role} disabled={busy} aria-label={`Role for ${m.name}`} onChange={e => onRole(e.target.value as FamilyRole)}>
        {(["admin", "adult", "child", "viewer"] as FamilyRole[]).map(r => <option key={r} value={r}>{r}</option>)}</select>}
      {(isAdmin || isMe) && <button className={`${link} text-rose-600`} disabled={busy} onClick={() => {
        if (window.confirm(isMe ? "Leave this family? Your shared entries become private again." : `Remove ${m.name}? Their shared entries become private again.`)) onRemove(isMe);
      }}>{isMe ? "Leave" : "Remove"}</button>}
    </div>
  </div>
);

const Invite: React.FC<{ familyName: string; onInvite: (r: FamilyRole) => Promise<{ token: string; expires_at: string }> }> = ({ familyName, onInvite }) => {
  const [role, setRole] = useState<FamilyRole>("adult");
  const [code, setCode] = useState<{ token: string; expires_at: string } | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <div className="pt-2 border-t border-gray-100 dark:border-slate-800 space-y-2">
      <div className="flex gap-2 items-center">
        <select className={input} value={role} onChange={e => setRole(e.target.value as FamilyRole)} aria-label="Role for the invited person">
          {(["adult", "child", "viewer", "admin"] as FamilyRole[]).map(r => <option key={r} value={r}>{r}</option>)}</select>
        <button className={btn} disabled={busy} onClick={async () => {
          setErr(""); setBusy(true);
          try { setCode(await onInvite(role)); } catch (e) { setErr(familyErrorMessage(e)); } finally { setBusy(false); }
        }}>{busy ? "Creating…" : "Create invite code"}</button>
      </div>
      <p className="text-[10px] text-gray-400">{ROLE_INFO[role]}</p>
      {code && <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 space-y-1" role="status">
        <p className="text-[10px] text-gray-500">One-time code for "{familyName}", expires {new Date(code.expires_at).toLocaleDateString("en-IN")}. No message is sent; share it yourself.</p>
        <code className="block text-[11px] font-mono break-all select-all" data-testid="family-invite-code">{code.token}</code>
      </div>}
      {err && <p role="alert" className="text-[11px] text-rose-600 font-semibold">{err}</p>}
    </div>);
};
