# Ledger Integrity Report (overnight, 2026-11-06)

| Rule | How it's enforced | Evidence |
|---|---|---|
| Money is integer paise | `PositivePaise`/`SignedPaise` schemas (strict ints), `BigInteger` columns; the frontend parses input without floats (`parsePaiseInput`) | `test_money_must_be_integer_paise`, `split.test.ts` |
| Balance = opening + posted entries | Derived on read, never stored | `test_balance_is_opening_plus_posted_entries` |
| Transfers aren't income or expense | `kind="transfer"`, excluded in reports and insights | `test_transfer_moves_money_…`, `reports.test.ts`, `insights.test.ts` |
| Refunds linked and capped | `refund_of_id`; cap checked under a row lock **and re-checked after insert (new)** | `test_refunds_link_…`, `test_simultaneous_retries_…` |
| Reversal audited | One reversal per entry, cancels in reports | `test_reversal_is_audited_…` |
| Edits and voids keep history | `audit_events`; void is a status | `test_edit_and_void_keep_history` |
| Retries never double-post | Idempotency key unique per user. **Simultaneous retries now return the saved entry instead of HTTP 500 (new)**; a different body with the same key gives 409 | `test_idempotency_…`, `test_simultaneous_retries_…` |
| Imports don't duplicate | Deterministic row keys and a duplicate preview; re-commit is safe | `test_commit_is_idempotent_…` |
| Bank balance isn't authoritative | The statement Balance column is ignored; no balancing entries (**new test**) | `test_bank_balance_column_is_never_treated_as_authoritative` |
| Cancelled import saves nothing | Batch cancelled, commit refused (**new test**) | `test_cancelled_import_saves_nothing` |
| Group splits sum exactly | Largest-remainder `allocate_equal` / `allocate_weighted`; the frontend mirror uses the same vectors | `test_group_flexible.py` (2000-case property test plus the founder's examples), `split.test.ts` |
| Group balances reconcile | Net per member sums to 0; payback is capped at what's owed; simultaneous paybacks record once (**new test**) | `test_simultaneous_full_paybacks_record_only_once` |
| Share-based personal ledger | The group account balance equals my net; spending equals my shares | `test_group_share_ledger.py` (randomised) |
| Time zones | Local date from the user's time zone (server); report and analytics dates compared as local `YYYY-MM-DD` (**fixed tonight**) | `test_local_date_uses_user_time_zone`, `reports.test.ts` |
| Offline queue sends once | `local:<id>` idempotency keys | `resilience.spec.ts` |
| AI never writes | Navigation-only actions (server-filtered) | `server.test.ts` |
| Export | Complete JSON, no secrets; CSV formula-safe | `test_export_covers_…`, `test_responses_never_contain_secrets`, `csv` tests |

## Defects found and fixed tonight
1. **Simultaneous idempotent retries returned HTTP 500.** No duplicate was ever stored, but the client saw a failure for a saved entry. Fixed with `_flush_or_replay`.
2. **The refund cap could be exceeded by simultaneous refunds** where row locks aren't available (SQLite). Fixed by re-checking after insert. PostgreSQL was already protected by `SELECT … FOR UPDATE`.
3. **Analytics period filter parsed dates as UTC**, so west of UTC an entry on the 1st counted in the previous month. Fixed.

## Open items
- No UI to create refunds, reversals or transfers (API only).
- Device-only mode stores rupee numbers rounded to the paisa (DECISIONS D1); account mode is integer paise end to end.
