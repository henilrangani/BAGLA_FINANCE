# API Documentation (FastAPI, `/api/v1`)

Live OpenAPI docs: `http://127.0.0.1:8000/docs` when running locally. All money values are **integer paise**; floats are rejected with 422. Authenticated routes need `Authorization: Bearer <access_token>`.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{email, password (12–128), full_name, timezone?, locale? en/hi/gu}` → token pair. Creates a "Cash Wallet" account. |
| POST | `/auth/login` | `{email, password}` → token pair. Generic 401; 429 after 5 failures (15-minute lock) or 20 requests per 15 minutes per IP. |
| POST | `/auth/refresh` | `{refresh_token}` → new pair. The old token is revoked; reusing it revokes all sessions. |
| POST | `/auth/logout` · `/auth/logout-all` | Revokes the current session or all sessions; access tokens stop working immediately. |
| POST | `/auth/change-password` | `{current_password, new_password}`; revokes the other sessions. |

Access tokens last 15 minutes; refresh tokens last 30 days (configurable).

## Users
`GET /users/me` · `PATCH /users/me` (`full_name`, `timezone`, `locale`) · `GET /users/me/export` (full JSON export) · `DELETE /users/me` (`{password, confirm: "DELETE MY ACCOUNT"}`, permanent).

## Accounts
`GET /accounts` · `POST /accounts` (`name, account_type, opening_balance_paise, currency`) · `GET/PATCH /accounts/{id}` (`name`, `is_archived`).
Responses include the derived `balance_paise` and `pending_paise`.

## Transactions
| Method | Path | Notes |
|---|---|---|
| GET | `/transactions` | Filters: `account_id, kind, category, status, from_date, to_date, needs_review, q, limit (≤200), offset`. Void entries are hidden unless `status=void`. |
| POST | `/transactions` | `kind`: income, expense, savings_contribution, loan_repayment, investment, adjustment (needs `direction`). Optional `occurred_at` (with zone offset), `timezone`, `status` pending/posted, `source` manual/voice/receipt/ai_suggested (ai_suggested is forced to `needs_review`). Header `Idempotency-Key`: a retry returns 200 with the same row; a different payload returns 409. |
| POST | `/transactions/transfers` | `{from_account_id, to_account_id, amount_paise}` → two linked legs. Same currency only. |
| POST | `/transactions/{id}/refunds` | Expense only; total refunds ≤ original (409 otherwise). |
| POST | `/transactions/{id}/reverse` | `{reason}` → opposite entry; the original drops out of reports; once only. |
| PATCH | `/transactions/{id}` | Audited edits. Kind, account and links can't change. |
| DELETE | `/transactions/{id}` | Voids (both legs for a transfer). Blocked while refunds or a reversal exist. |
| GET | `/transactions/{id}/history` | Audit trail. |

## Budgets and goals
`GET/POST /budgets`, `PATCH /budgets/{id}`. Responses include `period_start/end, rollover_paise, available_paise, spent_paise, remaining_paise, used_pct, alert` (ok / near_limit / over_limit).
`GET/POST /goals`, `PATCH /goals/{id}`, `GET/POST /goals/{id}/contributions` (deposits and withdrawals; withdrawals can't exceed the amount saved).

## Reports
`GET /reports/summary?from_date&to_date` (defaults to this month) · `GET /reports/net-worth` · `GET /reports/reconciliation`.

## Errors
- 401: not signed in or session ended
- 404: not found, including other users' data
- 409: rule conflict (refund limit, archived account, idempotency mismatch, …)
- 413: body over 1 MB
- 422: validation
- 429: rate limit or lockout

## Statement imports (Phase 2 batch 2)
- `POST /imports/preview`: `{account_id, filename, content_base64, sign_convention?}`. CSV or XLSX, ≤ 700 KB, ≤ 5,000 rows. Detects the header row (Date / Narration / Debit / Credit / Amount / Dr-Cr) and returns rows with errors, categories and `duplicate_of_id`. **Nothing is posted.**
- `GET /imports/{id}` · `POST /imports/{id}/commit` `{exclude_row_numbers?, include_duplicate_row_numbers?}` (safe to retry; re-uploading the same statement never re-posts) · `POST /imports/{id}/cancel`.

## Family
- `POST /families` (you become admin) · `GET /families` · `GET /families/{id}` (names and roles only).
- `POST /families/{id}/invites` (admin only) → one-time token, valid 7 days; no email is sent. `POST /families/invites/accept {token}`.
- `PATCH /families/{id}/members/{member_id} {role}` (admin) · `DELETE /families/{id}/members/{member_id}` (admin, or yourself). The last admin can't leave or be demoted.
- `POST /families/share/{tx_id} {family_id | null}`: owner only; viewers can't share.
- `GET /families/{id}/transactions`: shared entries from active members only, without account ids or notes.

## Support & feedback
`POST/GET /support/tickets` (reference `BF-XXXXXX`, priority set automatically, no email sent) · `POST /feedback`.

## Billing (Bagla's own plans; no payment gateway connected)
`GET /billing/plans` (`purchasable: false`) · `GET /billing/me` (server-decided access) · `POST /billing/trial {plan_code}` (one per account) · `POST /billing/cancel` (renewal stops; access continues until the trial or period end) · `POST /billing/resume` · `GET /billing/history`.

## Group splits (`/groups`)
All amounts are integer paise. Non-members get 404; admin-only actions by members get 403.
- `GET /groups` (my active memberships) · `POST /groups` `{name, description?, cover_emoji?, budget_paise?, my_upi_id?, members:[{display_name, upi_id?}]}` (creator becomes admin) · `GET/PATCH /groups/{id}` (PATCH admin only; `is_archived` archives).
- Members: `POST /groups/{id}/members`, `PATCH /groups/{id}/members/{mid}` (self or admin; UPI IDs validated), `DELETE …` (refused while the member's balance ≠ 0 or for the last admin), `POST …/{mid}/invite` → one-time token (7 days, stored hashed), `POST /groups/claim {token}`.
- Expenses: `POST /groups/{id}/expenses` `{description, amount_paise, paid_by_member_id, split: "equal"|"exact", participant_ids?, shares?: [{member_id, share_paise}], category?, expense_date?, idempotency_key?}`; exact shares must sum to the amount. `PATCH …/expenses/{eid}` (an amount change re-splits equally), `DELETE …` voids (creator or admin).
- Settlements: `POST /groups/{id}/settlements` `{from_member_id, to_member_id, amount_paise, method, note?, idempotency_key?}`, capped at min(what `from` owes, what `to` is owed), otherwise 409; `DELETE …/settlements/{sid}` voids.
- Every write returns the group detail: members with `net_paise`, expenses with shares, settlements, `total_spend_paise`, `suggested_settlements`.

## Recurring bills (`/recurring`)
- `GET /recurring` (excludes cancelled) · `POST /recurring` `{name, amount_paise, frequency, start_date, end_date?, category?, account_id?, remind_days_before?}` · `PATCH /recurring/{id}` (status active/paused/cancelled; a cancelled bill can't change: 409).
- `GET /recurring/due?within_days=N`: overdue and upcoming occurrences.
- `POST /recurring/{id}/occurrences/{YYYY-MM-DD}/pay`: the date must be on the schedule (422), the bill must be active (409) and have an account. Posts one ledger expense with key `rec:{bill}:{date}`; repeating it is a no-op. `POST …/skip` marks it skipped.
- Each bill view includes `overdue_dates`, `next_due_date`, `reminder_due`, `history`.

## Admin (staff only; `users.is_admin` set in the database; others get 404)
`GET /admin/overview` (counts only) · `GET/PATCH /admin/tickets` · `GET /admin/feedback` · `PUT /admin/plans` (price optional; never invented).
