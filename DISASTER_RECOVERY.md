# Disaster Recovery

**Status: procedures written, NOT verified.** A backup counts as verified only after a successful restore test, and none has been run because there's no PostgreSQL instance yet (Docker Desktop is off and nothing is deployed).

## Proposed targets (not guarantees)
- **RPO** (max data loss): 24 hours with daily backups; about 5 minutes if the host offers point-in-time recovery.
- **RTO** (time to restore): 4 hours.

## Backups (when a database exists)
```bash
# Logical backup (custom format, compressed)
pg_dump --format=custom --no-owner --file=bagla_$(date +%F).dump "$DATABASE_URL"
# Keep 7 daily + 4 weekly copies, encrypted, in storage separate from the DB host.
```

## Restore test (to be run, then record the result here)
```bash
createdb bagla_restore_test
pg_restore --no-owner --dbname=bagla_restore_test bagla_YYYY-MM-DD.dump
# Verify: row counts per table match, then call GET /api/v1/reports/reconciliation
# for a few synthetic test users against the restored DB: "ok": true.
```

## Scenarios
| Scenario | Recovery |
|---|---|
| Failed deployment | Redeploy the previous container image; schema migrations are additive |
| Failed or interrupted migration | Alembic runs each migration in a transaction on PostgreSQL, so a failure rolls back. Restore from the pre-migration backup if needed (take one before every `alembic upgrade`) |
| Accidental transaction change by a user | Every change is in `audit_events` (before/after); void entries can be recreated; nothing is hard-deleted except on account deletion |
| User deleted their account by mistake | Only recoverable from backups within the retention window (decide the policy; document it in the privacy notice) |
| Lost local browser data (today's app) | Users should use Privacy Center → Download Ledger Backup (JSON); there's no server copy until Phase 3 |
| Leaked secret | See `RUNBOOK.md` incidents |

## Browser → server migration safety (Phase 3 design)
The local data is exported first and never deleted automatically. Imports are idempotent (keys derived from local ids), so an interrupted migration can be re-run safely.
