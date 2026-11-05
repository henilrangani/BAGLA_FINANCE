# Launch Checklist & Release Readiness

## Current classification: **NOT READY**
The backend is built and tested, but the React app doesn't use it yet. Users still have browser-only data, there are no sign-in screens, and nothing has run on a live PostgreSQL locally or been deployed.

| Gate | Status | Evidence / gap |
|---|---|---|
| 1 Functionality | ❌ | Frontend works on its own; backend is API-only; integration (Phase 3) not started |
| 2 Financial accuracy | 🟡 | 75 frontend + 49 backend tests cover paise maths, splits (₹100/3, ₹100.01/5), refunds, transfers, budgets, rollover, imports; dashboard doesn't yet read the server ledger |
| 3 Security | 🟡 | No known critical issues open (`SECURITY_AUDIT.md`); no pen test; RLS and shared rate limits pending |
| 4 Data safety | 🟡 | Export ✅, delete ✅; on PostgreSQL: migrations up/down/up ✅, legacy-data mapping ✅, local dump/restore ✅; production backups and browser→server migration not done |
| 5 Quality | 🟡 | Unit and API tests ✅; CI configured; end-to-end (Playwright) not built |
| 6 Performance & accessibility | ❌ | Not measured (990 kB bundle noted); no accessibility audit |
| 7 Operations | 🟡 | Runbook, deployment and DR docs ✅; no monitoring, no deployment |
| 8 Customer experience | 🟡 | Support and feedback APIs ✅; no UI, no email |
| 9 Marketing | ⬜ | Deliberately deferred until the product is verified |
| 10 External approvals | ⬜ | List below |

## Founder actions / approvals needed
1. (Done 2026-11-05: Docker Desktop is running; local PostgreSQL checks pass.)
2. Choose hosting (frontend, backend, Postgres with backups); see `COST_ANALYSIS.md`.
3. Decide an email provider (verification, password reset, support notifications).
4. Legal review using `PRIVACY_COMPLIANCE_READINESS.md`; privacy notice and terms.
5. Subscription prices (none are set; the code never invents them) and a payment gateway with merchant KYC, when ready.
6. Approve any merge to `main` and any production deployment.
