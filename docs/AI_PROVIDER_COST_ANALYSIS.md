# AI Provider Cost Analysis (Google Gemini)

Read from Google's official pages on **2026-11-07**: aistudio.google.com/docs/pricing, /docs/rate-limits, /docs/terms and /docs/available-regions (the ai.google.dev URLs redirect there).

## Findings
| Item | Fact |
|---|---|
| **Model name in our config** | `gemini-3.7-flash` **does not exist** on the current pricing page. The default is **now `gemini-3.1-flash-lite`** (fixed today in `lib/ai.ts` and the env templates) |
| gemini-3.1-flash-lite (paid) | $0.25 per 1M input tokens, $1.50 per 1M output tokens (page text) |
| gemini-3.5-flash-lite (paid) | $0.30 in / $2.50 out |
| gemini-3.8-flash (paid) | $0.75 in / $3.75 out until 31 Dec 2026, then $1.50 / $7.50 |
| Free tier | Exists for the Flash and Flash-Lite models. Per-model request limits are shown only inside AI Studio, not on the public page |
| **Data use on the free tier** | **Google may use prompts and responses to improve its products, and human reviewers may read them.** The terms say not to send sensitive or personal data on the free tier. The paid tier doesn't use prompts for training (they're kept for a limited time for abuse checks) |
| India | Listed as an available region |

## Decision
- **Investor demo (synthetic data):** the free tier is acceptable *if* a key is added. Today no key is configured, and the demo uses the built-in, rule-based answers, which the screen labels as such.
- **Beta and production with real users' financial data: paid tier only** (★ founder approval and billing). Real financial data must never go to the free tier.

## Cost per user (paid gemini-3.1-flash-lite)
Assume one question sends about 8,000 input tokens (the monthly summary plus 15 recent entries) and gets about 400 output tokens back.
- **Per question:** 8,000 × $0.25/1M + 400 × $1.50/1M = $0.0026 ≈ **₹0.22**.

| Usage | Questions/month | Cost/month |
|---|---|---|
| Light | 10 | ≈ ₹2.2 |
| Typical | 30 | ≈ ₹6.6 |
| Heavy (cap) | 100 | ≈ ₹22 |

| Users | Typical usage cost/month |
|---|---|
| 100 users | ≈ ₹660 |
| 1,000 users | ≈ ₹6,600 |

## Cost controls (most already built)
- Server-side key only. Timeouts (20 s server, 25 s client). Per-IP rate limits on AI routes. Input size limits (`LIMITS` in `lib/ai.ts`).
- Built-in answers handle common questions (spending by category or period, budgets, patterns, money terms) **without any AI call**. Route those first (to do), and call AI only for open questions.
- **To add before enabling paid AI:**
  - A per-user monthly question cap per plan (e.g. Free 0–10, Plus 100, Family 200), with the remaining count shown to the user.
  - A billing alert and spend cap in Google Cloud.
  - Usage logging of counts only (never prompt content).
