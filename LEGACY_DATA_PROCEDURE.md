# Legacy Database: Preservation, Reconciliation and (Optional) Import

**Founder decision (2026-11-06): do not migrate or modify the original database.** Beta users never connect to it. It stays as a reference archive.

## What is being preserved
| Item | Location | Integrity |
|---|---|---|
| Live container | `bagla_finance_python_ready-postgres-1` (postgres:16.15) | untouched; checksums below |
| Volume | `bagla_finance_python_ready_bagla_pgdata` (created 2026-10-02) | untouched |
| Original backup | `backups/pre-resume-2026-11-06/bagla_finance_pre_resume.dump` | SHA-256 `6A0AFD45…E89E9FD` ✓ (re-verified 2026-11-06) |
| Second backup (read-only dump) | `backups/legacy-readonly-2026-11-06/legacy_bagla_finance_rev0001.dump` | SHA-256 in `.sha256` beside it; same object list as the original backup |
| Reconciliation report | `backups/legacy-readonly-2026-11-06/reconciliation_report.json` | produced from a restored copy |

**Content fingerprint** (per-table MD5 of all rows; must stay identical):
- users `4ccce718…5d2`
- financial_accounts `50844d05…78e`
- transactions `cf2465a5…cb4`

Revision `0001_initial_schema`, 4 tables, 12 indexes.

### Rules
- Never run `alembic`, `docker compose down -v`, volume prune, or any write against it.
- Keep at least two verified dumps in two places (one off this computer). The D: copies are on the same disk as the work; copy them to external storage ★.
- **Security exposure (needs approval to change):**
  - The container publishes PostgreSQL on **all interfaces** (`0.0.0.0:5432`) with the **default password**. Redis is published on `0.0.0.0:6379`.
  - Recommended: stop it while unused, or recreate it bound to `127.0.0.1` with a strong password. The volume is preserved either way, and **only with your approval**.
  - Optionally make the database read-only: `ALTER DATABASE bagla_finance SET default_transaction_read_only = on;`. This is a configuration change, so it also needs approval.

## Reconciliation (read-only, repeatable)
1. Restore the legacy dump into a **throwaway** PostgreSQL (tmpfs, localhost only).
2. Run `python backend/scripts/legacy_reconcile.py <url-of-the-copy>`. It refuses anything that isn't revision 0001, and it runs every query in a READ ONLY transaction.
3. Its report lists each account's stored balance under **both** readings (opening vs running) and doesn't choose. Owners are masked as `user-<hash>@domain`.

Current findings (2026-11-06):

| Account | Stored | Transactions | If opening | If running |
|---|---|---|---|---|
| gmail.com user, bank | ₹10,000.00 | 2, net −₹500.00 | opening ₹10,000 → now ₹9,500 | opening ₹10,500 → now ₹10,000 |

An example.com user has 2 transactions without an account (net −₹750.00). There are no deleted rows and no invalid amounts.

## Import into the beta (only if you decide to; never automatic)
**Preconditions:**
1. The owner confirms each account's **opening balance and date** from an independent source (bank statement or passbook) and signs off on the transaction list.
2. The user has a beta account.
3. You approve the import.

**Method:** a scripted import through the normal API as that user, never by SQL. Steps:
1. Create each account with the **confirmed** opening balance.
2. Post each legacy transaction with idempotency key `legacy:<legacy-transaction-id>`, so re-running never duplicates.
3. Write audit events with `source=legacy_import` and the legacy ids.
4. Compare the resulting balance with the owner-confirmed current balance.

Any difference stops the import. Nobody adds an adjustment to make the numbers match: the owner decides. Test accounts (example.com) aren't imported.

**Records kept:**
- the reconciliation report
- the owner's sign-off
- the import log (legacy id → new id)
- before and after balances

All are stored outside the database, alongside the dumps.
