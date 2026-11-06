# Pre-Beta Security and Privacy Checklist

_Status as of 2026-11-06. ✅ verified by automated tests (see TEST_REPORT) · 🟡 partly · ⬜ open · ★ needs founder/counsel._

## Authentication and sessions
- ✅ Argon2id passwords; per-account lockout; auth rate limit (≤ 20 per 15 min per IP in prod, enforced by config)
- ✅ Refresh token in an HttpOnly, Secure, SameSite=Lax cookie scoped to `/api/v1/auth`; atomic rotation; replay revokes all sessions
- ✅ CSRF: custom header + Origin allow-list on cookie endpoints, checked before any state change
- ✅ Logout, logout-all, expiry, legacy-token upgrade (browser E2E in Chromium, Firefox and WebKit)
- 🟡 Rate limits are in memory per process; use a shared store before running more than one API instance

## Authorisation and isolation
- ✅ Every non-public route requires a valid token (route-table sweep); public routes: register, login, refresh, `/health`, `/health/jobs`
- ✅ Cross-account id probes return 404 across ledger, budgets, goals, recurring, groups and family
- ✅ Family: private unless shared; roles enforced on the server; cross-family isolation; removal revokes sharing
- ✅ Groups: membership required; admin-only actions; nobody writes another member's ledger

## Data protection
- ✅ No password or token hashes in responses or exports; no server secrets in the web bundle
- ✅ Statement import limits (700 KB, 5,000 rows), XXE protection; CSV export formula-injection guard
- ✅ Export covers all personal-data categories; deletion keeps shared spaces working for others
- 🟡 Audit trail: append-only `audit_events` for financial changes; retention policy ⬜ ★
- ⬜ Encryption at rest: provided by the managed database ★ (confirm on the chosen host)
- ⬜ Secrets in the host's secret store only; rotate `JWT_SECRET` procedure documented (ENVIRONMENT.md)

## Local environment (this computer)
- ⬜ ★ The legacy PostgreSQL container listens on all interfaces with the default password, and Redis on `0.0.0.0:6379`. Bind both to 127.0.0.1 or stop them (needs approval; see LEGACY_DATA_PROCEDURE.md)

## AI
- ✅ Advisory only: the AI code has no database or ledger API access; it can't create entries or initiate payments
- ✅ Outputs re-validated; low-confidence amounts flagged for review; user click required for any action
- 🟡 Prompt injection: user text is data in prompts, and outputs are parsed and validated, so injected instructions can't trigger actions. A live red-team with a real key isn't done ⬜

## Legal and consent ★
- ⬜ Privacy notice and terms reviewed by counsel (drafts: `PRIVACY_NOTICE_DRAFT.md`, `TERMS_DRAFT.md`)
- ⬜ Grievance contact; retention schedule; breach-notification process; children's onboarding rules
- ⬜ Consent records (server-side) for optional features (AI, email)

**Do not claim:** regulatory authorisation, bank verification, payment initiation, investment advice, end-to-end encryption, or certifications.
