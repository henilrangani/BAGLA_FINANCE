# Decisions

## 2026-11-04: Phase 1

### D1. Arithmetic in integer paise now; integer storage in Phase 2
All money arithmetic, input parsing, splitting and totals go through `src/utils/money.ts`, which works in integer paise. Stored amounts are still rupee numbers in `localStorage`, but every value is normalized to an exact paise amount on load and on write.
**Why:** converting every view and the storage format to integer fields is a rewrite of ~12k lines of UI. That rewrite belongs with the server database (BIGINT `amount_paise`), not with a browser-storage format that is being replaced anyway.

### D2. Derived values are recomputed, not incremented
Budget `spent` is computed from transactions for the budget's own category and current period (`src/utils/ledger.ts`). The cash wallet is still incremental, but edits and deletes now reverse their effect.
**Why:** the old incremental approach double-counted (every expense hit every monthly budget) and drifted on edit or delete.

### D3. Splits use largest-remainder allocation
For example, ₹100 ÷ 3 = 33.34 + 33.33 + 33.33. Old data whose shares were rounded to whole rupees is re-allocated from each expense total, so legacy groups balance too. Paid settlements are kept and count against what's owed.

### D4. Transfers and refunds are first-class transaction types
`transfer` is never income or expense. `refund` reduces net spend and can link to the original via `refundOfId`. There's no UI to create these manually yet; CSV import supports them through a Type column.

### D5. The app lock is a privacy screen, and the UI now says so
The PIN is hashed with PBKDF2-SHA256 (210k iterations, random salt) using Web Crypto. There's no default or master PIN, and wrong attempts trigger an increasing wait. The data itself is **not** encrypted, and the UI now says that plainly.
**Why:** real protection needs server-side accounts. Claiming encryption that doesn't exist is a trust and legal risk.

### D6. AI never decides money
There are no invented default amounts (₹100, ₹500, ₹5,000, ₹680, ₹5,800 and ₹1,500 were all removed). AI and rule-based output is re-validated server-side. Amounts below 80% confidence, or missing ones, are marked for review. Chat actions only run when the user clicks, and are refused without a real amount.

### D7. One server implementation
`lib/` holds the route logic. `server.ts` (Express) and `api/*` (Vercel) are thin wrappers.
**Why:** the two copies had already drifted, and security fixes would otherwise have to be made twice.

### D8. Webhook disabled unless signed
It's disabled when `WEBHOOK_SECRET` is unset. Requests need `X-Bagla-Signature: t=<unix>,v1=HMAC-SHA256(secret, "<t>.<raw body>")`, within a 5-minute window, one use per signature. Verified events are acknowledged but **not stored**, since there's no database yet.

### D9. Offline mode is enforced
When offline mode is on, the app makes no AI or API requests. The old "air-gapped" label was only a flag.

### D10. Consent defaults off
Account Aggregator and SMS consent now start as off (opt-in). Neither integration exists yet.
