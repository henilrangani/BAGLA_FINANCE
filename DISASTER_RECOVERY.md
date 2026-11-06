# Disaster Recovery

**2026-11-06:** the pre-resume backup (`backups/pre-resume-2026-11-06/…dump`) hash matched its record. It restored into an isolated PostgreSQL 16 container with identical revision (0001), tables, indexes, row counts and per-table content MD5. A rehearsal upgrade of that copy to 0006 preserved all users and transactions. See `DATABASE_AUDIT_2026-11-06.md` and `DEPLOYMENT_RUNBOOK.md`.

**Status (2026-11-05):** the dump/restore procedure below **was verified once locally** (PostgreSQL 16 in Docker). Row counts, net posted paise, opening balances, schema version and all 57 constraints matched after restore. **Production backups are not verified:** there's no production database yet, and the host's automated backups and PITR need their own restore test.

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
