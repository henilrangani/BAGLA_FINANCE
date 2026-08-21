import React from "react";

interface BaglaLogoProps {
  variant?: "full" | "horizontal" | "compact" | "mark" | "circle" | "app_icon";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  className?: string;
  theme?: "light" | "dark" | "auto";
  showTagline?: boolean;
}

/**
 * Official BAGLA FINANCE Logo Component
 * Faithfully matches the official brand identity from Image 1:
 * - Stylized "B" with integrated Indian Rupee (₹) symbol on left stem
 * - Upward rising bar chart columns inside lower cavity
 * - Upward green growth arrow swoosh along bottom edge
 * - Deep navy (#0B2240) to emerald/teal (#00A86B / #10B981) gradient
 * - "BAGLA" in bold uppercase + "— FINANCE —" with flanking green accent lines
 * - Tagline: "Every Rupee. Clearly Managed."
 */
export const BaglaLogo: React.FC<BaglaLogoProps> = ({
  variant = "horizontal",
  size = "md",
  className = "",
  theme = "auto",
  showTagline = true
}) => {
  // Dimensions mapping
  const sizeConfig = {
    xs: { markSize: 24, fontSize: "text-sm", subSize: "text-[9px]", gap: "gap-1.5" },
    sm: { markSize: 32, fontSize: "text-base", subSize: "text-[10px]", gap: "gap-2" },
    md: { markSize: 40, fontSize: "text-lg", subSize: "text-xs", gap: "gap-2.5" },
    lg: { markSize: 48, fontSize: "text-xl", subSize: "text-xs", gap: "gap-3" },
    xl: { markSize: 64, fontSize: "text-2xl", subSize: "text-sm", gap: "gap-3.5" },
    hero: { markSize: 84, fontSize: "text-4xl", subSize: "text-base", gap: "gap-4" }
  }[size];

  // SVG Unique Gradient IDs
  const gradId = `bagla-brand-grad-${Math.random().toString(36).substr(2, 9)}`;
  const arrowGradId = `bagla-arrow-grad-${Math.random().toString(36).substr(2, 9)}`;

  // The official stylized B + ₹ + Bar Chart + Arrow Brand Mark
  const LogoMarkSvg = (
    <svg
      viewBox="0 0 100 100"
      width={sizeConfig.markSize}
      height={sizeConfig.markSize}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform"
      aria-label="Bagla Finance Logo Mark"
    >
      <defs>
        {/* Navy to Emerald Gradient for the B structure */}
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="80%">
          <stop offset="0%" stopColor="#0B2240" />
          <stop offset="45%" stopColor="#0D3B66" />
          <stop offset="75%" stopColor="#00A86B" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>

        {/* Vibrant Emerald Gradient for Arrow & Bars */}
        <linearGradient id={arrowGradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>

      {/* Top horizontal stroke of B & ₹ top bar */}
      <path
        d="M 18 16 L 68 16 C 82 16 86 28 78 38 C 72 45 62 48 54 48 L 38 48"
        stroke={`url(#${gradId})`}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ₹ Rupee upper horizontal crossbar */}
      <path
        d="M 18 28 L 52 28"
        stroke={`url(#${gradId})`}
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* ₹ Rupee vertical stem and curved leg */}
      <path
        d="M 28 16 L 28 50 C 28 62 38 72 50 72 L 54 72"
        stroke="#0B2240"
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* ₹ Rupee downward diagonal slant stroke */}
      <path
        d="M 30 46 L 46 76"
        stroke="#0B2240"
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* Upper B Loop Top Cap */}
      <path
        d="M 52 16 C 75 16 86 28 78 40 C 72 49 60 50 48 50"
        stroke={`url(#${gradId})`}
        strokeWidth="8.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Lower B Loop sweeping to the right & down */}
      <path
        d="M 48 48 C 68 48 88 56 82 72 C 77 84 62 86 44 86"
        stroke={`url(#${gradId})`}
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Inside Bar Chart: 3 rising bars representing growth */}
      {/* Bar 1 (Short) */}
      <rect
        x="54"
        y="66"
        width="6"
        height="14"
        rx="2"
        fill={`url(#${arrowGradId})`}
      />
      {/* Bar 2 (Medium) */}
      <rect
        x="63"
        y="58"
        width="6.5"
        height="22"
        rx="2"
        fill={`url(#${arrowGradId})`}
      />
      {/* Bar 3 (Tall) */}
      <rect
        x="72"
        y="50"
        width="7"
        height="30"
        rx="2"
        fill={`url(#${arrowGradId})`}
      />

      {/* Growth Arrow swooshing along the bottom curve */}
      <path
        d="M 42 86 C 58 87 74 84 84 72 L 87 66"
        stroke={`url(#${arrowGradId})`}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Arrow Head */}
      <polygon
        points="83,59 93,68 83,72 85,67"
        fill="#10B981"
      />
    </svg>
  );

  // App Icon Squircle Version
  if (variant === "app_icon") {
    return (
      <div
        className={`relative inline-flex items-center justify-center p-3 rounded-2xl sm:rounded-3xl bg-white shadow-xl border border-gray-100 dark:border-slate-800 ${className}`}
      >
        {LogoMarkSvg}
      </div>
    );
  }

  // Circular Seal Badge (as shown in Image 1 bottom right)
  if (variant === "circle") {
    return (
      <div
        className={`relative inline-flex items-center justify-center rounded-full bg-[#0B2240] p-3.5 border-2 border-[#10B981] shadow-2xl text-white select-none ${className}`}
        style={{ width: sizeConfig.markSize * 2.2, height: sizeConfig.markSize * 2.2 }}
      >
        <div className="absolute inset-1 rounded-full border border-emerald-500/40 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full animate-spin-slow" viewBox="0 0 100 100">
            <path
              id="circlePath"
              d="M 50, 50 m -37, 0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0"
              fill="none"
            />
            <text className="text-[7.5px] font-black uppercase tracking-[0.22em] fill-emerald-400">
              <textPath xlinkHref="#circlePath" startOffset="0%">
                BAGLA FINANCE • EVERY RUPEE. CLEARLY MANAGED. •
              </textPath>
            </text>
          </svg>
          <div className="scale-75">{LogoMarkSvg}</div>
        </div>
      </div>
    );
  }

  // Just the brand mark
  if (variant === "mark") {
    return <div className={`inline-flex items-center justify-center ${className}`}>{LogoMarkSvg}</div>;
  }

  // Text Styling based on theme
  const isDark = theme === "dark";
  const baglaColor =
    theme === "dark"
      ? "text-white"
      : theme === "light"
      ? "text-[#0B2240]"
      : "text-[#0B2240] dark:text-white";

  const financeColor = "text-[#00A86B] dark:text-[#10B981]";
  const taglineColor =
    theme === "dark"
      ? "text-slate-400"
      : theme === "light"
      ? "text-slate-600"
      : "text-slate-500 dark:text-slate-400";

  // Vertical/Full Stacked Logo (Image 1 main display)
  if (variant === "full") {
    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        <div className="mb-2 transition-transform hover:scale-105">{LogoMarkSvg}</div>
        <div className="flex flex-col items-center">
          <span className={`font-black tracking-tight leading-none ${sizeConfig.fontSize} ${baglaColor}`}>
            BAGLA
          </span>
          <div className="flex items-center justify-center gap-2 mt-1 w-full">
            <div className="h-[1.5px] flex-1 bg-[#00A86B] dark:bg-[#10B981] opacity-70" />
            <span
              className={`font-black tracking-[0.25em] uppercase ${sizeConfig.subSize} ${financeColor}`}
            >
              FINANCE
            </span>
            <div className="h-[1.5px] flex-1 bg-[#00A86B] dark:bg-[#10B981] opacity-70" />
          </div>
          {showTagline && (
            <span
              className={`font-medium tracking-wide mt-1.5 text-[11px] sm:text-xs ${taglineColor}`}
            >
              Every Rupee. Clearly Managed.
            </span>
          )}
        </div>
      </div>
    );
  }

  // Compact Horizontal Logo (Ideal for Sidebar, Header, Mobile)
  return (
    <div className={`flex items-center ${sizeConfig.gap} select-none ${className}`}>
      <div className="transition-transform hover:scale-105 shrink-0">{LogoMarkSvg}</div>
      <div className="flex flex-col justify-center text-left">
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className={`font-black tracking-tight ${sizeConfig.fontSize} ${baglaColor}`}>
            BAGLA
          </span>
          <span className={`font-bold tracking-wider uppercase ${sizeConfig.subSize} ${financeColor}`}>
            FINANCE
          </span>
        </div>
        {showTagline && (
          <span
            className={`font-medium tracking-tight text-[10px] sm:text-[11px] mt-0.5 leading-none ${taglineColor}`}
          >
            Every Rupee. Clearly Managed.
          </span>
        )}
      </div>
    </div>
  );
};
