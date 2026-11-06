# Private Beta Deployment Checklist

★ = founder approval required. Nothing below has been purchased, configured or deployed. Details: `HOSTING_OPTIONS.md`, `DEPLOYMENT_RUNBOOK.md`, `REMINDER_SCHEDULER.md`.

## Gate 1: decisions (★)
- [ ] ★ **Hosting chosen.** Recommended: DigitalOcean App Platform + Managed PostgreSQL, Bangalore (India region, same-origin routing, scheduled jobs). Fallback: Vercel Pro + Render (Singapore). **Confirm current prices on the providers' own pricing pages first**; ours are from secondary sources.
- [ ] ★ Budget approved for hosting, database and a small restore-drill database.
- [ ] ★ Domain and DNS (for example `app.<domain>`), with HTTPS certificates issued by the host.

## Gate 2: new managed PostgreSQL (never the legacy DB)
- [ ] New PostgreSQL 16 cluster in the chosen region. Encrypted at rest, TLS required, daily backups and point-in-time recovery switched on.
- [ ] Least-privilege app role: owns only the app database, no superuser.
- [ ] Network: reachable only from the app (trusted sources / private network), not from the internet.
- [ ] `alembic upgrade head` run **once** from a one-off job, reaching `0009_job_runs`; `alembic check` clean.
- [ ] The legacy local database (rev 0001) is **not** connected, migrated or imported (`LEGACY_DATA_PROCEDURE.md`).

## Gate 3: backup and restore drill
- [ ] `pg_dump --format=custom` of the beta DB, with the SHA-256 recorded.
- [ ] Restored into a **separate** scratch database; row counts and the reconciliation report (`GET /reports/reconciliation`) match.
- [ ] Point-in-time restore tested once on the host (to a new cluster).
- [ ] Recovery steps and the time they took written into `DISASTER_RECOVERY.md`.

## Gate 4: secrets and configuration
- [ ] `JWT_SECRET`: new random value of 48+ bytes, in the host's secret store. Never in Git, images or logs.
- [ ] `DATABASE_URL` from the host's secret store, with `sslmode=require`.
- [ ] `ENVIRONMENT=production`. This enforces Secure cookies, the 20/15-minute sign-in limit and the 300 cap on the refresh limit, and disables `/docs`.
- [ ] `CORS_ORIGINS=https://app.<domain>` only.
- [ ] `GEMINI_API_KEY` empty unless ★ approved after a live test, prompt-injection review and spend cap.
- [ ] `WEBHOOK_SECRET` empty (webhook disabled) unless a real, reviewed integration exists.

## Gate 5: HTTPS and same-origin routing
- [ ] Browser reaches the app at `https://app.<domain>/` and the API at `https://app.<domain>/api/v1/...`: **the same origin**. The refresh cookie (`SameSite=Lax`, path `/api/v1/auth`) and the CSP `connect-src 'self'` depend on it. `deploy/release/nginx.conf` shows the routing.
- [ ] HSTS on; HTTP redirects to HTTPS.
- [ ] The API trusts `X-Forwarded-For` only from the host's load balancer, so per-user rate limits work.
- [ ] One API instance at first: rate limits are in memory per process. Move them to a shared store before scaling out.

## Gate 6: reminder scheduler
- [ ] `python -m app.jobs.reminders` every 15 minutes (host cron job / scheduled job). It takes a single-run lock, so overlapping runs are skipped.
- [ ] Reminders are in-app only. Email stays "not available" until a provider is integrated and tested (★).

## Gate 7: monitoring
- [ ] Uptime checks on `/health` (1 min) and `/health/jobs` (alert on 503, meaning no successful run for 45 minutes).
- [ ] Error logs retained; alerts on a 5xx spike and database storage over 80%.
- [ ] Optional ★: error tracker with PII scrubbing.

## Gate 8: legal and support (★)
- [ ] Counsel reviews `PRIVACY_NOTICE_DRAFT.md` and `TERMS_DRAFT.md` (DPDP Act 2023), fills the placeholders and names a grievance officer.
- [ ] Privacy notice and terms linked in the app before invitations go out.
- [ ] No claims of RBI/NPCI authorisation, bank connection, payment initiation or investment advice, anywhere.

## Gate 9: release approvals (★)
- [ ] ★ Merge `phase-1-security-money` into `main` after review. CI green (frontend, backend on SQLite + PostgreSQL, migrations, E2E).
- [ ] ★ Private deployment approved.
- [ ] Post-deploy smoke test:
  - `/health` and `/health/jobs`;
  - register a fresh test account;
  - add, edit and void an entry;
  - sign out and in;
  - export.
- [ ] Watch logs and the 5xx rate for 30 minutes.
- [ ] ★ Invite list approved; invitations sent by the founder.

## Local machine (recommended, ★)
- [ ] The legacy containers `bagla_finance_python_ready-postgres-1` (port 5432) and `-redis-1` (port 6379) listen on **all network interfaces**, and PostgreSQL uses the **default password**. With approval: bind them to 127.0.0.1 or stop them, keeping the volume. Nothing has been changed.
- [ ] Copy the verified backups in `D:\BAGLA_FINANCE_WORKSPACE\backups\` to a second location.
