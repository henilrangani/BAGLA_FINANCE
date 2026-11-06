import React from "react";
import { BaglaLogo } from "./BaglaLogo";
import {
  FileText,
  ScanLine,
  Users,
  CheckCircle2,
  Sparkles,
  Lock
} from "lucide-react";

/**
 * Official Bagla Finance Footer Brand Banner
 * Faithfully matches the bottom banner in Image 2:
 * Logo + Bagla Finance + Every Rupee. Clearly Managed. + 6 feature badges
 */
export const FooterBrandBanner: React.FC = () => {
  const features = [
    { label: "Track Expenses", icon: FileText },
    { label: "Scan Receipts", icon: ScanLine },
    { label: "Group Expenses", icon: Users },
    { label: "Smart Budgets", icon: CheckCircle2 },
    { label: "AI Insights", icon: Sparkles },
    { label: "Secure & Private", icon: Lock }
  ];

  return (
    <div className="mt-12 pt-8 pb-12 border-t border-gray-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 rounded-3xl p-6 sm:p-8 backdrop-blur-sm">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
        {/* Brand Left */}
        <div className="flex items-center gap-3">
          <BaglaLogo variant="horizontal" size="lg" showTagline={true} />
        </div>

        {/* Feature Icons Grid (matching Image 2) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6 w-full lg:w-auto">
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-slate-300"
              >
                <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-700 dark:text-slate-300 shrink-0">
                  <Icon className="w-4 h-4 text-[#047857] dark:text-emerald-400" />
                </div>
                <span className="whitespace-nowrap">{f.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
