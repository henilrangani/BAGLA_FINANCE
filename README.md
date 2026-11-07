# Bagla Finance

> **Every Rupee. Clearly Managed.** An India-first personal, group and family finance app.

**Status (2026-11-06): pre-beta.** Not deployed. No bank, UPI app or Account Aggregator is connected. No payment gateway is connected, and paid plans aren't offered. Email isn't sent (no provider). See `RELEASE_READINESS.md` and `KNOWN_LIMITATIONS.md`.

## What works (tested; see `TEST_REPORT.md`)
- **Accounts and sessions:** email/password (Argon2id). Access token in memory; refresh token in an HttpOnly, Secure, SameSite cookie with rotation and CSRF protection.
- **Ledger in integer paise:** income, expense, transfers (never counted as spending), refunds linked to the original, reversals, and voids with history. Statement import (CSV/XLSX) with duplicate detection.
- **Budgets and goals.** Recurring bills with due dates, mark-paid-once, skip, pause, and reminders (in app; quiet hours; opt-out).
- **Group splits:**
  - Equal or exact shares, minimum-transfer suggestions, settlements capped at what's owed.
  - One-time invite codes, edit and void with explanations.
  - Your own ledger records **only your share**; money you fronted or got back is tracked as transfers.
- **Family Space:** members and roles, entries private unless their owner shares one, shared budgets and goals, per-member contributions, and an activity feed.
- **Device-only mode:** works without an account; data stays in that browser. You can move it into an account later.
- **AI is advisory only:** it can suggest, never change your ledger or start a payment.

## Run locally
```bash
# Backend (Python 3.13)
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt   # (bin/ on macOS/Linux)
export DATABASE_URL=postgresql+asyncpg://bagla:PASS@127.0.0.1:55432/bagla_dev  # backend/docker-compose.yml; never 5432 (legacy DB) JWT_SECRET=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
.venv/Scripts/python -m alembic upgrade head      # read DEPLOYMENT_RUNBOOK.md before upgrading an existing DB
.venv/Scripts/python -m uvicorn app.main:app --port 8000
# Web app
npm ci && VITE_API_URL=http://127.0.0.1:8000 npm run dev
```
All settings: `ENVIRONMENT.md`.

## Tests
```bash
npm test                 # unit tests (Vitest)
npm run lint             # TypeScript
npm run e2e              # browser suite (Playwright): real API on a fresh SQLite DB + Vite
cd backend && pytest -q  # backend; TEST_DATABASE_URL=postgresql+asyncpg://… runs it on PostgreSQL
```
CI (`.github/workflows/ci.yml`) runs:
- Frontend checks.
- The backend on SQLite and PostgreSQL 16.
- Migrations up/down/up plus `alembic check`.
- The browser suite on PostgreSQL.

## Documentation
| Topic | File |
|---|---|
| Architecture and decisions | `ARCHITECTURE.md`, `DECISIONS.md` |
| API and database | `API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md` |
| Deployment, backups, rollback | `DEPLOYMENT_RUNBOOK.md`, `DISASTER_RECOVERY.md`, `RUNBOOK.md` |
| Security and privacy | `SECURITY_AUDIT.md`, `SECURITY_CHECKLIST.md`, `PRIVACY_COMPLIANCE_READINESS.md` |
| Testing | `TEST_REPORT.md` |
| Release readiness | `RELEASE_READINESS.md`, `LAUNCH_CHECKLIST.md`, `KNOWN_LIMITATIONS.md` |
| Costs and support | `COST_ANALYSIS.md`, `CUSTOMER_SUPPORT_GUIDE.md` |

No compliance certification, bank partnership or end-to-end encryption is claimed.
