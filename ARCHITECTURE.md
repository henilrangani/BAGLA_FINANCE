# Architecture

_Updated 2026-11-04 (end of the Phase 2 first batch)._

## Today
```
Browser (React 19 + Vite + Tailwind)          Express (server.ts) / Vercel functions (api/)
  └─ data in localStorage (single device) ──►  /api/ai/*  Gemini proxy + fallbacks (lib/ai.ts)
                                               /api/webhooks/payment-sync (signed, stores nothing)

FastAPI backend (backend/)  ◄── not yet called by the React app
  ├─ /api/v1/auth      register, login, refresh (rotating), logout, change password
  ├─ /api/v1/users     me, update, export, delete account
  ├─ /api/v1/accounts  accounts with derived balances
  ├─ /api/v1/transactions  ledger entries, transfers, refunds, reversals, void, history
  ├─ /api/v1/budgets, /goals  derived spent / saved
  └─ /api/v1/reports   summary, net worth, reconciliation
        │
        ▼
  PostgreSQL 16 (Alembic migrations)  — SQLite used only by the test suite
```

## Target (Phase 3 onward)
- The React app keeps its screens, but its state source moves from `localStorage` to the FastAPI API behind a sync layer. Offline entries are queued locally and posted with idempotency keys.
- The AI routes stay in the Node layer for now (already hardened). The ledger is FastAPI-only, and AI never writes to it directly.
- A one-time, user-initiated import moves existing browser data into the server ledger. It never deletes `localStorage` (see `DATABASE_SCHEMA.md`, "Browser data migration").

## Key design rules
1. **Ledger is the source of truth.** Balances, budget spend, goal progress and reports are all computed from posted entries, never stored.
2. **Integer minor units.** All money is BIGINT paise in the database and strict integers in the API.
3. **Nothing is silently rewritten.** "Delete" means void. Every create, edit, void and reversal writes an `audit_events` row.
4. **Linked entries.** A transfer is two legs sharing `transfer_group_id`. A refund references its expense and can't exceed it. A reversal references the entry it reverses, once.
5. **Tenant isolation in every query.** Every read and write filters by the authenticated user, and other users' rows return 404. PostgreSQL row-level security is planned as a second layer (see `SECURITY_CHECKLIST.md`).
6. **Retries are safe.** `Idempotency-Key` on writes, enforced by a unique (user_id, idempotency_key) constraint.
