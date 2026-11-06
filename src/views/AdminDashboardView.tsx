import React, { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { API_BASE } from "../api/client";
import { useFinance } from "../context/FinanceContext";

interface Check { name: string; ok: boolean | null; detail: string; ms?: number }

/**
 * System status: real checks only. Calls the API's public health endpoints from this browser and
 * shows what came back. Nothing here is simulated; features that aren't connected say so.
 */
export const AdminDashboardView: React.FC = () => {
  const { cloud } = useFinance();
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    const probe = async (name: string, path: string, describe: (body: any, status: number) => [boolean, string]) => {
      const t = performance.now();
      try {
        const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
        const body = await r.json().catch(() => null);
        const [ok, detail] = describe(body, r.status);
        return { name, ok, detail, ms: Math.round(performance.now() - t) };
      } catch {
        return { name, ok: false, detail: "Can't reach the server from this device" };
      }
    };
    const results = await Promise.all([
      probe("API server", "/health", (b, s) => [s === 200 && b?.status === "ok", s === 200 ? "Responding" : `HTTP ${s}`]),
      probe("Bill reminder job", "/health/jobs", (b, s) => {
        const r = b?.reminders;
        if (!r?.last_success_at) return [false, "Has not run successfully yet (needs a scheduler on the host)"];
        const mins = Math.round((r.age_seconds ?? 0) / 60);
        return [s === 200, `Last successful run ${mins} min ago`];
      }),
    ]);
    setChecks(results);
    setBusy(false);
  }, []);
  useEffect(() => { run(); }, [run]);

  const fixed: Check[] = [
    { name: "Email delivery", ok: null, detail: "Not connected (no provider). Reminders are in-app only." },
    { name: "Bank / UPI / card sync", ok: null, detail: "Not connected. The \"Payment sync\" screen is a simulated demo." },
    { name: "Payments for Bagla plans", ok: null, detail: "No payment gateway is connected; paid plans aren't offered." },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">System status</span>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Bagla server checks</h1>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Measured just now from this device. {cloud.enabled ? "" : "You're using device-only mode; the app works without the server."}
          </p>
        </div>
        <button onClick={run} disabled={busy} aria-label="Run checks again"
          className="p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 cursor-pointer disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      <ul className="space-y-2" aria-label="Status checks">
        {[...checks, ...fixed].map(c => (
          <li key={c.name} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              {c.ok === true ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                : c.ok === false ? <XCircle className="w-4 h-4 text-rose-600" /> : <Activity className="w-4 h-4 text-gray-400" />}
              {c.name}
            </span>
            <span className="text-xs text-gray-600 dark:text-slate-300 text-right">
              {c.detail}{c.ms !== undefined ? ` · ${c.ms} ms` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
