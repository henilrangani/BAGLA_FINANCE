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
