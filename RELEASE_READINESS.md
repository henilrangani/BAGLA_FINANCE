# Release Readiness

_As of 2026-11-05, branch `phase-1-security-money` (not merged to main, not deployed)._

## Recommendation: **NO-GO for a public launch. GO for a closed beta of up to ~20 invited testers**
The closed beta is conditional on CI being green, including the new PostgreSQL `e2e` job, and on hosting decisions.

The core money flows are now server-backed, exact to the paisa, and covered by automated browser tests. Public launch is blocked by items that need founder decisions or outside work:
- A production host and a managed PostgreSQL with backups.
- Email/SMS delivery for password reset and invites.
- The refresh token in localStorage.
- No legal or compliance review (DPDP) and no external security test.
- Rate limits held in memory.
- Marketing copy and sample data that still mention integrations which don't exist.

## Feature classification

**Complete and verified** (unit/API tests + automated browser journey):

| Feature | Evidence |
|---|---|
| Account registration, sign-in, session persistence, wrong password | E2E auth (2), backend auth tests |
| Transactions: create, edit, void (audited, kept as history), exact paise | E2E money #1, ledger tests |
| Budgets and goals saved to the account | E2E money #2 |
| Statement import (CSV) with preview and duplicate detection | E2E money #3, import tests |
| Group splits: exact shares, settlements, invitations (single-use, expiry), safe void with payback explanation, linked personal entry | E2E groups, `test_splits_recurring`, `test_split_integrity` |
| Family Space: invite, roles, explicit sharing, privacy (private entries never exposed), budgets, goals, contributions, activity, privacy reset, cross-family isolation | E2E family, `test_family_space`, `test_family_and_business` |
| Recurring bills: add, monthly total, mark paid exactly once, skip, edit, pause/resume, cancel | E2E recurring, recurring API tests |
| Offline queue and reconnect sync (exactly once) | E2E resilience #2 |
| Expired session handling | E2E resilience #3 |
| Support requests | E2E resilience #1 |
| Mobile navigation without horizontal scroll | E2E mobile |

**Implemented, not fully verified:**
- Everything above on **PostgreSQL in a browser**: the CI job exists; local run blocked by Docker.
- XLSX import: tested in the API, not in the browser.
- Migration of device data to an account (groups/bills): unit-tested, not browser-tested in this batch.
- Account deletion with shared groups: API-tested.
- Plans/trials: API-tested; the UI shows "Paid plans aren't available yet" because no plan is configured.

**Partially implemented:**
- Groups: no UI for expense edit, member edit or undoing a settlement (API supports them).
- Reminders: due dates computed; nothing is sent.
- AI Coach: rule-based figures (no invented numbers); AI chat needs a Gemini key and was not re-verified this batch.

**Not implemented:**
- Email/SMS (password reset, invites), push notifications, MFA.
- Bank/UPI/Account Aggregator connections (the "Payment sync" demo is simulated and labelled so).
- i18n, Simple/Pro mode.
- PDF statement import.

**Blocked:**
- Local PostgreSQL verification and the Docker disk relocation: Docker Desktop unresponsive; needs a founder restart (no reset).

## Security and privacy status
See SECURITY_AUDIT.md (2026-11-05 batch 2): scans clean; access control and privacy covered by tests; no external pen test; no compliance claims made.

## Before a public launch (founder decisions marked ★)
1. ★ Hosting plus managed PostgreSQL with automated backups and a restore drill.
2. ★ Email provider (password reset, invites).
3. Refresh token to an httpOnly cookie; Redis-backed rate limits.
4. ★ Legal review (privacy policy, terms, DPDP readiness) and an external security test.
5. Honest marketing copy review (landing page, sample data).
6. A green CI run including `e2e` on PostgreSQL, plus a manual exploratory pass on a real phone.
