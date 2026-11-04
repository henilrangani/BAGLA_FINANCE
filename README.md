# 💰 Bagla Finance

> **Every Rupee. Clearly Managed.**

Bagla Finance is a personal and group expense-tracking app built for Indian users. It offers fast cash logging, receipt scanning, AI-assisted entry, budgets, and WhatsApp-friendly bill splitting.

> **Current status: early prototype.** Data is stored only in your browser (unencrypted, single device). No bank, UPI app or Account Aggregator is connected. See `BUILD_STATUS.md` and `KNOWN_LIMITATIONS.md`.

---

## 🌟 Key Features

- **⚡ Payment Sync Demo**: Simulated payment notifications show how automatic tracking could work. No real bank or UPI integration yet.
- **💵 1-Tap Physical Cash Ledger**: Log Chai (₹20), Auto (₹60), Sabzi (₹180), Milk (₹75), and Food in under 3 seconds with auto-reconciling physical wallet balances.
- **🌙 10:00 PM Nightly Cash Habit Routine**: Automated nightly reminder modal with native browser notification permissions to record unlogged cash spends.
- **👥 Zero-App WhatsApp Bill Splitting**: Instant group expense settlement calculations with formatted WhatsApp export messages and direct settlement deep-links.
- **📊 Analytics, Budgets & Financial Goals**: Visual cash flow charts, category budget progress bars, recurring subscription management, and savings goal trackers.
- **🤖 Bagla AI Assistant & Receipt Scanner**: Instant conversational financial insights, smart query parsing, and receipt text extraction.
- **🛡️ Privacy Controls & Stealth Mode**: Offline mode (the app makes no AI or API requests), a PIN privacy screen (the PIN is stored as a salted hash), a balance mask, and one-click deletion of local data.
- **📱 Progressive Web App (PWA)**: Full standalone home-screen app experience on Android and iOS without app store fees.

---

## 🛠️ Technology Stack & Architecture

- **Frontend Framework**: React 19 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS v4
- **Animations & Transitions**: Motion (`motion/react`)
- **Icons**: Lucide React (`lucide-react`)
- **Visualizations & Charts**: Recharts & Canvas-Confetti
- **Serverless API Architecture (Vercel)**: Dedicated serverless function endpoints in `/api` with `@google/genai` lazy-loading
- **Local Dev Server**: Express (Node.js) + Vite middleware
- **Data Persistence**: Local Storage & IndexedDB (Client-First Privacy Architecture)

---

## 📁 Project Structure

```text
bagla-finance/
├── api/                    # Vercel Serverless Functions
│   ├── ai/
│   │   ├── parse-expense.ts # Natural language & voice expense parser
│   │   ├── scan-receipt.ts  # Multimodal receipt & bill OCR parser
│   │   ├── chat.ts          # Grounded Bagla AI financial assistant
│   │   ├── daily-summary.ts # Daily summary insight text
│   │   └── anomalies.ts     # Spending anomaly & bill shock detector
│   └── webhooks/
│       └── payment-sync.ts  # Live payment sync webhook receiver
├── public/                 # Static public assets (icons, manifest, robots, sitemap)
│   ├── icon.svg            # High-resolution vector PWA app icon
│   ├── manifest.json       # Progressive Web App configuration manifest
│   ├── robots.txt          # Search engine crawler instructions
│   └── sitemap.xml         # XML sitemap for SEO discovery
├── src/
│   ├── components/         # Reusable UI components & modals
│   │   ├── BaglaAiChat.tsx
│   │   ├── BaglaLogo.tsx
│   │   ├── FastAddExpenseModal.tsx
│   │   ├── LivePaymentSyncBanner.tsx
│   │   ├── NightlyCashReminderModal.tsx
│   │   ├── ReceiptScannerModal.tsx
│   │   ├── VoiceExpenseModal.tsx
│   │   └── ...
│   ├── context/            # Global state context
│   │   └── FinanceContext.tsx
│   ├── services/           # Data services & initial state fixtures
│   │   └── data.ts
│   ├── views/              # Main application views & dashboard tabs
│   │   ├── DashboardView.tsx
│   │   ├── TransactionsView.tsx
│   │   ├── AnalyticsView.tsx
│   │   ├── BudgetsGoalsView.tsx
│   │   ├── GroupsView.tsx
│   │   ├── FamilyView.tsx
│   │   ├── SubscriptionsView.tsx
│   │   ├── CashWalletView.tsx
│   │   └── PrivacyCenterView.tsx
│   ├── App.tsx             # Root application orchestrator
│   ├── index.css           # Global Tailwind CSS stylesheet
│   ├── main.tsx            # Vite React DOM entrypoint
│   └── types.ts            # TypeScript interfaces & type definitions
├── index.html              # HTML document template with SEO & OpenGraph tags
├── package.json            # NPM project manifest & scripts
├── tsconfig.json           # TypeScript configuration
├── vercel.json             # Vercel SPA routing & API serverless configuration
├── vite.config.ts          # Vite build pipeline configuration
├── server.ts               # Local Express development server
├── .env.example            # Environment variable template
└── README.md               # Project documentation
```

