# Test Report

## 2026-11-04: Phase 1 verification + Phase 2 batch 1

All results below were actually executed on the founder's Windows laptop (Node 24.18, Python 3.13.14).

### Frontend (repo root)
| Check | Command | Result |
|---|---|---|
| Clean install | `npm ci` (in a clean copy; see note) | ✅ |
| TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| Unit tests | `npx vitest run` | ✅ 71 passed / 7 files |
| Build | `npx vite build` | ✅ (990 kB main chunk warning) |
| Dependency audit | `npm audit` | ✅ 0 vulnerabilities after upgrading vitest 3.2.4 → 4.1.12 (fixed 2 critical tinypool advisories in a dev-only dependency) |

Note: `npm ci` inside the repo folder failed with EPERM because orphaned Node processes from the earlier smoke-test server still held a native module open. The checks were run in a clean copy of the exact working tree instead. Those processes need stopping (or a reboot) before `npm ci` works in the repo folder again.

### Backend (`backend/`)
| Check | Command | Result |
|---|---|---|
| Original foundation tests (before changes) | `pytest` in the original folder | ✅ 1 passed (money helper only) |
| Full suite (SQLite) | `pytest -q` | ✅ **35 passed** |
| Lint (incl. security rules) | `ruff check app migrations tests` | ✅ clean |
| Migration SQL render (PostgreSQL dialect) | `alembic upgrade head --sql` and `alembic downgrade 0002:0001 --sql` | ✅ both render |
| Suite on PostgreSQL | `TEST_DATABASE_URL=… pytest` | ⬜ not run (Docker Desktop not running); runs in CI |
| Live migration up/down/up | `alembic upgrade/downgrade` | ⬜ not run locally; runs in CI |

Coverage of the 35 tests:
- **Auth:** register/login, Argon2 storage, generic errors, lockout, per-IP limit, refresh rotation and reuse detection, logout, password change, forged/expired/wrong-type tokens, weak-secret refusal, headers, body limit, CORS.
- **Ledger:**
  - strict paise validation, derived balances and pending
  - transfers excluded from income/expense, void both legs
  - refund linking and limit, reversal, audited edit and void history
  - idempotent create and transfer
  - local date per time zone, naive timestamp rejection
  - adjustments, AI entries flagged for review, filters, search, pagination
  - report vs reconciliation vs net-worth agreement, credit-card liability, archived accounts
- **Isolation:** cross-user reads and writes on accounts, transactions, refunds, reversals, transfers, budgets and goals all return 404.
- **Planning:** derived budget spend per category with refunds and voids, alerts, rollover, period bounds incl. leap years, goals and withdrawals, export, account deletion.

### Not covered yet
Frontend ↔ backend integration, accessibility, responsive UI after changes, performance, backup/restore, family permissions, imports (Phase 3+).

## 2026-11-04: Phase 2 batch 2
| Check | Result |
|---|---|
| Frontend `tsc` / `vitest` / build | ✅ 0 errors / **75 passed** (adds 4 UPI-link tests) / ✅ |
| `npm ci` in the repo folder | ✅ (the locked-file issue cleared) |
| Backend `pytest` (plain `pytest`, as CI runs it) | ✅ **49 passed** (adds 8 import, 6 family/business tests) |
| `ruff` / `bandit` / `pip-audit` | ✅ clean / 0 issues / 0 vulnerabilities |
| Migration 0003 SQL render (up and down) | ✅ |
| CI run for bc3e901 | ❌ backend "Tests (SQLite)" exit 4 (`ModuleNotFoundError: app`). Reproduced locally with plain `pytest`, fixed with `pythonpath = ["."]`, retested ✅. Frontend job passed |
| PostgreSQL suite, live migrations, restore test | ⬜ not run (no PostgreSQL available) |

Bugs found and fixed by the new tests:
- XLSX "Particulars" header not recognized (the header cleanup stripped a trailing "rs")
- invalid regex range in the date parser
- UPI ID pattern too strict

