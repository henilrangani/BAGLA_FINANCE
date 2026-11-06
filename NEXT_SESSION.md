# Next Session: Continuation Point

_Updated 2026-11-05 (Phase 4 batch 2: group integrity, invitations, Family Space, automated E2E)._

## Workspace (moved off C:)
- Repo: `D:\BAGLA_FINANCE_WORKSPACE\main-app` (branch `phase-1-security-money`). The old copy at `C:\Users\henil\OneDrive\Desktop\BAGLA_FINANCE_GITHUB_WORK` is stale; don't edit it. The founder decides whether to remove it.
- Before running dev commands: `source /d/BAGLA_FINANCE_WORKSPACE/env.sh` (Bash) or `. D:\BAGLA_FINANCE_WORKSPACE\env.ps1`. This puts TEMP, npm/pip caches, pytest temp and Playwright output on D:.
- Backups: `D:\BAGLA_FINANCE_WORKSPACE\backups\` (repo bundle, Phase 3 snapshot bundle, local ref `refs/backups/phase3-2026-11-05`).
- `CLAUDE_CODE_TMPDIR` is set at Windows user level but **wasn't inherited** by the Claude session (fully quit Claude from the system tray or sign out/in).

## Blocked
- **Docker Desktop unresponsive** (`docker version` times out). Restart Docker Desktop (not reset), then move its disk via Settings → Resources → Advanced → Disk image location → `D:\BAGLA_FINANCE_WORKSPACE\docker-data`. Then re-run the backend suite on PostgreSQL and the migration up/down/up.

## Phase 3: done
Account mode, sync/outbox, migration, Account features (import, family, support, plan), transaction edit + confirmed delete, account name, rule-based coach. All browser-verified (see TEST_REPORT 2026-11-05).

## Phase 4 batch 1: done (2026-11-05)
Server-backed group splits (`/api/v1/groups`) and recurring bills (`/api/v1/recurring`), migration 0004, Groups + Subscriptions screens in account mode, migration of device groups/bills. See TEST_REPORT.

## 2026-11-06: release hardening done
Commits on `phase-1-security-money`: 7fe3ad6 (cookie auth), dab9b36 (share-only group accounting), 6ae17a9 (reminders, edit, undo), 7c64386 (QA/a11y), then docs and export. Backend 90 passed (SQLite and PostgreSQL), frontend 99, E2E 17/17 (SQLite and PostgreSQL). See RELEASE_READINESS.md.

**Open decisions:**
1. Existing local DB at rev 0001: meaning of `balance_paise` before any upgrade (`DATABASE_AUDIT_2026-11-06.md`).
2. Hosting and the same-origin rewrite.
3. Email provider.
4. Legal review.

## Phase 4 batch 2: done (2026-11-05)
Group void integrity + invitations UI, Family Space on the server, recurring edit, Playwright suite (`npm run e2e`, 12 journeys) + CI `e2e` job on PostgreSQL. See TEST_REPORT and RELEASE_READINESS.md.

## Do next (current)
1. Check CI for this commit, especially the new `e2e` job (first PostgreSQL browser run) and migrations 0005/0006.
2. Groups: expense edit UI, member edit (name/UPI), undo-a-settlement button, partial settlements.
3. Refresh token → httpOnly cookie; email delivery for invites/password reset (needs a provider; founder decision).
4. Restart Docker Desktop (no reset) → move its disk image to `D:\BAGLA_FINANCE_WORKSPACE\docker-data` via Settings; run `TEST_DATABASE_URL=… pytest` and `E2E_DATABASE_URL=… npm run e2e` locally on PostgreSQL.
5. i18n (en/hi/gu), Simple/Pro mode, accessibility pass (labels found missing in the add-expense modal suggest more).

## Running the browser suite
`source /d/BAGLA_FINANCE_WORKSPACE/env.sh && npm run e2e` (starts FastAPI on 8010 with a fresh SQLite DB in `D:\BAGLA_FINANCE_WORKSPACE\test-results\e2e-run\`, and Vite on 3010). Results and traces go to `D:\BAGLA_FINANCE_WORKSPACE\test-results\playwright\`. No credentials file is needed or created.

## Do next (batch 1 list, kept for history)
1. Confirm CI green for the Phase 4 batch 1 commit (migration 0004 on PostgreSQL runs there).
2. Groups screen: seat-invite/claim UI, void/archive browser check, expense edit.
3. Family space screen (`FamilyView`) on `/api/v1/families` in account mode.
4. Automated Playwright suite against the real backend (browsers in `D:\BAGLA_FINANCE_WORKSPACE\playwright-browsers`).
5. RELEASE_READINESS.md with feature classification and go/no-go.
6. Re-verify on PostgreSQL once Docker works.

## Local E2E setup (SQLite, no Docker)
- DB folder: `D:\BAGLA_FINANCE_WORKSPACE\test-results\e2e\`. The schema is created from the models by `mkdb.py` (alembic doesn't run on SQLite). Test credentials are in `creds.txt` there (local only, never committed).
- API (from `backend/`): `DATABASE_URL=sqlite+aiosqlite:///D:/BAGLA_FINANCE_WORKSPACE/test-results/e2e/groups_e2e.db JWT_SECRET=<random> ENVIRONMENT=development .venv/Scripts/python -m uvicorn app.main:app --port 8000`
- App: `VITE_API_URL=http://127.0.0.1:8000 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3000`

## Earlier list
1. Confirm CI green for the Phase 3 commit.
2. Re-verify on PostgreSQL once Docker works.
3. Add an automated Playwright suite for the flows verified manually (Playwright browsers → `D:\BAGLA_FINANCE_WORKSPACE\playwright-browsers`).
4. Server models for group splits, recurring bills and the family space (still device-only).
5. Refresh token → httpOnly cookie; i18n (en/hi/gu); Simple/Pro mode; accessibility and performance passes.
