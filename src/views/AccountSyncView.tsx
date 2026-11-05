import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, CloudUpload, Loader2, LogOut, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useFinance } from "../context/FinanceContext";
import { ApiError, auth } from "../api/client";
import { activeProfile, setActiveProfile } from "../api/profile";
import { migrateLocalData, type MigrationReport } from "../api/sync";
import { deviceTimeZone } from "../utils/dates";
import { formatINR } from "../utils/money";

const card = "p-6 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-xs";
const input = "w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500";
const primary = "px-5 py-3 rounded-2xl bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer";

function SignInForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = mode === "login"
        ? await auth.login(email.trim(), password)
        : await auth.register(email.trim(), password, name.trim() || "Bagla user", deviceTimeZone());
      setActiveProfile({ kind: "cloud", userId: s.user_id });
      window.location.reload(); // re-initialise every store for the account profile
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${card} space-y-4 max-w-md`} aria-labelledby="signin-title">
      <h2 id="signin-title" className="text-lg font-black text-gray-950 dark:text-white">
        {mode === "login" ? "Sign in to your Bagla account" : "Create your Bagla account"}
      </h2>
      <p className="text-xs text-gray-500 dark:text-slate-400">
        An account keeps your records on our server so they survive a lost phone or cleared browser. Your current
        on-device data stays exactly as it is.
      </p>
      {mode === "register" && (
        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">Your name
          <input className={`${input} mt-1`} value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={160} />
        </label>
      )}
      <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">Email
        <input className={`${input} mt-1`} type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="block text-xs font-bold text-gray-700 dark:text-slate-300">Password
        <input className={`${input} mt-1`} type="password" required minLength={mode === "register" ? 12 : 1} maxLength={128}
          value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {mode === "register" && <span className="text-[11px] font-medium text-gray-400">At least 12 characters. A short sentence works well.</span>}
      </label>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className={`${primary} w-full`}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
      <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
        className="w-full text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
        {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}

function MigrationPanel() {
  const { syncNow } = useFinance();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await migrateLocalData(activeProfile(), (d, t) => setProgress([d, t]));
      setReport(r);
      syncNow(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${card} space-y-3`}>
      <h3 className="font-bold text-gray-950 dark:text-white flex items-center gap-2"><CloudUpload className="w-5 h-5 text-emerald-600" /> Move my on-device data to this account</h3>
      <p className="text-xs text-gray-500 dark:text-slate-400">
        Copies income and expense entries, budgets and goals from this browser into your account. The on-device copy is
        <strong> not deleted</strong>. Running it again never creates duplicates.
      </p>
      <button onClick={run} disabled={busy} className={primary}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {busy && progress ? `Copying ${progress[0]} of ${progress[1]}…` : "Copy my data now"}
      </button>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
      {report && (
        <div className="text-xs space-y-1 text-gray-700 dark:text-slate-300" role="status">
          <p className="font-bold flex items-center gap-1">
            {report.totals.match ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
            {report.totals.match ? "Totals match exactly." : "Check the details below."}
          </p>
          <p>Entries: {report.transactions.created} copied, {report.transactions.alreadyThere} already in your account,
            {" "}{report.transactions.skipped.length} not supported yet.</p>
          <p>Budgets: {report.budgets.created} copied, {report.budgets.alreadyThere} already there · Goals: {report.goals.created} copied, {report.goals.alreadyThere} already there.</p>
          {report.groups && report.bills && (
            <p>Groups: {report.groups.created} copied, {report.groups.alreadyThere} already there · Recurring bills: {report.bills.created} copied, {report.bills.alreadyThere} already there.</p>
          )}
          <p>Income {formatINR(report.totals.localIncomePaise / 100)} on device vs {formatINR(report.totals.serverIncomePaise / 100)} in account ·
            Expenses {formatINR(report.totals.localExpensePaise / 100)} vs {formatINR(report.totals.serverExpensePaise / 100)}.</p>
          {report.errors.length > 0 && (
            <ul className="list-disc ml-5 text-rose-600">{report.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}

export const AccountSyncView: React.FC = () => {
  const { cloud, syncNow } = useFinance();
  const [leaving, setLeaving] = useState(false);

  const signOut = async () => {
    setLeaving(true);
    await auth.logout();
    setActiveProfile({ kind: "local" });
    window.location.reload();
  };

  const useLocal = () => {
    setActiveProfile({ kind: "local" });
    window.location.reload();
  };

  if (!cloud.enabled || cloud.state === "signed_out") {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-black text-gray-950 dark:text-white">Account & Sync</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {cloud.state === "signed_out" ? "Your session ended. Sign in again to keep syncing." : "You're using Bagla on this device only."}
          </p>
        </header>
        <SignInForm />
        {cloud.state === "signed_out" && (
          <button onClick={useLocal} className="text-xs font-bold text-gray-600 hover:underline cursor-pointer">Go back to on-device data</button>
        )}
      </div>
    );
  }

  const label = {
    idle: "All changes saved to your account", syncing: "Syncing…", offline: "Offline: changes are kept and will sync later",
    error: "Some changes couldn't sync", local: "", signed_out: "",
  }[cloud.state];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-gray-950 dark:text-white">Account & Sync</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1"><UserRound className="w-4 h-4" /> Signed in as {cloud.email}</p>
      </header>
      <div className={`${card} flex flex-col sm:flex-row sm:items-center justify-between gap-4`} role="status" aria-live="polite">
        <div className="text-sm">
          <p className={`font-bold ${cloud.state === "error" ? "text-rose-600" : cloud.state === "offline" ? "text-amber-600" : "text-emerald-700 dark:text-emerald-400"}`}>{label}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {cloud.pending > 0 ? `${cloud.pending} change(s) waiting to sync. ` : ""}
            {cloud.lastSyncedAt ? `Last synced ${new Date(cloud.lastSyncedAt).toLocaleString("en-IN")}.` : ""}
          </p>
          {cloud.message && <p className="text-xs text-rose-600 mt-1">{cloud.message}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => syncNow(true)} disabled={cloud.state === "syncing"} className={primary}>
            <RefreshCw className={`w-4 h-4 ${cloud.state === "syncing" ? "animate-spin" : ""}`} /> Sync now
          </button>
          <button onClick={signOut} disabled={leaving} className="px-5 py-3 rounded-2xl border border-gray-300 dark:border-slate-700 text-sm font-bold text-gray-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
      <MigrationPanel />
      <p className="text-[11px] text-gray-400 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />
        Group splits, recurring bills and the family space shown on other screens are still stored on this device only.</p>
    </div>
  );
};