## 2026-11-05: CI failure "Event loop is closed" + first PostgreSQL verification
**CI run 41817934540 (e5de0c6):** frontend ✅; backend "Tests (SQLite)" ✅; "Tests (PostgreSQL)" ❌ with 10 × `RuntimeError: Event loop is closed` (read from GitHub's public annotations API; raw logs need an authenticated login).

**Reproduced** locally against PostgreSQL 16 (Docker, port 55432): 25 passed, **24 errors**, all in the `fresh_db` fixture setup, raised from asyncpg's pool.

**Root cause:** the process-wide async engine keeps a connection pool, and pytest-asyncio gives each test a new event loop and closes it afterwards. The next test reused a pooled asyncpg connection bound to the closed loop. SQLite passed only because the fixture already disposed the engine for SQLite.

**Fix:** `await engine.dispose()` at the end of every test, on the loop that opened the connections (`backend/tests/conftest.py`). Test harness only; production runs one loop.

| Check (local) | Result |
|---|---|
| Backend suite on PostgreSQL 16 (unraisable warnings as errors) | ✅ **49 passed** |
| Backend suite on SQLite | ✅ 49 passed |
| `alembic upgrade head` → `downgrade base` → `upgrade head` on PostgreSQL | ✅ exit 0 each; head = 0003; 19 tables |
| `alembic check` (models vs migrations) | ✅ "No new upgrade operations detected" |
| **Legacy data migration 0001→0003** with synthetic old-format rows | ✅ every row preserved and mapped: CREDIT→income, deleted→void, `idem:`→idempotency key, other external id→source_ref, unknown source→migration, account-less→"Unassigned (migrated)", UTC→IST local date (31 Oct 20:00Z → 1 Nov), "Savings "→savings, unknown type→other, 4 audit rows |
| **Backup/restore** (`pg_dump -Fc` → `pg_restore` into a new DB) | ✅ counts, net posted paise (473,500), opening balances, schema version and 57 constraints identical |
| Frontend tsc / vitest / build / npm audit | ✅ / 75 passed / ✅ / 0 |
| ruff / pip-audit | ✅ / 0 vulnerabilities |

## 2026-11-05: Phase 3 integration (workspace on D:)
All runs from `D:\BAGLA_FINANCE_WORKSPACE\main-app`; C: free space unchanged by the run (1,635 MB before/after).

| Check | Result |
|---|---|
| Frontend tsc / vitest / build (to `D:\...\builds\dist`) / npm audit | ✅ 0 errors / **88 passed** (10 files) / ✅ / 0 |
| Backend pytest / ruff / bandit / pip-audit | ✅ 49 passed / clean / no issues / 0 |
| Browser E2E, FastAPI on **PostgreSQL** (2026-11-05 a.m.) | ✅ register → empty account (no demo data), local data byte-identical; migration 13 entries + 5 budgets + 3 goals with totals matching (₹50,000 / ₹26,499) and PostgreSQL agreeing to the paisa; re-run added 0; live quick-add reached the server; offline entry queued then synced |
| Browser E2E, FastAPI on **SQLite** (p.m.; Docker unresponsive) | ✅ expired session → "session ended" banner, local data intact; account name shown; edit ₹20→₹25.50 audited (`create`→`update` 2000→2550); delete → `void`, row kept; CSV import 4 rows / 1 flagged / 3 added, re-upload = 3 duplicates, 0 added; family invite (single-use; reuse 400), member sees 0 entries until shared, then only the shared ₹499 with minimal fields, unshared entry by id = 404; support ticket BF-… + rating; trial → cancel keeps access to the end date; coach 96.5% verified against figures; offline→online flush |
| Bug found by E2E and fixed | import category names ("Food") didn't map to app ids ("cat-food") → coach/categories showed "Other"; fixed in `toCategoryId` + test |
| PostgreSQL re-verification this session, Playwright suite | ⬜ Docker unresponsive; no automated browser suite yet (E2E was driven manually in the built-in browser) |

## 2026-11-05: Phase 4 batch 1 (group splits + recurring bills on the server)
- Backend: **56 passed** on SQLite. The 7 new tests cover:
  - allocation and suggestions
  - split, balances, settlement cap/idempotency/void/edit
  - roles, seat claim and UPI validation
  - account deletion keeps the group
  - schedule maths, including month-end and leap year
  - recurring lifecycle with no double posting
  - recurring isolation

  `ruff` clean, `bandit` no findings. Migration 0004 renders up/down offline. **Not run on PostgreSQL locally** (Docker unresponsive); CI runs it.
- Frontend: **92 passed**. The 4 new tests cover server group mapping, exact-vs-equal share payloads, migration id mapping with idempotency keys and invalid-UPI drop, and duplicate-name skip. `tsc` clean, production build OK, `npm audit --omit=dev` 0 vulnerabilities.
- Browser run (built-in browser; FastAPI on a fresh SQLite DB, Vite dev server, local test account):
  1. Created a group from the empty state.
  2. Added ₹100 split three ways. Server shares were 3333/3334/3333 paise; nets sum to 0.
  3. Settled ₹33.33.
  4. Reloaded: everything was kept.
  5. Cleared the browser's group cache and reloaded: the group, expense and settlement were restored from the server.

  A server rejection showed "Group change not saved" and rolled the screen back.
- Found and fixed during the browser run: the empty-state "Create Your First Group" did nothing; the payer id went stale after a server refresh (server 422); "(You) (You)"; a fake invite code.
- Follow-up: voiding a group expense, browser-verified after adding a confirmation (the delete button deleted on one click and was invisible on touch screens). Server: expense `void`, history kept, balances recomputed.
- Not browser-verified this batch: archiving a group, the Subscriptions account flow (covered by API tests), migration of device groups (covered by unit tests).
- Note: the cache clear in step 5 also removed group caches of older test profiles in the built-in browser (localhost test data only).

## 2026-11-05: Phase 4 batch 2 (group integrity, invitations, Family Space, E2E)
- Backend: **68 passed** on SQLite, `ruff` clean, `bandit` no findings, `pip-audit` no known vulnerabilities. New tests:
  - `test_split_integrity.py` (7): void after settlement needs confirmation and keeps history; zero-sum exact balances; personal entry voided once; repeat void is a no-op; concurrent voids apply once; concurrent settlements can't overpay (3 parallel → 1 created, 2 refused); permissions (member can't void others', can't mirror into someone else's account, admin void flags the payer's entry); edit updates the mirror; a refund blocks void and edit; invite codes expire, replace each other, are single-use and admin-only, with no takeover of linked seats and access revoked on removal.
  - `test_family_space.py` (4): only shared entries count (exact paise; private entries absent from the payload); budgets incl. overspend; goals and contributions with roles and idempotency; one family can't reach another's summary/activity/goals/budgets/unshare; a removed member loses access.
  - `test_config_limits.py` (1): `AUTH_RATE_LIMIT` can't be loosened in staging/production.
