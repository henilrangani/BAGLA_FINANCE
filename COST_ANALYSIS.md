# Cost Analysis

**Actual spend so far: ₹0.** No paid service has been enabled. Free-tier details change often; verify on each provider's pricing page before relying on them. The notes below are general characteristics, not quotes.

| Service | Purpose | Free option | Typical limits / risks | If the free tier ends | Alternative |
|---|---|---|---|---|---|
| GitHub (repo + Actions) | Code, CI | Free plan | Private-repo Actions minutes are capped per month; CI run ≈ 5 min | Pay per minute or self-host a runner | GitLab CI, local runs |
| Vercel | Frontend + Node AI routes | Hobby | Hobby is for personal, non-commercial use, so a paid plan is likely needed for a commercial launch | Pro plan | Cloudflare Pages (static) + backend host |
| Backend host | FastAPI container | Several hosts have free or low tiers | Cold starts, sleep on idle, limited RAM | Small paid instance | Any Docker host |
| PostgreSQL | Ledger | Managed free tiers exist | Storage caps, pausing, limited or no PITR backups: **not acceptable for paying users' financial records** | Paid tier with daily backups + PITR | Self-managed Postgres on a VM (needs ops time) |
| Google Gemini API | AI assistant | Free tier with rate limits | Free-tier data may be used to improve Google products (check current terms), quotas, model changes | Pay per token | AI is optional; deterministic fallbacks exist |
| Redis (future) | Shared rate limits | Small free tiers exist | Command or memory caps | Use Postgres-based limiting instead | Postgres |
| Email (future) | Verification, password reset, support | Some providers have free monthly quotas | Daily caps, domain setup | Paid tier | Postpone; in-app support works now |
| Payment gateway (future) | Bagla subscriptions | No monthly fee typical; per-transaction fee | Merchant KYC, settlement account | n/a | n/a |

## Cost controls already in code
- AI: per-IP rate limits, 20-second timeouts, minimized prompts, offline mode, deterministic fallbacks (`lib/`).
- Backend: no background workers yet; single container; SQLite-free production (Postgres only).
- CI: one workflow, about 5 minutes per push.

## Recommendation for the first ~200 users
Budget for a small paid Postgres with backups. That's the one place free tiers create real risk of data loss. Everything else can start on free tiers.

## Update 2026-11-06
- **Spend is still ₹0.** Added only free, open-source dev tools (`@playwright/test`, `@axe-core/playwright`).
- New running cost to plan: a scheduler for the reminder job, every ~15 min. Most hosts include cron or scheduled jobs, or it can run as a tiny worker beside the API.
- Email for invites and reminders needs a provider: free monthly quotas exist; domain setup required; founder decision.
- Rough closed-beta budget (≤ 50 users): a small paid managed PostgreSQL with backups, plus one small API instance and static hosting. **Verify current prices on each provider's page; no quotes are claimed here.**
