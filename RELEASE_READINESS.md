# Release Readiness

_2026-11-06 · branch `phase-1-security-money` · not merged, not deployed._

## Recommendation
- **Public launch: NO-GO.**
- **Closed beta (≤ ~20 invited testers): technically ready**, once these founder steps are done:
  1. Choose hosting, with the same-origin `/api/v1` rewrite.
  2. Use a managed PostgreSQL with backups and a restore drill.
  3. Schedule the reminder job.
  4. Have counsel review the privacy notice and terms.

## Exact beta blockers (2026-11-06)
All are founder or external decisions. No open engineering defect blocks the beta.
1. ★ **Choose and approve hosting**: recommended DigitalOcean App Platform + Managed PostgreSQL, Bangalore (HOSTING_OPTIONS.md). Confirm prices on the provider's pages.
2. ★ **Provision a new beta database**; migrate to `0009_job_runs`, then run the backup + restore drill there (HOSTING_OPTIONS.md, DEPLOYMENT_RUNBOOK.md).
3. ★ **Schedule the reminder job** and an uptime check on `/health` and `/health/jobs` (REMINDER_SCHEDULER.md).
4. ★ **Counsel review** of `PRIVACY_NOTICE_DRAFT.md` and `TERMS_DRAFT.md`; grievance contact.
5. ★ **Approve merge to `main` and the private-beta deployment.**

Recommended, but not blocking a 20-person beta:
- Secure the local legacy container (it listens on all interfaces with the default password).
- An error tracker.
- A real-phone smoke test.

The legacy database stays untouched by decision (LEGACY_DATA_PROCEDURE.md). Beta users never connect to it.

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

**Added 2026-11-06 (PASS):**
- Browser E2E on Firefox, WebKit (Safari engine) and iPhone 13 (55/55 across 5 projects).
- Dark-mode WCAG A/AA scan.
- Reminder scheduler single-run lock, leased delivery and run monitoring.
- Load test with ledger check (25 users, 925 requests, 0 errors, 0 mismatches).
- Legacy DB preservation checks.

**NOT TESTED:**
- Real email or push delivery.
- AI routes with a live Gemini key.
- Screen readers (manual NVDA/TalkBack/VoiceOver pass).
- Real Safari on macOS/iOS. Tested with Playwright's WebKit engine on Windows, which is close to but not identical to Safari.
- Production-scale load (only a 25-user local test).
- External penetration test.
- Payment flows: none exist and none are claimed.

## Not offered, by design
No bank/UPI/Account Aggregator connection, no payment gateway or paid plans, no compliance certification, no end-to-end encryption claim. AI is advisory only.
