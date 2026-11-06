# Launch Checklist

_2026-11-06. ★ = founder decision or approval._

## Closed beta
- [x] CI green: frontend, backend on SQLite and PostgreSQL, migrations, E2E on PostgreSQL
- [x] Backups: procedure verified on a real dump (hash + isolated restore)
- [x] Security: cookie sessions, CSRF, isolation sweep, scans clean
- [x] Financial integrity tests (paise, splits, share-only accounting, concurrency)
- [ ] ★ Host + domain; configure the `/api/v1` same-origin rewrite (DEPLOYMENT_RUNBOOK)
- [ ] ★ Managed PostgreSQL with daily backups + PITR; run one restore drill there
- [ ] Schedule `python -m app.jobs.reminders` every ~15 min
- [ ] Set production env vars (ENVIRONMENT.md); generate JWT_SECRET in the host's secret store
- [ ] ★ Privacy notice + terms reviewed by counsel; grievance contact
- [ ] Smoke test on a real Android phone and an iPhone
- [ ] ★ Approve merge to `main` and the deployment

## Before public launch (additional)
- [ ] ★ Email provider (password reset, invites, reminder emails)
- [ ] Shared rate-limit store; monitoring and alerts (DEPLOYMENT_RUNBOOK)
- [ ] External penetration test; dark-mode/screen-reader accessibility pass
- [ ] ★ Decide on paid plans and gateway (none exist today)
- [ ] Marketing copy reviewed against verified features only
