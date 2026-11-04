# User Testing Guide

_What a tester can try today (2026-11-04). Use made-up data only, never real bank statements or account numbers._

## A. The current app (browser-only data)
```bash
npm ci
npm run dev   # http://127.0.0.1:3000
```
Try these and note anything confusing or wrong:
1. Add an expense, an income and a cash expense; check the dashboard totals and the cash wallet.
2. Edit, then delete, an entry; totals and budgets should update.
3. Create a group, add ₹100 split between 3 people; the shares should be 33.34 / 33.33 / 33.33.
4. Import CSV lines in Transactions → Import, including a bad row; it should be reported, not guessed.
5. Privacy Center: set a PIN, lock, unlock; `1234` must not work.
6. Switch on offline mode and try the AI chat; it should answer without contacting the server.

## B. The backend API (for technical testers)
Follow `backend/README.md`, then open `http://127.0.0.1:8000/docs` and try register → create account → add transactions → transfer → refund → reports/reconciliation → import a synthetic CSV → family invite/share.

## Reporting
Note the screen, what you did, what you expected and what happened, plus a screenshot. Don't include real personal or financial data.