- The concurrency tests initially **failed** (two of three parallel settlements were accepted on SQLite; a second void raised an error). Fixed with the group version check (DECISIONS D11). Then 8 consecutive green runs.
- Migrations: base→head renders for PostgreSQL (28 tables), head→base drops all; 0005 and 0006 render both ways. Not run on a live PostgreSQL locally (Docker unresponsive); the CI backend job runs up/down/up on PostgreSQL.
- Frontend: **97 passed**, `tsc` clean, build OK, `npm audit` 0 vulnerabilities.
- **Automated browser suite (Playwright 1.64.1, Chromium):** `npm run e2e` starts the real FastAPI (fresh SQLite DB, random secret) and Vite; synthetic accounts are generated per test and kept in memory only. **12/12 passed** (56.6 s):
  1. Registration, reload persistence, sign-in on a fresh browser profile.
  2. Wrong password refused.
  3. Transaction create → edit → void, checked on the server in paise (25075 → 30010 → void kept).
  4. Budgets and goals saved and kept after reload.
  5. Statement import: preview, add 3, re-upload shows 3 duplicates and "Add 0" disabled.
  6. Groups, two accounts: group from the empty state, no invented UPI IDs, ₹100 → 3333/3334/3333, personal entry, invite code, invalid-code message, join, single-use code, settlement from the other account, void with the payback explanation, settlement kept, personal entry voided, removal refused while owed.
  7. Family, two accounts: create, invite (adult), join, explicit share, private entry absent in the UI and the API, direct read refused (404), budget overspend, goal with per-member contributions, privacy reset, activity.
  8. Recurring: weekly bill, ₹520/month, mark paid exactly once (a repeat API call adds nothing), skip, edit amount, pause/resume, cancel with confirmation.
  9. Support request and plan screen ("Paid plans aren't available yet"; no prices).
  10. Offline: queued while offline, synced exactly once on reconnect.
  11. Expired session: "session ended" banner, local change kept, synced after signing in again.
  12. Mobile (Pixel 7): bottom bar and More drawer navigation; no horizontal scroll.
