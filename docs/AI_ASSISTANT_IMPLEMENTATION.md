# AI Assistant: Implementation

## Modes
| Mode | When | Where answers come from | Labelled as |
|---|---|---|---|
| **Built-in rules** | No provider key on the server, offline, or offline mode on | `src/utils/insights.ts`, on the device, from recorded entries | "From your records (no AI)", plus the period and entry count |
| **AI** | `GET /api/ai/status` reports `configured: true` | `lib/ai.ts handleChat` → Google Gemini (`GEMINI_MODEL`, default `gemini-3.7-flash`, **unverified**) | "AI answer", plus what it was based on and that it can be wrong |

If the provider fails (an error, a timeout, or `aiAvailable: false`), the question is answered with built-in rules, and the answer says so.

## What the built-in rules answer
- Spending by category and period: this/last month, last N days, today/yesterday, this/last week, this/last year, and named months.
- Top categories with percentages.
- Budget differences: over or under each budget.
- Patterns: busiest weekday, weekend share, repeat merchants.
- Ways to spend less: the top discretionary categories with a 10% saving, labelled not advice.
- Income vs spending, and the amount kept.
- Plain-language money terms: EMI, SIP, credit score/CIBIL, compound interest, inflation, emergency fund, net worth, FD, mutual fund, UPI, GST, savings rate, interest.

Anything else gets "I can only answer a few kinds of questions…" with examples. No numbers are ever invented.

## Safety
- **No writes:** the server keeps only navigation suggestions (`open_add_expense`, `open_budgets`, `view_group`, `filter_category`). The UI only opens a screen; nothing is written to the ledger.
- **Keys:** server-side only (`GEMINI_API_KEY`). `/api/ai/status` returns `{configured, provider, model}`, never the key.
- **Limits:** a 20 s server timeout and a 25 s client timeout, with a Stop button; 429 handling; input size limits (`LIMITS` in `lib/ai.ts`).
- **Data sent to the provider (only when configured):**
  - This month's totals and category breakdown.
  - Budgets, goals and active bills.
  - Group names with totals.
  - The 15 most recent entries (date, type, amount, merchant, category).
  - No IDs, emails or passwords, and no family members' data.
- **Logging:** only error messages are logged, never prompts or financial data.
- **Prompt rules:** advisory only; answers only from the supplied data; no regulated advice; say when the data is incomplete.

## Tests
- `src/utils/insights.test.ts` (9).
- `lib/server.test.ts`:
  - status endpoint, without and with a mock client
  - not-configured reply
  - provider path keeps only navigation actions
  - provider error falls back
- `e2e/ai-assistant.spec.ts`:
  - The real "not set up" state, with exact totals.
  - A mocked provider: label, Stop, HTTP 500 then Retry, navigation-only suggestion.

## Not verified / needs approval (★)
- A live Gemini call, the model name, pricing, a spend cap, and a prompt-injection red-team with real data.
- Enabling it: set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) on the server, then run the AI tests against a staging deployment.
