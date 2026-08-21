import React from "react";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  PieChart,
  FileText,
  Mic,
  Split,
  Lock,
  Compass,
  GraduationCap,
  Briefcase,
  Smartphone,
  CheckCircle2
} from "lucide-react";

interface LandingPageProps {
  onStart: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  return (
    <div className="min-h-screen bg-[#F2F4F7] dark:bg-slate-950 text-gray-900 dark:text-white transition-colors selection:bg-indigo-500 selection:text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wider shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Next-Gen Indian Fintech Platform</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-gray-950 dark:text-white leading-[1.1]">
              Know where your money goes.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-700">
                Automatically.
              </span>
            </h1>

            {/* Subtext */}
            <p className="text-lg sm:text-xl text-gray-600 dark:text-slate-300 font-medium max-w-2xl mx-auto leading-relaxed">
              Track personal, family, and group expenses in one simple, intelligent place. Every Rupee. Clearly Managed.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <button
                onClick={onStart}
                className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <span>Start Managing Money</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                onClick={onStart}
                className="w-full sm:w-auto px-7 py-4 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-800 font-bold text-base rounded-2xl shadow-xs transition-all cursor-pointer"
              >
                See Live Dashboard
              </button>
            </div>

            {/* Quick Micro-facts */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-6 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Record in &lt; 10 seconds
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                No UPI PIN / Banking password required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Offline-ready & Voice enabled
              </span>
            </div>
          </div>

          {/* Interactive Hero Preview Bento Box */}
          <div className="mt-14 max-w-5xl mx-auto rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs font-mono text-slate-400 ml-2">app.baglafinance.in/dashboard</span>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-indigo-950 text-indigo-400 font-bold border border-indigo-800">
                ₹ INR Default
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700/80">
                <span className="text-xs text-slate-400 block font-semibold">Today's Spend</span>
                <span className="text-3xl font-black text-white mt-1 block">₹1,240</span>
                <span className="text-xs text-emerald-400 font-semibold mt-2 block">✓ ₹760 safe budget left</span>
              </div>
              <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700/80">
                <span className="text-xs text-slate-400 block font-semibold">Goa Trip 5 Friends</span>
                <span className="text-3xl font-black text-indigo-400 mt-1 block">₹16,000</span>
                <span className="text-xs text-slate-300 font-semibold mt-2 block">Settlement: Dev receives ₹6,800</span>
              </div>
              <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700/80">
                <span className="text-xs text-slate-400 block font-semibold">Financial Health</span>
                <span className="text-3xl font-black text-emerald-400 mt-1 block">85 / 100</span>
                <span className="text-xs text-slate-300 font-semibold mt-2 block">Grade: Excellent savings rate</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillar Bento Grid */}
      <section className="py-20 bg-white dark:bg-slate-900 border-y border-gray-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
              Built for Real Indian Financial Lives
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-2 font-medium">
              Whether you are splitting a shack dinner in Goa, managing family groceries, or tracking your first job salary.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-3xl bg-[#F2F4F7] dark:bg-slate-800/50 border border-gray-200/80 dark:border-slate-700/60 space-y-3.5 shadow-xs">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-100 dark:border-indigo-900/40">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fast 10-Second Expense Entry</h3>
              <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed font-medium">
                Type naturally like “₹120 auto to college” or speak directly. Our Gemini parser extracts amount, category, and payee instantly.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-3xl bg-[#F2F4F7] dark:bg-slate-800/50 border border-gray-200/80 dark:border-slate-700/60 space-y-3.5 shadow-xs">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-100 dark:border-indigo-900/40">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">AI Receipt & Bill OCR</h3>
              <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed font-medium">
                Take a photo of any restaurant bill, grocery invoice, or fuel receipt. Bagla Finance extracts GST, line items, and itemized splits.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-3xl bg-[#F2F4F7] dark:bg-slate-800/50 border border-gray-200/80 dark:border-slate-700/60 space-y-3.5 shadow-xs">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-100 dark:border-indigo-900/40">
                <Split className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Smart Group & Trip Splitting</h3>
              <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed font-medium">
                Equal, percentage, exact, or item-by-item splitting. Our graph algorithm optimizes debts into minimal direct payments.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-3xl bg-[#F2F4F7] dark:bg-slate-800/50 border border-gray-200/80 dark:border-slate-700/60 space-y-3.5 shadow-xs">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-100 dark:border-indigo-900/40">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Family Space with Privacy</h3>
              <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed font-medium">
                Share household utility bills, rent, and groceries while keeping personal transactions strictly private.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-3xl bg-[#F2F4F7] dark:bg-slate-800/50 border border-gray-200/80 dark:border-slate-700/60 space-y-3.5 shadow-xs">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-100 dark:border-indigo-900/40">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Cash Wallet & Offline Sync</h3>
              <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed font-medium">
                Full offline support for tea stalls, auto rickshaws, and cash markets. Reconcile physical cash seamlessly.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-3xl bg-[#F2F4F7] dark:bg-slate-800/50 border border-gray-200/80 dark:border-slate-700/60 space-y-3.5 shadow-xs">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-100 dark:border-indigo-900/40">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Privacy by Architecture</h3>
              <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed font-medium">
                Consent-based FinancialDataConnector abstraction. Zero access to banking passwords, UPI PINs, or OTPs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-20 text-center max-w-4xl mx-auto px-4">
        <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mb-3">
          Ready to manage every rupee with confidence?
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-8 font-medium">
          No credit card required. Experience universal expense management now.
        </p>
        <button
          onClick={onStart}
          className="px-9 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-indigo-600/25 transition-all cursor-pointer active:scale-95"
        >
          Launch Bagla Finance Dashboard
        </button>
      </section>
    </div>
  );
};
