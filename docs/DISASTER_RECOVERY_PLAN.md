# Disaster Recovery Plan (private beta)

**Targets for a 20-person beta:**
- **RPO** (data we can lose): ≤ 5 minutes, from managed PostgreSQL point-in-time recovery (7-day window).
- **RTO** (time to restore service): ≤ 2 hours.

Both are **to be confirmed by the restore drill** in `BETA_DATABASE_READINESS.md`; neither is measured yet.

## Backups
| What | How | Retention | Who can access |
|---|---|---|---|
| Managed PostgreSQL | DigitalOcean daily backups plus write-ahead logs (PITR), included in the plan | 7 days | DO account owner (2FA required ★) |
| Weekly logical dump | `pg_dump --format=custom` from a one-off job (or the founder's machine via a temporary trusted source), SHA-256 recorded, stored encrypted off-site (★ choose storage) | 8 weeks | Founder only |
| Before every migration | One logical dump plus checksum (`DEPLOYMENT_RUNBOOK.md`, step 2) | 30 days | Founder only |
| Local release stack | `scripts/windows/backup.ps1` to `backups\*.dump` plus `.sha256` on D: | Manual | This PC |

**Encryption:** DigitalOcean encrypts managed databases and backups at rest. Off-site dumps use an encrypted archive or an encrypted bucket. Dumps never go in Git or in release packages.

## Verification (a backup isn't a backup until it's been restored)
- **Weekly:** restore the latest dump into a **new** scratch database. Compare these against the live database:
  - revision
  - table list
  - row counts
  - posted net paise
  - per-account balances
  - group nets
  - audit-event count
- **Locally:** `scripts/windows/restore.ps1` does exactly that. It refuses the live database and any existing name, verifies the SHA-256, and prints the comparison.
- **Failed backup or verification:** alert the founder (email from DO, or the uptime monitor's alert). Fix it before the next deploy.

## Scenarios
| Scenario | Response |
|---|---|
| **Bad deploy (code)** | Roll back to the previous deployment in App Platform (Activity tab). Migrations are additive, so old code runs on the new schema. |
| **Bad migration** | Stop deploys. If no data was written since, `alembic downgrade <previous>` (each migration has a tested downgrade). Otherwise PITR to just before the migration **into a new cluster**, verify, then repoint `DATABASE_URL`. |
| **Accidental deletion of user data** | PITR into a **new** cluster at a time before the deletion. Export the affected user's rows and re-insert them through the API or an audited script. Never overwrite the live cluster. |
| **Database corruption or cluster loss** | Restore the latest backup or PITR to a new cluster, verify the numbers above, repoint `DATABASE_URL`, redeploy. Keep the damaged cluster for investigation. |
| **Credential compromise** (JWT secret / DB password) | Rotate the DB password in DO and update the app secret. Rotate `JWT_SECRET` (this signs everyone out, which is intended). Revoke all sessions. Review `audit_events`. Follow the legal incident process (DPDP breach notification, with counsel). |
| **Region outage** | Accept downtime for the beta. A cross-region restore from backup is possible but untested. |

## Roles
- **Incident lead:** the founder.
- **Steps:**
  1. Acknowledge.
  2. Stop the damage (maintenance, or revoke sessions).
  3. Preserve logs (request IDs are in every response and error log).
  4. Restore or roll back.
  5. Write a post-incident note.
  6. Tell affected beta users plainly.

## Status
| Item | Status |
|---|---|
| Procedures | Written |
| Local backup script | PASS earlier (rc1 extracted package: dump plus matching SHA-256) |
| Local restore script | NOT TESTED (Docker unavailable: C: full) |
| Managed DB restore drill | NOT TESTED (no cluster; ★) |
| RPO/RTO measured | NOT TESTED |
