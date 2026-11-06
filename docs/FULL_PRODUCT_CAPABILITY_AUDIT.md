# Full Product Capability Audit (overnight, 2026-11-06)

**Labels:**
- **Tested:** fully implemented, with automated tests through the API and/or the browser.
- **Implemented:** works, but some paths aren't tested.
- **Partial:** built in part.
- **Placeholder.**
- **Not implemented.**
- **Blocked:** needs a provider.
- **★:** needs founder approval.

The evidence column names the tests. A button existing is never counted.

| # | Journey | Status | Evidence / gap |
|---|---|---|---|
| 1 | Registration | Tested | `test_auth.py`, `auth.spec.ts`. 12+ character password, Argon2id. |
| 2 | Login | Tested | Lockout after 5 failures; 20 attempts per IP per 15 min. `test_auth.py`, `auth.spec.ts`. |
| 3 | Logout | Tested | Cookie cleared, session revoked, CSRF checked first. `test_auth_cookie.py` |
| 4 | Session refresh | Tested | HttpOnly cookie, rotation, reuse detection, separate refresh limit. `test_auth*.py`, `resilience.spec.ts` |
| 5 | Dashboard | Implemented | Renders signed-in; axe scans in light and dark (`screens.spec.ts`). Some widgets use demo data in device-only demo mode (labelled "Demo Mode" in the header). |
| 6 | Accounts | Tested | Derived balances, opening balance, archive. `test_ledger.py` |
| 7 | Add expense | Tested | Exact paise, Cancel/discard. `money.spec.ts`, `navigation.spec.ts` |
| 8 | Add income | Implemented | API tested (`test_ledger.py`); the UI shares the add-expense form (type switch), with no dedicated E2E. |
| 9 | Edit transaction | Tested | `money.spec.ts`, `test_ledger.py` (history kept) |
| 10 | Void transaction | Tested | History kept. `money.spec.ts`, `test_ledger.py` |
| 11 | Categories | Implemented | Fixed category list. No custom categories UI or table (Not implemented). |
| 12 | Budgets | Tested | `money.spec.ts`, `test_isolation_and_planning.py` |
| 13 | Goals | Tested | Contributions and withdrawals. Same tests. |
| 14 | Analytics | Tested (new) | Spending reports, CSV export. `reports.test.ts`, `analytics.spec.ts`. The health score is rule-based. |
| 15 | Group creation | Tested | Types, custom category, 2–30 people, templates. `groups-flexible.spec.ts`, `test_group_flexible.py` |
| 16 | Group members | Tested | Rename (identity kept), invite states, removal rules. Same tests. |
| 17 | Group expenses | Tested | Equal, exact, %, shares, chosen people, odd-paise vectors, 2–50 people. |
| 18 | Group settlements | Tested | Partial/full, method, undo, simultaneous paybacks. `groups-flexible.spec.ts`, `group-edit-undo.spec.ts`, `test_group_flexible.py` |
| 19 | Family space | Tested | Private until shared, roles, removal, isolation, invite expiry. `test_family*.py`, `family.spec.ts` |
| 20 | Recurring bills | Tested | Add, paid once, skip, edit, pause, cancel. `recurring.spec.ts`, `test_splits_recurring.py` |
| 21 | Reminders | Tested (in-app) | Scheduler lock, leased delivery, quiet hours. `test_reminders.py`. **Email: Blocked** (no provider ★). |
| 22 | Statement import | Tested | CSV/XLSX, Indian formats, duplicates, Balance column ignored, cancel. `test_imports.py`, `money.spec.ts`. **PDF: Not implemented.** |
| 23 | Bill scanning | Tested (manual path) | Review → explicit save, duplicate guard, Stop. `receipt.spec.ts`. **Automatic reading: Blocked** (no OCR provider ★). |
| 24 | AI assistant | Tested (built-in rules); provider path tested with a mock | `insights.test.ts`, `ai-assistant.spec.ts`, `server.test.ts`. **Live Gemini: Blocked** (no key ★). |
| 25 | Account export | Tested | Full JSON and CSV. `auth.spec.ts`, `test_route_security.py` |
| 26 | Offline mode | Tested | Queue and sync once on reconnect. `resilience.spec.ts`. No conflict-merge UI (Partial). |
| 27 | Account settings | Partial | Profile name/timezone via API; change password via API (no screen); no email change. |
| 28 | Privacy centre | Implemented | Device backup and wipe, app lock (privacy screen only). Fake connectors removed. No dedicated E2E beyond the screen scan. |
| 29 | Admin | Implemented | Staff-only API with no financial access (`test_family_and_business.py`). The System status page runs real checks. |
| 30 | Support | Tested | Tickets and feedback. `resilience.spec.ts`, `test_family_and_business.py` |

**Not implemented:**
- Simple Mode and Pro Mode (the header's "accessibility mode" only changes presentation).
- Hindi and Gujarati.
- Custom categories.
- Itemised splits.
- Password change and reset screens.
- Email delivery.
- PDF import.
- Real OCR and live AI.
