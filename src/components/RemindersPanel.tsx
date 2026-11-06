/**
 * Bill reminders (account mode): reminders the server delivered to this app, and the
 * user's reminder preferences. Reminders are created by the scheduled job on the server
 * (`python -m app.jobs.reminders`); email is opt-in and only works once a provider is set up.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { api } from "../api/client";

interface Prefs { bill_reminders: boolean; email_enabled: boolean; quiet_start: string | null; quiet_end: string | null;
  email_delivery_available: boolean }
interface Item { id: string; title: string; body: string; delivered_at: string; read: boolean }

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export const RemindersPanel: React.FC = () => {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [p, n] = await Promise.all([api<Prefs>("GET", "/api/v1/notifications/preferences"),
        api<Item[]>("GET", "/api/v1/notifications")]);
      setPrefs(p); setItems(n);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (changes: Partial<Prefs>) => {
    setBusy(true); setError(""); setSaved("");
    try {
      setPrefs(await api<Prefs>("PATCH", "/api/v1/notifications/preferences", changes));
      setSaved("Reminder settings saved");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!prefs) {
    return error
      ? <p role="alert" className="text-xs text-rose-600">{error} <button className="underline font-bold cursor-pointer" onClick={load}>Retry</button></p>
      : <p className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading reminders…</p>;
  }
  const unread = items.filter(i => !i.read).length;
  return (
    <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 space-y-3 text-xs"
      aria-label="Bill reminders" data-testid="reminders-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5">
          <Bell className="w-4 h-4" /> Reminders {unread > 0 && <span className="px-1.5 rounded-full bg-rose-100 text-rose-700">{unread}</span>}
        </h3>
        {unread > 0 && <button className="font-bold text-indigo-600 hover:underline cursor-pointer" onClick={async () => {
          await api("POST", "/api/v1/notifications/read-all"); load();
        }}>Mark all read</button>}
      </div>
      {items.length === 0
        ? <p className="text-gray-500">No reminders yet. You'll see bills that are due here.</p>
        : <ul className="space-y-1">{items.slice(0, 8).map(i => (
          <li key={i.id} className={i.read ? "text-gray-500" : "text-gray-900 dark:text-white font-semibold"}>
            {i.body} <span className="text-gray-400 font-normal">· {new Date(i.delivered_at).toLocaleDateString("en-IN")}</span></li>))}</ul>}
      <div className="pt-2 border-t border-gray-100 dark:border-slate-800 space-y-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={prefs.bill_reminders} disabled={busy}
            onChange={e => save({ bill_reminders: e.target.checked })} />
          Remind me about bills (uses each bill's "remind days before")
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span>Quiet hours</span>
          <input type="time" aria-label="Quiet hours start" value={hhmm(prefs.quiet_start)} disabled={busy}
            onChange={e => save({ quiet_start: e.target.value ? `${e.target.value}:00` : null })}
            className="px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800" />
          <span>to</span>
          <input type="time" aria-label="Quiet hours end" value={hhmm(prefs.quiet_end)} disabled={busy}
            onChange={e => save({ quiet_end: e.target.value ? `${e.target.value}:00` : null })}
            className="px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800" />
          <span className="text-gray-400">(your local time; reminders wait until quiet hours end)</span>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={prefs.email_enabled} disabled={busy}
            onChange={e => save({ email_enabled: e.target.checked })} />
          Also email me
        </label>
        {!prefs.email_delivery_available && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Email isn't available yet: no email provider is connected, so no emails are sent. In-app reminders work.
          </p>
        )}
        {saved && <p role="status" className="text-emerald-700 font-semibold">{saved}</p>}
        {error && <p role="alert" className="text-rose-600 font-semibold">{error}</p>}
      </div>
    </section>
  );
};
