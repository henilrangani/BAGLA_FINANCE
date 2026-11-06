# Hosting and Managed PostgreSQL Options (closed beta)

_Researched 2026-11-06. **Nothing was purchased or created.** Prices come mostly from secondary sources and change often: confirm each on the provider's own pricing page before approving. "Unverified" means only a third-party source was found._

## Requirements
1. React/Vite static app **and** FastAPI on one origin (`/api/v1` routed to the API), HTTPS. Required by the cookie/CSP design.
2. Managed PostgreSQL 16 with automated daily backups, point-in-time recovery (PITR), encryption at rest, and private networking.
3. A scheduled job every 15 min (`python -m app.jobs.reminders`).
4. Secret environment variables, health checks, logs.
5. India region preferred (latency, user trust, DPDP posture). Data residency isn't currently mandated for this product; ask counsel.

## Comparison
| Option | Region | Same-origin `/api/v1` | PostgreSQL backups / PITR | Scheduler | Indicative cost (verify) | Notes |
|---|---|---|---|---|---|---|
| **A. DigitalOcean App Platform + Managed PostgreSQL** | **Bangalore (BLR1)** | ✅ native: one app, static component at `/`, API component at `/api/v1` (no proxy) | Daily backups + 7-day PITR reported as included | ✅ App Platform scheduled jobs | DB "from $15.15/mo" (smallest, Oct 2026 checks); app components extra | New accounts after 15 Oct / 30 Nov 2026 reportedly can't add standby (HA) nodes to new Standard clusters |
| **B. Vercel (web) + Render (API, Postgres, cron)** | Render Singapore (no India) | ✅ via Vercel `rewrites` to the Render API | Render docs: PITR on paid plans; Hobby 3-day, Pro 7-day window | ✅ Render cron jobs | Vercel **Pro required for commercial use** (Hobby is non-commercial); Render paid Postgres "from $6/mo" (unverified) | Verify Vercel's external-rewrite caching default; the API already sends `Cache-Control: no-store` |
| **C. AWS Mumbai (Lightsail containers + Lightsail Postgres)** | **Mumbai (ap-south-1)** | 🟡 needs a reverse proxy / CloudFront behaviour | Automated snapshots; PITR on Lightsail DB (verify) | 🟡 EventBridge or a small instance with cron | Lightsail DB plans from $15/mo (official, region not stated) | Most ops work; strong long-term path to RDS |
| **D. Supabase (Postgres only) + any app host** | Mumbai available | depends on host | Daily backups on Pro; PITR is an add-on from ~$100/mo per project (secondary sources) | host-dependent | Pro + PITR is costly for a beta | We use our own auth/API, so most Supabase features would go unused |
| E. Neon (Postgres only) | Mumbai **unverified** | depends on host | Restore window up to 7 days (Launch) / 30 (Scale), billed per GB-month | host-dependent | usage-based | Serverless cold starts; verify region |
| F. Fly.io | Mumbai machines; **managed Postgres in Mumbai unverified/conflicting** | ✅ one app can serve both | Managed Postgres plans from ~$38/mo | ✅ | Higher DB entry price | Sources conflict on Postgres in `bom` |

## Recommendation
**Option A (DigitalOcean, Bangalore)** for the closed beta:
- One provider and one region in India.
- Native same-origin routing, with no proxy or cross-site cookie risk.
- PITR included with the database.
- Built-in scheduled job.
- The lowest operational burden.

The fallback is **Option B** if you prefer Vercel for the web app; it needs a Vercel Pro seat for commercial use.

**Before approving A:** confirm on DigitalOcean's own pages:
1. The BLR1 managed PostgreSQL 16 price and PITR retention.
2. Encryption at rest and trusted sources (IP allow-listing).
3. App Platform scheduled-job pricing.
4. Whether HA standby nodes are available to a new account.

## Beta database plan (after approval ★)
1. Create a **new** project and PostgreSQL 16 cluster. Never reuse the legacy database.
2. Restrict access to trusted sources (the app only) and require TLS.
3. Create a least-privilege app role: no superuser, no `CREATE DATABASE`.
4. Run `alembic upgrade head` (→ `0009_job_runs`) from a one-off job, then `alembic check`. Run the `test_route_security` suite against a staging copy.
5. **Backup drill:** take an on-demand backup, restore it to a *new* cluster or PITR fork, compare row counts and per-table checksums, then delete the drill cluster (★ approval for the cost).
6. Record the procedure and timings in `DISASTER_RECOVERY.md`.

## Sources
- [Render: managed PostgreSQL pricing 2026](https://render.com/articles/managed-postgresql-pricing-2026) · [Render pricing](https://render.com/pricing) · [Render backup/restore](https://render.com/articles/how-to-backup-and-restore-postgresql-databases) · [Render new regions (Singapore)](https://render-web.app.render.com/blog/new-regions)
- [DigitalOcean managed Postgres review 2026](https://infratally.com/articles/digitalocean-managed-postgres-deep-dive/) · [Managed Postgres cost comparison 2026](https://infratally.com/articles/managed-postgres-cost-comparison/) · [Bytebase hosting comparison](https://www.bytebase.com/blog/postgres-hosting-options-pricing-comparison/)
- [Neon pricing breakdown 2026](https://vela.run/articles/neon-serverless-postgres-pricing-2026/) · [Neon pricing calculator](https://makerkit.dev/pricing-calculator/neon)
- [Supabase PITR cost](https://backupdrill.com/compare/supabase-pitr) · [Supabase pricing guide 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- [Vercel rewrites docs](https://vercel.com/docs/routing/rewrites) · [Vercel Hobby commercial-use rules](https://devtoolpick.com/guides/vercel-hobby-plan-commercial-use/)
- [Fly.io pricing docs](https://docs.fly.io/about/pricing) · [Fly Postgres alternative/pricing](https://layerbase.com/blog/fly-postgres-alternative) · [srvrlss Fly review](https://www.srvrlss.io/provider/fly/)
- [Lightsail databases (AWS docs)](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-databases.html) · [Railway Postgres hosting guide](https://railway.com/guides/best-postgresql-hosting-2026.md)
