# Deployment Runbook

_Nothing is deployed. Hosting, domains and providers need founder approval (★). This is the plan and the procedures, written against what was verified on 2026-11-06._

## Architecture (recommended)
```
Browser ──https──> app.<domain> (static React build + Node AI routes)
                     │  rewrite /api/v1/*  →  API (same origin for the browser)
                     ▼
              FastAPI container (uvicorn, 2+ workers)
                     │
              Managed PostgreSQL 16 (daily backups + PITR, encrypted at rest)
              Scheduler: every 15 min  →  python -m app.jobs.reminders
```
- **Same-origin API** is required by the current security design. The refresh cookie is first-party (SameSite=Lax) and the CSP stays `connect-src 'self'`. On Vercel this is a `rewrites` entry for `/api/v1/:path*` to the backend URL; on other hosts it's a reverse proxy rule. Without it, the deployed app cannot reach the API.
- Redis isn't required yet. Rate limits are in memory per process, so with several API instances, move them to Redis or Postgres before scaling out.

## Release procedure
1. `main` only receives reviewed merges (★ approval). CI must be green: frontend, backend on SQLite and PostgreSQL, migrations up/down/up, `alembic check`, and E2E on PostgreSQL.
2. **Back up first** (see below) and record the dump's SHA-256.
3. Deploy the API image, then run `alembic upgrade head` **once**, from a one-off job, never at container start.
4. Deploy the web build.
5. Smoke test: `/health`; register a test account; add and void an entry; sign out and back in.
6. Watch error logs and the 5xx rate for 30 minutes.

## Database migrations
- Current head: `0008_notifications`. Chain 0001 → 0008, all additive since 0002.
- Before upgrading any existing database, follow these steps (as done for the local DB on 2026-11-06, see `DATABASE_AUDIT_2026-11-06.md`):
  1. Read `alembic_version` and the table/row counts.
  2. Back up the database and verify the dump hash.
  3. Restore into a scratch database and run the upgrade there first.
  4. Compare row counts and balances.
- **Open decision for the existing local DB (rev 0001):** the meaning of the legacy `balance_paise` (opening vs running). Upgrading changes the derived bank balance by −₹500 if it was a running balance.

## Backup and restore
```bash
pg_dump --format=custom --no-owner --file=bagla_$(date +%F).dump "$DATABASE_URL"
sha256sum bagla_$(date +%F).dump > bagla_$(date +%F).dump.sha256
# Restore test (scratch DB, never the live one):
createdb bagla_restore_check && pg_restore --no-owner --exit-on-error -d bagla_restore_check bagla_YYYY-MM-DD.dump
```
Verified on 2026-11-06: the pre-resume dump hash matched, the restore into an isolated container matched live row counts and per-table MD5, and a rehearsal upgrade to 0006 preserved users and transactions.

## Rollback
- **App-only problem:** redeploy the previous image or build. The schema is backwards-compatible because migrations are additive.
- **Bad migration:** stop writes (maintenance), then `alembic downgrade <previous>`. Each migration has a tested downgrade, but downgrades drop the new tables' data. Prefer **restoring the pre-release dump** if data was written.
- **Data incident:** restore the latest good backup into a new database, verify it, then repoint `DATABASE_URL`. Never overwrite the damaged database; keep it for investigation.

## Monitoring and incident response (minimum for beta)
- Uptime check on `/health`. Error logs, 5xx rate, p95 latency, DB connections and storage.
- Reminder job: alert if it hasn't run for 1 hour, or if `notifications` rows stay `pending` past `next_attempt_at`.
- Incident steps:
  1. Acknowledge.
  2. Stop the damage (maintenance mode or revoke sessions with `logout-all` per user).
  3. Preserve logs and the database.
  4. Fix forward or roll back.
  5. Write a post-incident note.
- If personal data may have leaked, follow the legal process agreed with counsel (DPDP breach notification). Don't improvise.
