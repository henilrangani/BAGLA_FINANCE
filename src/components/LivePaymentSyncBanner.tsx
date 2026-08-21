import React from "react";
import { useFinance } from "../context/FinanceContext";
import { Zap, CheckCircle2, X, ArrowUpRight, Smartphone } from "lucide-react";

export const LivePaymentSyncBanner: React.FC = () => {
  const { liveSyncNotification, dismissLiveSyncNotification, setIsLiveSyncModalOpen } = useFinance();

  if (!liveSyncNotification) return null;

  return (
    <div className="fixed top-20 right-4 z-50 max-w-md w-full animate-bounce-short">
      <div className="p-4 rounded-2xl bg-slate-950/95 text-white border border-emerald-500/40 shadow-2xl shadow-emerald-950/50 backdrop-blur-md flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <Zap className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-800">
                ⚡ Auto-Recorded via {liveSyncNotification.provider}
              </span>
            </div>
            <h4 className="text-sm font-black text-white">
              ₹{liveSyncNotification.amount.toLocaleString("en-IN")} to {liveSyncNotification.merchant}
            </h4>
            <p className="text-[11px] text-slate-400 font-medium">
              Categorized under <span className="text-slate-200 font-semibold">{liveSyncNotification.category}</span> &bull; 0 typing required.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              dismissLiveSyncNotification();
              setIsLiveSyncModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Open Live Sync Hub"
          >
            <ArrowUpRight className="w-4 h-4" />
          </button>
          <button
            onClick={dismissLiveSyncNotification}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
