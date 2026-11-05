# Known Limitations

_As of 2026-11-04, after Phase 2 batch 2._

## Backend (new)
- Imports: PDF statements and old .xls aren't supported; transfers between your own accounts in a statement are imported as income/expense (edit them afterwards); duplicate detection matches the same date, amount and direction, so two genuinely identical spends on one day get flagged for review.
- Family: no shared budgets/goals or server-side group settlements yet (the browser app's group split still works locally); invites have no email delivery.
- Support, feedback and billing have APIs only; no UI and no email; no payment gateway.
- **Not connected to the React app yet.** The app still uses `localStorage` only (Phase 3).
- **Not yet run against a live PostgreSQL locally** (Docker Desktop not running); covered by CI on push.
- No email verification, password reset or MFA yet (needs an email or SMS provider).
- No categories table, recurring bills, reminder scheduler, notifications or consent-record table yet.
- No PostgreSQL row-level security yet; isolation is enforced in the application and tested.
- Rate limits are in-memory per process.
- Reports load a period's rows into memory. That's fine at current scale; move to SQL aggregation before large datasets.
- Single-currency per transfer; no FX.

## Frontend (from Phase 1)

## Architecture
- **Single device, single browser.** All data lives in `localStorage`, unencrypted. Clearing site data deletes it. There are no accounts, no sync and no server backup.
- **No real server-side ledger or authentication.** The user id is a constant (`local-user`).
- **The app lock is a privacy screen.** Anyone with access to the browser profile or dev tools can read the data.
- **Rate limits and webhook replay protection are in-memory, per instance.** On Vercel each warm instance has its own counters. Move both to Redis (e.g. Upstash) before a public launch.
- **The webhook verifies events but stores nothing.** There's no ingestion and no idempotent ledger write yet.
- `tsconfig.json` is not `strict`. Turning it on will surface more latent bugs; that's planned work for the next phase.

## Money
- Amounts are stored as exact-paise rupee numbers, not integer fields (see DECISIONS D1).
- No UI yet to create `transfer` or `refund` entries manually, or to link a refund to its original expense.
- Deleting a transaction removes it from storage. There's no soft-delete or audit trail yet.
- A group expense paid by the user is also logged as a personal expense of the **full** amount, not the user's share.
- The daily summary's 30-day average divides by 30 even for users with less history.

## Product and UX
- Invalid amounts in some forms (group expense, cash, subscriptions, goals) are refused without an inline error message.
- The 10 PM reminder still relies on an open browser tab (`setInterval`). It needs a server scheduler plus push.
- "Payment sync" is a simulated demo. No bank, UPI app or Account Aggregator is connected.
- The landing page and the sample data mention integrations that don't exist; marketing copy still needs a full honesty review.
- The 990 kB JavaScript bundle has no code-splitting.

## Unverified
- Behaviour of the new `api/` wrappers on Vercel, especially raw-body reading for the webhook.
- Availability and pricing of the Gemini model name `gemini-3.7-flash`.
- Legal and compliance review (DPDP, RBI/NPCI) hasn't happened. The app makes no compliance claims.

## Phase 3 integration (2026-11-05)
- Refresh token is stored in localStorage (readable by page scripts; mitigated by the strict CSP). Planned: httpOnly cookie.
- In account mode, the family space screen and the cash-wallet denomination register remain device-only. Server-backed family sharing lives on the "Account features" screen. (Group splits and recurring bills are server-backed since 2026-11-05.)
- Local transfers/refunds can't be synced from the app screens yet (the mapper refuses them rather than guessing); migration reports them as "not supported yet".
- Payment method is inferred from the server account on pull (cash account → cash, others → bank/UPI), so a local "credit card" label may come back as "bank transfer".
- The automated Playwright suite (12 journeys) runs locally on SQLite; the CI `e2e` job runs it on PostgreSQL. It covers Chromium only (desktop plus a Pixel 7 profile); no Firefox/Safari runs.
- The account-mode UI hasn't been re-verified against PostgreSQL since Docker became unresponsive (verified on PostgreSQL earlier on 2026-11-05, and on SQLite afterwards).

## Group splits and recurring bills (2026-11-05)
- Group changes need a connection. They are not queued offline: the data is shared, and a stale offline write could conflict with other members. A failed change shows "Group change not saved" and the screen reloads the server's view.
- The Groups screen can't yet edit an expense (void and re-add), edit a member's name or UPI ID after creation, or record a partial settlement from the UI (the API supports all three).
- Invite codes are shared by the admin themselves (copy or WhatsApp); no email or SMS is sent.
- Migration matches groups and bills by name: a device group whose name already exists in the account is not uploaded (reported as "already there"). Migrated bills start at their next due date and charge the account's cash account when marked paid.
- Voiding a group expense keeps recorded settlements by design (DECISIONS D9): if money was already paid back, the app explains who must now pay whom back and asks for confirmation. A recorded settlement that never really happened has to be undone separately (API only; no UI button yet).
- The personal "Group: …" entry records the **full** amount you paid, not your share; money paid back to you isn't recorded as income automatically. Group expenses added before 2026-11-05 batch 2 have no linked personal entry.
- Recurring "mark paid" needs a linked account. No push/email reminder is sent yet (`reminder_due` is computed but nothing delivers it).
- `alembic upgrade` fails on SQLite (async driver, MissingGreenlet). Dev/E2E SQLite databases are created from the models; PostgreSQL migrations run in CI.

## Family Space (2026-11-05 batch 2)
- Goal contributions are records ("I set this aside"); they don't move money or create ledger entries, and nobody verifies them.
- Budgets are monthly only and measure entries their owners shared; private spending is never counted, so a family budget shows only what was shared.
- The "What I share" list shows your 20 most recent expenses; older entries are shared from the Transactions history via the API only.
- No notifications when someone joins, shares or contributes (the activity feed shows it).
- The device-only Family screen can't invite anyone; inviting needs an account.
- Optimistic concurrency on groups: two people saving at the same instant gets one "Someone changed this group…, try again" message.