---

## 💻 Local Installation & Development

### 1. Prerequisites
- Node.js 18.x or 20.x installed
- NPM, Yarn, PNPM, or Bun

### 2. Clone & Install
```bash
# Clone repository
git clone https://github.com/your-username/bagla-finance.git
cd bagla-finance

# Install dependencies
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🏗️ Production Build

To test and create the production-ready static assets:

```bash
npm run build
```
This outputs compiled, optimized assets to the `dist/` directory.

---

## 🔑 Environment Variables

Inspect `.env.example` for all configurable environment variables:

| Variable | Description | Required? |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API key (server-only). | Optional: AI routes fall back to rule-based logic |
| `GEMINI_MODEL` | Gemini model name; verify availability and pricing. | Optional |
| `WEBHOOK_SECRET` | HMAC secret for `/api/webhooks/payment-sync`. The endpoint is disabled without it. | Optional |
| `ALLOWED_ORIGINS` | Extra browser origins allowed to call `/api`. | Optional |
| `HOST`, `PORT`, `TRUST_PROXY` | Local server binding and proxy trust. | Optional |

## ✅ Tests

```bash
npm run lint   # TypeScript
npm test       # unit tests (money, ledger, CSV, PIN, settlements, server security)
npm run build
```

> ⚠️ **IMPORTANT SECURITY NOTE**: Never commit `.env` or real API keys/credentials to public GitHub repositories.

---

## 🚀 Deploying to Vercel (Step-by-Step)

### 1. Push to GitHub
Upload or push your complete source code to a GitHub repository named `bagla-finance`.

### 2. Import into Vercel
1. Log in to [Vercel](https://vercel.com) with your GitHub account.
2. Click **"Add New..."** → **"Project"**.
3. Locate `bagla-finance` and click **"Import"**.

### 3. Configure Project Settings
- **Framework Preset**: `Vite` *(Auto-detected)*
- **Root Directory**: `./`
- **Build Command**: `vite build`
- **Output Directory**: `dist`
- **Environment Variables**: Add `GEMINI_API_KEY` if you want live server-side Gemini AI features (optional).

### 4. Deploy
Click **"Deploy"**. Vercel will build the frontend into `dist/` and automatically provision all `/api/*` routes as Serverless Functions.

---

## 🔒 Security & Privacy

- **No banking credentials**: the app never asks for or stores UPI PINs, card CVVs, OTPs or netbanking passwords.
- **Local storage, not encrypted**: records live in your browser's `localStorage`. Anyone with access to the browser profile can read them. The PIN lock is a privacy screen, not encryption.
- **AI data use**: in online mode, the text, receipt image or spending summary you submit is sent to our server and to Google Gemini for processing. Offline mode stops all such requests.
- **Server protections**: input validation, size limits, rate limits, same-origin checks, security headers and a signed webhook (see `CHANGELOG.md`).
- **Compliance**: no legal or regulatory review has been done yet. The app makes no compliance claims.

---

## 📄 License
MIT License. Free to use, adapt, and deploy.
