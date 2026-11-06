# Third-Party Services and Data Flows

_As of 2026-11-06. ★ = not yet chosen; needs founder approval._

| Service | Used for | Personal data sent | When | Status |
|---|---|---|---|---|
| Hosting provider ★ | Web app, API, scheduler | All app data in transit (TLS) | Always | Not chosen |
| Managed PostgreSQL ★ | Ledger and account data at rest | All stored data | Always | Not chosen |
| Google Gemini API | Optional AI: parse a note, read a receipt image, answer chat, daily summary | The text, image or minimised summary the user explicitly submits; no account ids, emails or passwords | Only when the user uses an AI feature and a key is configured | Code ready; no key configured; check Google's data-use terms for the chosen tier |
| Email provider ★ | Password reset, invites, reminder emails | Email address, message text | When enabled | Not connected |
| GitHub | Source code and CI | **No user data** (synthetic test accounts only) | n/a | In use |
| Browser (user's device) | Device-only mode storage (localStorage) | The user's own data, unencrypted in that browser | Device-only mode | In use; disclosed in the app |

**Not used:**
- analytics or tracking scripts
- advertising SDKs
- external fonts or CDNs (the page loads nothing from other origins)
- bank, UPI or Account Aggregator connections
- payment gateways

**Internal flows:**
- Family members see only entries their owner shared.
- Group members see the group's expenses and settlements and member display names.
- Staff admin endpoints can't read transactions.
