# Database Audit: 2026-11-06 (read-only)

## What is running
- Container `bagla_finance_python_ready-postgres-1` (postgres:16.15), volume `bagla_finance_python_ready_bagla_pgdata`, published on `0.0.0.0:5432`.
- It was started from compose project `bagla_finance_python_ready`, whose working directory (`C:\Users\henil\OneDrive\Desktop\BAGLA_FINANCE_PYTHON_READY_FIXED\BAGLA_FINANCE_PYTHON_READY`) **no longer exists**.
- A Redis 7 container from the same project is also running.
- Database `bagla_finance`, 7.9 MB.

## Findings

| Check | Live database | Repository | Status |
|---|---|---|---|
| Alembic revision | `0001_initial_schema` | head `0006_family_budgets_goals` committed; `0007_group_share_ledger` uncommitted | 6 revisions behind |
| Public tables | 4 (`alembic_version`, `users`, `financial_accounts`, `transactions`) | 28 at 0006 | expected for 0001 |
| Columns, constraints, indexes | identical to `migrations/versions/0001_initial_schema.py` (12 indexes, FKs CASCADE/SET NULL) | 0001 | match |
| Rows | users 5 (1 gmail.com, 4 example.com), financial_accounts 1, transactions 4 (all `manual`, 2 with no account) | n/a | possibly real data |

**Why only four tables:** this is an older development database created by the previous project at revision 0001 and never upgraded. It is not a partially migrated database: no 0002+ objects exist.

## Backup
- `backups/pre-resume-2026-11-06/bagla_finance_pre_resume.dump`: SHA-256 `6A0AFD45…E89E9FD`, **matches** the recorded value. pg_dump custom format.
- **Restore test: PASS.** Restored into a throwaway postgres:16 container (tmpfs data, port 127.0.0.1:55433, removed afterwards). Revision `0001_initial_schema`, 4 tables, 12 indexes, row counts 5/1/4. Per-table content MD5 is identical to the live database.
- **Upgrade rehearsal on the restored copy (not live): PASS.** `alembic upgrade 0006` succeeded; 29 tables (28 plus `alembic_version`); users 5 and transactions 4 preserved; 4 audit events back-filled.
  - The 2 transactions without an account moved to an "Unassigned (migrated)" account, as designed.

## Discrepancy needing a founder decision before migrating the live database
Migration 0002 renames `financial_accounts.balance_paise` to `opening_balance_paise` and derives balances from transactions.

| | Bank account |
|---|---|
| Old stored balance | ₹10,000.00 |
| Its 2 transactions | −₹500.00 |
| Derived balance after migration | ₹9,500.00 |

That's correct if the old app stored the starting balance. If the old app stored a running balance (already including those debits), the migrated balance would be ₹500 too low.

The original 0001-era application code is not in this repository, so this can't be determined from code. Options:
1. Confirm the old meaning, then migrate.
2. Migrate, then add a one-off audited adjustment entry.
3. Start the beta on a fresh database and keep this one as an archive.

**No schema change has been made to the live database.**
