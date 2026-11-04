# Build Status

_Last updated: 2026-11-04 · branch `phase-1-security-money`_

## Phase 2: backend and database. Status: batch 1 done (backend core); integration not started

| Area | Status |
|---|---|
| Auth (register, login, refresh rotation, logout, lockout, change password) | Implemented and tested (SQLite) |
| Ledger (accounts, transactions, transfers, refunds, reversals, void, audit, idempotency) | Implemented and tested (SQLite) |
| Budgets, goals, reports, reconciliation, export, delete account | Implemented and tested (SQLite) |
| Migration 0002 (data-preserving) | Implemented; SQL renders; **not yet run on live PostgreSQL** |
| Tests on PostgreSQL | Configured in CI; not run locally |
| Frontend ↔ backend connection | Planned (Phase 3) |

Backend: 35 tests passed, ruff clean. Frontend: 71 tests, typecheck and build pass; `npm audit` 0. See `TEST_REPORT.md`.

## Phase 1: security and money correctness. Status: done, commit `24540ba` (pushed to the dev branch; not deployed)

| Check | Result | Command |
|---|---|---|
| TypeScript | ✅ 0 errors | `npm run lint` |
| Unit tests | ✅ 71 passed (7 files) | `npm test` |
| Production build | ✅ passes (main JS chunk ~990 kB, size warning) | `npm run build` |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities (checked during the audit, before Vitest was added) | `npm audit --omit=dev` |
| Local server smoke test | ✅ see below | `npm run dev` + curl |
| Browser check (built-in browser) | ✅ app loads, no console errors; PIN, migration and split flows checked | manual |

### What the server smoke test covered (2026-11-04, local, no Gemini key)
- Security headers present on `/`.
- `parse-expense` fallback returns `amount: 0` when no amount is given, and never ₹100.
- Form-encoded POST → 415. Cross-origin `Origin` → 403. 7 MB body → 413. Malformed JSON → 400. Unknown `/api/*` → JSON 404.
- Webhook: unsigned → 401, valid signature → 200 `verified_not_stored`, replay → 409.
- Rate limit: 11th receipt scan in 10 minutes → 429.

### What the browser check covered
- Setting a PIN stores only a PBKDF2 hash (no plain-text PIN anywhere in storage).
- Locked app: `1234` is rejected; the real PIN unlocks.
- A legacy plain-text PIN in storage is hashed and deleted on load.
- A ₹100.01 group expense among 5 people is stored as 20.01 + 4 × 20.00, which sums to exactly 10,001 paise.

### Not verified
- **Vercel deployment** of the new `api/` wrappers, including raw-body reading for the webhook. Test on a preview deployment before production.
- **Live Gemini calls.** No API key was used. The model name `gemini-3.7-flash` is unchanged from before and its availability has not been checked; it's configurable via `GEMINI_MODEL`.
- Mobile layouts and screen readers after the text changes.

## Next phase (needs founder decisions)
See `KNOWN_LIMITATIONS.md`. The big item is real accounts and a server database, so the ledger stops living only in browser storage.