- Bugs the suite found (fixed): Goals nav opened Budgets; "₹8,000.5" formatting; 86 px header overflow on phones; expired session shown as a generic sync error; refresh 422 retried forever; unlabelled add-expense fields; the member-card "Settle" and edit-form flows needed stable markup.
- **PostgreSQL browser verification: pending locally.** The new CI `e2e` job runs the same suite on PostgreSQL 16; see that run's result.

## 2026-11-06: Release hardening (Phases 0-6)
All results below were observed in this session. Local PostgreSQL ran in throwaway containers (tmpfs); the live database was never written.

| Suite | Result |
|---|---|
| Backend, SQLite | **90 passed** |
| Backend, PostgreSQL 16 (local) | **90 passed** |
| Migrations up → down → up to `0008_notifications` (PostgreSQL) | **PASS**; `alembic check`: no drift |
| Frontend unit (Vitest) | **99 passed** |
| TypeScript (`tsc --noEmit`) | **0 errors** |
| Production build | **PASS** |
| Browser E2E (Playwright, Chromium), SQLite | **17/17** |
| Browser E2E, PostgreSQL 16 (local) | **17/17** |
| GitHub Actions | 7fe3ad6 ✅, dab9b36 ✅, 6ae17a9 ✅ (frontend, backend, e2e on PostgreSQL); later commits: see CI |
| ruff / bandit / pip-audit / npm audit | clean / no findings / no known vulns / 0 vulns |
| axe WCAG 2 A/AA, 11 screens (light, empty data) | **0 violations** (was 3 critical + 66 serious) |

New tests this batch:
- Cookie auth (4) and the route-wide auth sweep.
- Cross-account id probes, no secrets in responses, export coverage, account deletion with shared data.
- Share-ledger invariants (6), including a seeded randomized sequence.
- Reminders (7).
- E2E: cookie upgrade, group edit/undo, reminder preferences, every-screen sweep with axe, keyboard-only entry.

Defects found and fixed:
- Logout revoked the session before the CSRF check.
- Concurrent refresh created two sessions on SQLite.
- A refunded share entry could fall out of step with its group.
- The reminder queue crashed after a duplicate rollback.
- Notification index drift between model and migration.
- Unlabelled filter selects.
- WCAG contrast failures.
- CSV formula injection and broken quoting in the transactions export.
- The export omitted recurring bills, groups, family and reminders.
- Chart axis showed "₹0.004k".

Not tested:
- Dark-mode accessibility; Firefox/Safari.
- Real email or push delivery (no provider).
- The AI routes with a live Gemini key.
- Load and performance.
