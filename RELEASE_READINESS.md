# Release Readiness

_2026-11-06 · branch `phase-1-security-money` · not merged, not deployed._

## Recommendation
- **Public launch: NO-GO.**
- **Closed beta (≤ ~20 invited testers): technically ready**, once these founder steps are done:
  1. Choose hosting, with the same-origin `/api/v1` rewrite.
  2. Use a managed PostgreSQL with backups and a restore drill.
  3. Schedule the reminder job.
  4. Have counsel review the privacy notice and terms.

## Status by item

**PASS** (evidence in TEST_REPORT 2026-11-06):

| Item | Evidence |
|---|---|
| Registration, sign-in, cookie sessions, CSRF, expiry, legacy upgrade | backend auth (18) + E2E |
| Account isolation on every route | route sweep + cross-account probes |
| Ledger in paise: create, edit, void, transfers excluded, refunds linked | backend + E2E |
| Statement import with duplicate detection | backend + E2E |
| Budgets and goals | E2E |
| Group splits, invites, settlements, edit, void, payback undo | backend + E2E (two accounts) |
| Share-only personal accounting, with invariants incl. concurrency and a randomized sequence | `test_group_share_ledger.py` |
| Family Space privacy, roles, budgets, goals, contributions | backend + E2E (two accounts) |
| Recurring bills, mark paid once, reminders (in app), preferences | backend + E2E |
| Offline queue and reconnect | E2E |
| Mobile navigation; WCAG A/AA scan (light mode) | E2E + axe |
| Migrations 0001→0008 up/down/up on PostgreSQL; no model drift | local PostgreSQL + CI |
| Backup hash and isolated restore of the pre-resume dump | DATABASE_AUDIT_2026-11-06 |
| Dependency and static scans | npm audit, pip-audit, bandit, ruff |

**FAIL:** none open.

**BLOCKED** (needs the founder):
- Upgrading the existing local database: the meaning of its `balance_paise` is unknown.
- Deployment: host, domain, `/api/v1` rewrite, managed DB.
- Email delivery: provider choice.
- Legal/compliance review.

**NOT TESTED:**
- Real email or push delivery.
- AI routes with a live Gemini key.
- Dark-mode accessibility and screen readers.
- Firefox/Safari.
- Load and performance.
- External penetration test.
- Payment flows: none exist and none are claimed.

## Not offered, by design
No bank/UPI/Account Aggregator connection, no payment gateway or paid plans, no compliance certification, no end-to-end encryption claim. AI is advisory only.
