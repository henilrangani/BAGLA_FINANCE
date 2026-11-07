# Security Final Review (2026-11-07)

Builds on `SECURITY_REVIEW_OVERNIGHT.md` (all findings there still hold). New today:
- **FIXED: legacy-database fallback.** `DATABASE_URL` had a default pointing at the legacy local database (default password). A run without the variable could have connected to it, or migrated it. It's now required. Tested.
- **FIXED: destructive test suite.** It now refuses any PostgreSQL database whose name lacks "test". Before this, the documented command targeted the legacy DB's address and name. Tested.
- **FIXED: managed-database SSL.** `?sslmode=require` broke either the API driver or the migrations. It's now handled per driver. Tested locally and on CI PostgreSQL.
- **ADDED: request IDs.** Every response has an `X-Request-ID`. Unhandled errors give a generic 500 and are logged with method, path and error type only, never the body (test checks that a password and an amount are absent from logs).
- **ADDED:** container log size caps; a configurable DB connection pool.

| Area | Status |
|---|---|
| Auth, sessions, CSRF, rate limits | Tested (unchanged) |
| API authorisation, user isolation, group and family access, admin without financial access | Tested (unchanged) |
| Database permissions (beta) | Planned: app user owns only `bagla_beta`; trusted sources = the app only (`BETA_DATABASE_READINESS.md`) |
| File uploads, AI payloads, logs, export, account deletion | Tested (unchanged; logs re-checked today) |
| Secrets | None in Git (grep); `.env*` ignored; `JWT_SECRET` and `DATABASE_URL` required at start |

## Legacy PostgreSQL and Redis: remediation plan (★ FOUNDER APPROVAL REQUIRED; nothing changed)

### Current facts (from the read-only audits on 2026-11-06; re-check after C: is freed)
| Item | PostgreSQL | Redis |
|---|---|---|
| Container | `bagla_finance_python_ready-postgres-1` | `bagla_finance_python_ready-redis-1` |
| Published ports | `0.0.0.0:5432`, `[::]:5432` (**every network interface**) | `0.0.0.0:6379`, `[::]:6379` (**every interface**, no password) |
| Credentials | user `bagla`, password `bagla` (default) | none |
| Data | volume `bagla_finance_python_ready_bagla_pgdata`, rev `0001`, 5 users, 1 account, 4 transactions | volume `f6ff40d4…` |
| Compose project folder | deleted (the containers survive) | same |
| Dependants | **none found**: no `.env` in the workspace; `DATABASE_URL` no longer defaults to it (fixed today); nothing in the code uses Redis | same |
| Verified backups | `backups/pre-resume-2026-11-06/…dump` (SHA-256 `6A0AFD45…`) and `backups/legacy-readonly-2026-11-06/legacy_bagla_finance_rev0001.dump` (`07FA5CCC…`); restore into an isolated container matched per-table checksums | not backed up yet (step 1 below) |

### Procedure (when approved; about 15 minutes; Docker must be responsive)
1. **Back up and verify.**
   - Fresh `pg_dump -Fc` of `bagla_finance` to D:, with SHA-256 recorded.
   - Restore it into a throwaway tmpfs container and compare per-table MD5 with the live DB (the method used on 2026-11-06).
   - Redis: `redis-cli --rdb` snapshot to D:, plus `DBSIZE` recorded.
2. **Recreate the two containers with the same volumes, bound to 127.0.0.1 only, and new credentials.** A container's published ports can't be changed in place, and the original compose file is gone.
   - Write a new `D:\BAGLA_FINANCE_WORKSPACE\legacy\docker-compose.yml`:
     - project name `bagla_finance_python_ready`
     - `external: true` volumes with the **same names**
     - `ports: ["127.0.0.1:5432:5432"]` and `["127.0.0.1:6379:6379"]`
     - Redis `--requirepass <new>`
   - `docker stop` the two containers. Remove **only the containers** by exact name; never volumes, never with `-v`.
   - `docker compose up -d` from the new file. The volumes are re-attached unchanged.
3. **Rotate the PostgreSQL password:** `ALTER USER bagla PASSWORD '<new>'`. Store it in a password manager, not in a file in the repo.
4. **Verify:**
   - `docker port` shows 127.0.0.1 only.
   - From another device on the network the ports are refused.
   - Per-table MD5 equals the audit (`4ccce718…` / `50844d05…` / `cf2465a5…`).
   - Redis `DBSIZE` is unchanged.
5. **Rollback:** if anything differs, stop the new containers. The volumes are untouched, so start a container with the old configuration on the same volumes. The dumps from step 1 are the last resort, restored into a **new** volume only.

**Simplest alternative:** `docker stop` both containers and leave them stopped. That removes all exposure immediately, keeps the volumes, and is reversible with `docker start`.

## Open risks
1. ★ Legacy exposure (above).
2. In-memory rate limits (one API instance only).
3. No MFA, email verification or password reset (needs ★ an email provider).
4. No external penetration test before public launch (★).
5. AI/OCR providers, if enabled, receive financial summaries or bill images (★ DPA and consent text).
