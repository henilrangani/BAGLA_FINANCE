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
