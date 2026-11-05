# Changelog

## Unreleased (Phase 3: React ↔ FastAPI integration), 2026-11-05
- **Account mode:** sign in/register screen; separate storage profile per account (on-device data never modified); access token in memory, refresh token rotated.
- **Sync:** pull accounts/transactions/budgets/goals; durable outbox with idempotency keys (`local:<id>`); offline queue; sync on reconnect and when leaving offline mode; status banner (offline / error / session ended).
- **Migration:** "Move my data to this account". Copies income/expense entries, budgets and goals, verifies totals, safe to re-run, never deletes local data.
- **Account features screen:** statement import (preview → review → add), family (create, invite code, join, per-entry share/unshare), support tickets + rating, plan (trial / cancel / resume).
- **Transactions:** new Edit form (validated paise input); delete now asks for confirmation and becomes an audited server void.
- **Fixes:** dead "Goals" nav item; "delete all data"/reset no longer wipe other profiles; demo data blocked in account mode; server category names mapped to app ids; account holder's name shown (no "Henil" default); removed a hardcoded personal email and personal UPI ID from defaults, sample groups and newly created groups; dashboard coach is now a real rule-based calculation.
- Tests: frontend 71→88 (mappers, coach, UPI); backend 49.

## Unreleased (Phase 2 batch 2: imports, family, support, billing), 2026-11-04
- **Statement imports:** CSV + XLSX (defusedxml-protected), Indian bank header detection, Debit/Credit, Dr/Cr and signed amounts, Indian date formats, keyword categories, duplicate detection against the ledger, preview → commit, idempotent re-import.
- **Family:** groups, roles (admin/adult/child/viewer), single-use invites, explicit per-entry sharing, removal revokes sharing, last-admin protection.
- **Support** tickets with references and automatic priority; **feedback** capture.
- **Bagla plans:** 7-day trial, cancel keeps access to the end of the period, resume, billing history, server-side entitlement; no prices invented, no gateway.
- **Staff admin:** overview counts, tickets, feedback, plans; no access to user transactions.
- **Security:** fixed UPI intent parameter injection (`src/utils/upi.ts`); `pytest` 9.0.3; bandit finding fixed; family data loss on account deletion prevented.
- **CI:** fixed backend import path; actions updated for Node 24.
- Migration 0003 (additive). Backend tests 35 → 49; frontend 71 → 75.
- **Docs:** SECURITY_AUDIT, PRIVACY_COMPLIANCE_READINESS, COST_ANALYSIS, DISASTER_RECOVERY, CUSTOMER_SUPPORT_GUIDE, LAUNCH_CHECKLIST, USER_TESTING_GUIDE.

## Unreleased (Phase 2 batch 1: backend ledger and auth), 2026-11-04
- Added `backend/`: the FastAPI service, copied from the local foundation and extended.
- **Auth:** Argon2id, rotating hashed refresh tokens with reuse detection, logout/logout-all, password change, lockout, per-IP limits, timing-equalized login, strong-secret enforcement.
- **Ledger:**
  - accounts with derived balances
  - transactions with kind, status, source, local date and time zone
  - linked transfers, capped refunds, single reversals
  - audited edits, void instead of delete, full history
  - idempotency keys
- **Budgets** (period, category, rollover, alerts) and **savings goals** (deposits and withdrawals), all derived.
- **Reports:** summary (income, net spend, refunds, outflow buckets, cash vs digital, categories, days, accounts), net worth, reconciliation.
- **Users:** profile update, full data export, self-service account deletion.
- Migration 0002: data-preserving upgrade from 0001, with downgrade.
- 35 backend tests; ruff with security rules; pinned requirements; non-root Dockerfile; local-only compose credentials.
- GitHub Actions CI: frontend checks, backend on SQLite and PostgreSQL, migrations up/down/up.
- Frontend: vitest upgraded to 4.1.12 (fixes 2 critical advisories in a dev dependency).

## Phase 1 (security and money correctness), 2026-11-04, commit 24540ba

### Security
- Removed the hardcoded `1234` master PIN. The PIN is now stored only as a salted PBKDF2-SHA256 hash, with an increasing wait after wrong attempts. Legacy plain-text PINs are migrated automatically.
- Webhook: real HMAC-SHA256 signature check, a 5-minute timestamp window and replay rejection. It's disabled unless `WEBHOOK_SECRET` is set, and no longer logs payloads.
- API: input validation and size limits, JSON-only requests, cross-origin blocking, per-IP rate limits, 20-second AI timeouts, `no-store` caching and clean error responses.
- Security headers, plus a Content-Security-Policy in production (Express and `vercel.json`).
- Prompt-injection mitigation: user data is passed to the model as quoted data, and all model output is re-validated.
- Data minimization: AI chat and the daily summary no longer send full transactions (receipt images, notes, ids) to the server.
- The server binds to 127.0.0.1 by default; `X-Powered-By` is removed.
- Offline mode now actually blocks AI and API requests.
- Account Aggregator and SMS consent default to off.

### Money and ledger
- New `src/utils/money.ts`: integer-paise arithmetic, strict INR input parsing (no more than 2 decimals), largest-remainder splitting.
- New `src/utils/ledger.ts`: derived budget spend, exact totals, cash-wallet apply and reverse.
- Fixed: every expense was added to every monthly budget.
- Fixed: group splits rounded to whole rupees and lost the remainder. Legacy groups are re-balanced.
- Fixed: paying a settlement and then adding an expense wiped the paid history and re-created the debt.
- Fixed: edits and deletes didn't update the cash wallet; the cash balance was clamped at ₹0.
- Fixed: flagged duplicates counted in totals.
- Fixed: dates used UTC, so entries made in India before 5:30 AM landed on the previous day.
- Fixed: Analytics added the profile's income estimate on top of recorded income.
- Fixed: transfers counted as expenses in the dashboard chart.
- Added the `transfer` and `refund` transaction types.
- CSV import: quote-aware, handles Indian amounts and dates, takes an optional Type column, reports bad rows instead of guessing.
- Removed invented amounts: the fake ₹680 receipt on scan failure, the ₹100 parse default, the ₹500 and ₹5,000 chat-action defaults, the ₹5,800 simulator default, and the ₹1,500 and ₹2,000 daily-summary figures.
- Low-confidence AI entries are marked `pending_review`.
- Corrupt `localStorage` no longer crashes the app.

### Honesty
- Removed claims of "AES-encrypted", "air-gapped", "DPDP & RBI AA Compliant" and "Auto-Sync", and corrected the README.

### Tooling
- Added `package-lock.json`, Vitest and `npm test` (71 tests).
- Server logic is unified in `lib/`; `server.ts` and `api/*` are now thin wrappers.
