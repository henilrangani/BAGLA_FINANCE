# Database Schema (PostgreSQL)

Migrations: `backend/migrations/versions/0001_initial_schema.py` → `0002_ledger_auth_planning.py`.
Money columns are `BIGINT` minor units (paise for INR). Timestamps are `TIMESTAMPTZ` (UTC).

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | Accounts, preferences, lockout state | unique email, unique bagla_id |
| `auth_sessions` | Refresh-token sessions (SHA-256 hashes only) | unique refresh_token_hash; FK users CASCADE |
| `financial_accounts` | Bank, cash, savings, card, wallet, loan, investment, other | `account_type` check; FK users |
| `transactions` | **Ledger entries** | `amount_paise > 0`; direction/kind/status/source checks; unique (user_id, idempotency_key); unique reverses_id; FK account RESTRICT; self-FKs refund_of_id / reverses_id RESTRICT |
| `audit_events` | Append-only change history | FK users; index (entity_type, entity_id) |
| `budgets` | Period budgets (optional category, rollover) | `amount_paise > 0`; period check |
| `savings_goals` | Targets | `target_paise > 0` |
| `goal_contributions` | Deposits and withdrawals toward goals | `amount_paise > 0`; direction check |

## `transactions` semantics
- `direction`: `credit` adds to the account, `debit` removes from it.
- `kind`: `income`, `expense`, `transfer`, `refund`, `reversal`, `savings_contribution`, `loan_repayment`, `investment`, `adjustment`.
- `status`: `pending` (not in balance), `posted`, `void` (kept for history, excluded everywhere).
- `occurred_at` is a UTC instant. `local_date` and `timezone` record the user's calendar day.
- `source`: `manual`, `voice`, `receipt`, `import`, `notification_observed`, `aggregator`, `ai_suggested`, `migration`. Android capture will use `notification_observed`, never a "bank verified" label.

## Balance formula
`balance = opening_balance_paise + Σ credit(posted) − Σ debit(posted)`. You can check this per account with `GET /api/v1/reports/reconciliation`.

## Migration 0001 → 0002 (data-preserving)
- `balance_paise` is renamed to `opening_balance_paise`.
- Unknown account types become `other`.
- `direction` credit/debit becomes kind `income`/`expense`; `deleted=true` becomes `status='void'`.
- `external_id` `idem:<k>` becomes `idempotency_key`; anything else is kept as `source_ref`.
- Transactions with no account are attached to a per-user "Unassigned (migrated)" account.
- Every migrated row gets a `migrated_0002` audit event.
- Downgrade restores the 0001 shape. Rows in the tables created by 0002 (sessions, audit, budgets, goals) are lost on downgrade.

**Verified:** both directions render to valid SQL offline (`alembic upgrade head --sql`, `alembic downgrade … --sql`). **Not yet verified:** running against a live PostgreSQL. Docker Desktop wasn't running; CI runs it on push.

## Migration 0004: group splits and recurring bills (additive)
- `split_groups` (name, emoji, currency, `budget_paise`, `created_by` SET NULL, `is_archived`).
- `split_members` (`group_id`, `user_id` nullable/SET NULL, `display_name`, `upi_id`, role admin|member, status active|removed, `invite_token_hash` unique, `invite_expires_at`).
- `split_expenses` (`amount_paise` > 0, `paid_by_member_id` RESTRICT, `expense_date`, status posted|void, unique `(group_id, idempotency_key)`) and `split_shares` (`share_paise` ≥ 0, unique `(expense_id, member_id)`).
- `split_settlements` (from ≠ to, `amount_paise` > 0, method, status recorded|void, unique `(group_id, idempotency_key)`).
- `recurring_bills` (user, `amount_paise` > 0, frequency check, start/end date, status active|paused|cancelled, `remind_days_before` 0–30, `account_id` SET NULL) and `recurring_occurrences` (unique `(bill_id, due_date)`, status paid|skipped, `transaction_id` SET NULL).
- Group balance per member = Σ paid − Σ own shares + Σ settlements sent − Σ settlements received (posted/recorded rows only). Balances always sum to 0.
- Downgrade drops the 7 tables.

## Migration 0005: group integrity (additive)
- `split_expenses.personal_transaction_id` (nullable FK → `transactions.id`, SET NULL): the payer's mirrored personal entry.
- `split_groups.version` (int, default 0): optimistic-concurrency counter bumped by every money-changing write.

## Migration 0006: Family Space (additive)
- `family_budgets` (family, name, category nullable = all shared spending, `limit_paise` > 0 per month, `created_by` SET NULL, `is_archived`).
- `family_goals` (family, name, `target_paise` > 0, `target_date`, status active|completed|archived).
- `family_goal_contributions` (goal, `user_id` SET NULL so history survives account deletion, `amount_paise` > 0, note, `contributed_on`, status recorded|void, unique `(goal_id, idempotency_key)`).
- Spending figures are never stored: they're computed from `transactions.shared_family_id`.

## Browser data migration (planned, Phase 3)
1. The user signs in, then chooses "Move my data to my account".
2. The app exports its `localStorage` ledger as JSON and keeps the local copy unchanged.
3. The server imports it with `source='migration'` and idempotency keys derived from the local ids, so re-running never duplicates.
4. Amounts are converted with the paise helpers. Totals before and after are compared and shown to the user.
5. Local data is only marked "migrated", never deleted automatically.
