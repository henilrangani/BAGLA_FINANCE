# Next Session: Continuation Point

_Updated 2026-11-04 at the end of Phase 2, batch 2._

## State
- Branch `phase-1-security-money` (commits: Phase 1 `24540ba`, Phase 2 batch 1 `bc3e901`, batch 2 = the latest commit). `main` is untouched.
- Backend (`backend/`): auth, ledger, budgets, goals, reports, **statement imports (CSV/XLSX)**, **family sharing with roles**, **support tickets, feedback**, **Bagla plans/trials/cancel**, **staff admin**. Migrations 0001→0003. 49 tests pass; ruff, bandit and pip-audit clean.
- Frontend: 75 tests pass. **Still not connected to the backend.**
- CI: the first run (bc3e901) **failed** on backend tests because of an import path issue. Fixed in batch 2 (`pythonpath` in `pyproject.toml`). Check the next run's result via
  `https://github.com/henilrangani/BAGLA_FINANCE/actions`.
- Release status: **NOT READY** (see `LAUNCH_CHECKLIST.md`).

## Founder blockers
1. Docker Desktop off: no local PostgreSQL, migrations, or restore test.
2. Hosting, email provider, legal review and pricing decisions (`LAUNCH_CHECKLIST.md`).

## Do next, in order
1. Check CI; fix anything the PostgreSQL run or `alembic check` reveals.
2. **Phase 3, frontend integration** (highest value):
   - `src/api/client.ts`: base URL from `VITE_API_URL`, access token in memory, refresh token handling, retry on 401 with refresh, idempotency keys on writes.
   - Sign-in / register screens; local-only mode stays available.
   - Sync layer: `FinanceContext` reads accounts, transactions, budgets and goals from the API when signed in; offline queue.
   - "Move my data to my account": export local JSON → POST to a new `/api/v1/migrations/local-import` endpoint (idempotent keys from local ids, paise conversion, before/after totals) → mark local data migrated, never delete it.
   - Wire the Import screen to `/imports/preview` → review table → commit.
   - Family screen → `/families`; Support/feedback screens; subscription status banner.
3. Backend: consent records, categories table, recurring bills plus a reminder scheduler (server-side, time-zone aware, quiet hours), notifications table, Postgres RLS, shared rate limiter.
4. Playwright end-to-end tests; accessibility and performance passes; Simple/Pro mode; i18n (en/hi/gu).
5. Backup/restore test once Postgres is available; then staging (needs hosting approval).

## Quick verification
```bash
npm run lint && npm test && npm run build
cd backend && .venv/Scripts/pytest.exe -q && .venv/Scripts/ruff.exe check app migrations tests && .venv/Scripts/bandit.exe -q -r app
```
