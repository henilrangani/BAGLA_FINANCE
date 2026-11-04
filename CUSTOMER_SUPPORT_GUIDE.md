# Customer Support Guide

## What exists (backend API, tested)
- Users create tickets: `POST /api/v1/support/tickets`. Categories are account_access, security, data_issue, import, billing, bug, question and other. Each ticket gets a reference like `BF-3F2A9C`.
- Priority is set automatically: security = urgent; data issues, account access and billing = high; others = normal.
- Users see their own tickets and statuses: `GET /support/tickets`. There's a limit of 10 open tickets per user.
- Feedback: `POST /api/v1/feedback` with kinds satisfaction (1–5), feature_request, usability, bug, onboarding_completed and onboarding_abandoned (with `context` = step).
- Staff (users with `is_admin` set **directly in the database**) use `/api/v1/admin/tickets`, `PATCH /admin/tickets/{id}` (status, priority, staff note), `/admin/feedback` and `/admin/overview`.

## What doesn't exist yet
- **No email is sent**, to users or staff. The API response says so; there's no email provider configured. To enable, choose a provider, verify a sending domain, and add an outbound notification on ticket create and update.
- No UI screens for tickets or admin yet (Phase 3/4). Today, staff use the API docs at `/docs` locally.

## Response expectations (proposed; shown to users)
First response within 2 working days. Security issues same day.

## Staff rules
- Never ask a user for their UPI PIN, OTP, CVV, bank password or app password.
- Staff tools don't show users' transactions. If a fix needs data access, ask the user to export and share only what's needed, and record that in the ticket's staff note.
- Close a ticket only after the user confirms, or after 7 days without a reply.

## Troubleshooting notes
| Problem | Answer |
|---|---|
| "My balance looks wrong" | Run Reports → Reconciliation (`/reports/reconciliation`); check for pending entries (not in balance) and voided entries |
| "Import added nothing" | Rows matching existing entries are flagged as duplicates and skipped unless included; re-uploading the same statement never re-posts |
| "Import says 'couldn't find header row'" | The file needs Date plus Amount or Debit/Credit columns; export the bank statement as CSV or XLSX (not PDF or old .xls) |
| "Locked out" | 5 wrong passwords lock the account for 15 minutes. Password reset by email isn't available yet |
| "App PIN forgotten" (browser app) | Clearing the site data removes the PIN **and all local data**. Download the backup first if the app is still open |
