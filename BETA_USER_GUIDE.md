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
- **Create a group:** Groups → *Create Your First Group* (or *Start from a type*, which only pre-fills the form).
  - Give it a name and pick a type: Rent, Flatmates, Trip, Food, Household, Event, Friends, Family, or Custom with your own category.
  - Choose an icon and add an optional description and budget.
  - Add people by name with **Add person**; you can have 2–30 people including you. Remove a row with its bin button.
  - Names are only labels: nobody gets an account or a message.
- **Edit group** (in the group header) changes the name, type, icon, description or budget later.
- **Add an expense:** say what it was for, the total, who paid, and who took part (untick people who didn't).
  - Choose how to split: **Equally**, **Exact amounts**, **Percentages** (must total 100%) or **Shares** (for example 2 for someone who had double; 0 leaves a person out).
  - The list shows each person's share to the paisa before you save. **Save expense** only works once it adds up exactly.
- **Members tab:** each person is shown as *Registered · joined*, *Invited · not joined yet* or *Added by name*.
  - **Rename** changes only the name shown in this group; their account, past expenses and balance stay the same.
  - **Remove** works once their balance is settled. Past expenses and paybacks stay in the history, and unpaid amounts are never written off.
- **Settle:** records a payback that happened outside the app.
  - Enter the amount that was actually paid; a smaller amount is saved as a part-payment, and the rest stays outstanding.
  - Choose how it was paid (UPI, cash, bank transfer, other).
  - **Undo** reverses a mistaken payback after confirmation.
- **Invite** a member: share their one-time code yourself. No email or SMS is sent.
- **Track my share** (optional) adds only *your share* of group spending to your own accounts.
- *Open GPay / PhonePe / Paytm* only opens your own UPI app with the details filled in. Bagla never makes a payment.

## Scanning a bill
Dashboard → **Scan Bill**.
1. Choose **Take photo**, **Choose photo** (JPEG/PNG/WebP up to 4 MB) or **Enter manually**.
2. Automatic reading happens only if the server has a reading service set up; the screen says whether it is.
   - Without one, the photo is shown for reference while you type the details.
   - With one, check every field: readings can be wrong. **Stop** cancels a slow reading.
3. Review the shop, total, date, category, payment method and (optionally) items. If the items don't add up to the total, you'll see a note; the total is what's saved.
4. If it looks like an entry you already have, tick *It's a different bill* to save it anyway.
5. **Save expense** saves it; nothing is saved before that. Closing asks before discarding.

## AI assistant
Sidebar → **AI Assistant**. The label at the top says which mode you're in.
- **Built-in rules** (when the server has no AI set up, or you're offline): answers come from your own entries on this device.
  - What it covers: spending by category and period ("food last month", "last 30 days"), top categories, budget status, spending patterns, ways to spend less, income vs spending, and simple explanations of terms like EMI or SIP.
  - Each answer says which period and how many entries it used.
- **AI** (only when the server has a provider key): answers are AI-generated from a summary of this month's data and can be wrong. **Stop** cancels; **Try again** retries.
- In both modes the assistant can't add, change or delete entries, settle groups or make payments. Suggestions only open a screen, where you decide.

## Leaving any screen
Every dialog has an **X**, closes with **Esc**, and the phone or browser **Back** button closes it too. If you typed something, you're asked **Keep editing** or **Discard**; closing never saves. Back also returns to the previous screen.

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
