# Privacy & Compliance Readiness

**Not legal advice. No compliance is claimed.** This is an engineering checklist to take to a qualified Indian lawyer. Items marked ✅ exist in code; everything else needs legal input or implementation.

## Digital Personal Data Protection Act, 2023 (and the DPDP Rules once in force; confirm the current notified text with counsel)
| Obligation area | Status in product |
|---|---|
| Notice before collection (what, why, how to withdraw, how to complain) | ⬜ Privacy notice text needs drafting; the app has a Privacy Center screen to host it |
| Consent: free, specific, informed, unambiguous; withdrawable as easily as given | 🟡 Bank/SMS consent defaults off (Phase 1); a server-side consent record table is ⬜ |
| Purpose limitation and data minimization | ✅ AI payloads minimized; admin can't see transactions; family view strips account details |
| Accuracy and correction | ✅ Edits are audited; users can correct entries |
| Retention and erasure when the purpose is served | 🟡 Self-service deletion ✅; retention schedule ⬜ (decide e.g. inactive-account policy, backup expiry) |
| Data principal rights: access, correction, erasure, grievance, nominee | ✅ Export (`/users/me/export`), ✅ deletion; ⬜ nominee; ⬜ grievance officer contact |
| Children's data (verifiable parental consent; no tracking or targeted ads) | ⬜ "child" family role exists, but onboarding must not let minors sign up alone; age-gating and guardian consent flow needed |
| Security safeguards | 🟡 See `SECURITY_CHECKLIST.md`; encryption at rest depends on the host |
| Breach notification (to the Board and affected users) | ⬜ Incident procedure exists in `RUNBOOK.md`; notification templates and timelines need legal review |
| Processors (Google Gemini, hosting, email) | ⬜ Data processing terms to review; Gemini receives prompt text only in online mode |
| Cross-border transfer | ⬜ Check the hosting region and Gemini's processing location against any notified restrictions |

## Information Technology Act, 2000 and rules
- Reasonable security practices (SPDI Rules), including financial information as sensitive data: align `SECURITY_CHECKLIST.md` with a documented security policy ⬜
- Intermediary/grievance requirements, if applicable to the product model ⬜ (ask counsel)
- CERT-In directions (incident reporting timelines, log retention) ⬜

## Consumer protection (Consumer Protection Act 2019, E-Commerce Rules, dark-patterns guidelines)
- ✅ Trial and cancel design: cancellation stops renewal while access continues to the end of the period; no hidden auto-charges (no gateway connected)
- ⬜ Clear pricing display before purchase, refund policy, terms of service
- ⬜ Avoid dark patterns in onboarding and subscription screens (review UI when built)

## Payments (when a gateway is added)
- The gateway's merchant KYC, settlement account and webhook signing ⬜
- RBI e-mandate / recurring payment rules (pre-debit notification, limits) for auto-renewals ⬜
- Billing data is kept separate from the user ledger ✅ (`plans`, `user_subscriptions`, `billing_events`)

## RBI / NPCI positioning
- The product records and organizes the user's own finances. It does **not** hold funds, initiate payments or transfers, or give investment advice ✅ (UPI links only open the user's own app)
- Account Aggregator access is only possible as an FIU through a licensed AA, with an agreement and consent artefacts ⬜ (business decision)
- Android notification reading: Google Play policy review and explicit in-app disclosure ⬜ (not built)

## Product controls still to build
Consent records table and UI · privacy notice and terms pages · grievance contact · retention job · guardian flow for minors · cookie/analytics consent (no analytics are collected yet).

## Update 2026-11-06 (engineering facts, not legal advice)
- **Right of access:** `/users/me/export` now also includes recurring bills and occurrences, the user's own part of each group (their seat, expenses they paid or share, their settlements), group ledger links, family roles and own goal contributions, reminder preferences and notifications. Other people's personal data is not exported (only names shown inside shared spaces).
- **Erasure:** tested with shared data present. Groups and families keep working for remaining members; the departing user's seat is unlinked, and contributions remain as "Former member".
- **Sharing:** Family entries are private unless the owner shares one; one-tap "make all private"; removal revokes sharing.
- **Reminders:** opt-out and quiet hours; email is opt-in and currently not sent.
- **Still needed from counsel:** privacy notice, consent records, retention schedule, grievance officer, children's onboarding, breach-notification process.
