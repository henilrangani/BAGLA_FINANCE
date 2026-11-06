# Beta User Guide

Bagla Finance helps you keep an exact record of your money. It does **not** move money, connect to your bank or UPI apps, or give investment advice. Everything you see comes from what you enter or import.

## Signing up, in and out
- **Create an account:** sidebar → **Account & Sync** → *New here? Create an account*. Use a password of at least 12 characters; a short sentence works well.
- **Sign in on another browser:** *Account & Sync* → enter your email and password → **Sign in**. You stay signed in across reloads. The session is kept in a secure cookie that page scripts can't read.
- **Sign out:** *Account & Sync* → **Sign out**.
- After 5 wrong passwords the account locks for 15 minutes. After 20 sign-in attempts from one network, sign-in pauses for 15 minutes.
- Without an account, the app works **on this device only**: data stays in this browser and is lost if you clear site data. *Copy my data now* on *Account & Sync* moves it into your account without creating duplicates.

## Entries (income, expenses, transfers)
- **Add:** on the **Dashboard**, use **+ Expense** (or the + button on a phone). Enter the amount in rupees and paise, the merchant and the category, then save.
- **Edit or delete:** **Transactions** → click an entry → **Edit** or **Delete**. A deleted entry is *voided*: it stops counting in balances but stays in the account's history for the audit trail.
- **Balances:** each account's balance is its opening balance plus every posted entry, calculated exactly. Transfers between your own accounts move money without counting as income or spending.
- **Filters** on *Transactions* narrow by type, category and dates. **Export CSV** downloads the list (spreadsheet-safe).

## Budgets and goals
- **Budgets** → **+ Create Budget**: set a name, category and monthly limit. Spending in that category counts against it.
- **Goals** → **+ Create Savings Target**: set a target and an optional date. Add contributions to track progress.

## Importing a bank statement
**Account features** → *Import a bank statement*:
1. Choose a **CSV or Excel (.xlsx)** file from your bank's website (PDF isn't supported yet).
2. Review every row in the preview. Possible duplicates are flagged.
3. Confirm. Uploading the same file again never adds duplicates.

## Groups (shared expenses)
- **Groups** → create a group and add members by name.
- **Add an expense** and choose who paid. It's split equally (or by exact amounts) to the paisa.
- **Settle** (then *Mark as Settled & Confirmed*) records a payback someone made outside the app, by UPI, cash or bank transfer. **Undo** reverses a mistaken payback after confirmation.
- **Invite** a member: share their invite code yourself. No email or SMS is sent.
- **Track my share** (optional) adds only *your share* of group spending to your own accounts, so your personal totals stay accurate.
- *Open GPay / PhonePe / Paytm* only opens your own UPI app with the details filled in, for you to check and confirm there. Bagla never initiates a payment.

## Family space
**Family** → start a family space and invite members with a code.
- Nothing personal is shared automatically. You choose which entries to share.
- Members see only what's shared, plus shared budgets, goals and the activity feed.
- *Make all my shared entries private* withdraws everything you shared.
- Admins manage members and roles.

## Recurring bills and reminders
- **Recurring** → add a bill (amount, how often, first due date, reminder days).
- Mark an occurrence **paid** (creates the entry once) or **skip** it. You can edit, pause, resume or cancel a bill.
- Reminders appear **inside the app**. Choose quiet hours and opt-out under *Reminder settings*.
- **Email reminders are not available**: no email service is connected, and the app says so.

## Your data and privacy
- **Download everything:** *Account & Sync* → **Download (.json)** saves everything your account holds on the server. The file isn't encrypted; keep it safe.
- **Settings** (*Privacy Shield & Security Center*) has the device backup download, the app lock (a privacy screen on this device) and wiping on-device data.
- Deleting your account (API `DELETE /users/me`) removes your personal data. Shared group records are kept with your name removed, so other members' balances stay correct.
- AI features are optional suggestions. They never change your records or start payments. Without a configured AI key, rule-based answers are used.

## Reporting a problem
Use **Support** in the app, or tell the founder directly during the beta. Include what you clicked and what you expected.
