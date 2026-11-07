# Legal Review Pack and External Providers

**For counsel. No legal compliance or regulatory authorisation is claimed.**

## Documents for review
| Document | File | State |
|---|---|---|
| Privacy notice | `PRIVACY_NOTICE_DRAFT.md` | Draft; placeholders for entity, grievance officer, retention days |
| Terms of use | `TERMS_DRAFT.md` | Draft; liability, governing law and disputes left to counsel |
| Third-party data flows | `THIRD_PARTY_DATA_FLOWS.md` | Current |
| Incident response | `docs/DISASTER_RECOVERY_PLAN.md` (credential compromise / breach) | Draft |
| Beta onboarding text | `docs/PRIVATE_BETA_ONBOARDING.md` | Draft |

## Points needing counsel's decision
1. **DPDP Act 2023:** consent wording; the grievance officer (name and contact, response time); breach-notification process; children (under-18) policy.
2. **Data retention:** how long to keep deleted-account audit events and backups (backups roll off after 7 days on managed PITR; off-site dumps after 8 weeks, as proposed).
3. **Account deletion:** personal data is deleted; shared group records keep the amounts with the person's name detached so other members' balances stay correct. Is that acceptable?
4. **Data export:** full JSON export exists. Is the format/timeline acceptable for access requests?
5. **AI disclosure (if AI is enabled):** what's sent to Google (this month's totals, budgets, goals, group totals, the 15 most recent entries; no IDs or emails); "may be wrong; not advice"; opt-out.
6. **Bill-scanning disclosure (if OCR is enabled):** photo processing by a provider; photos not stored by Bagla.
7. **Statements to avoid** (already absent from the app): "bank-grade", RBI/NPCI authorisation, payment initiation, investment advice.
8. **Beta terms:** possible data reset with notice; free; no SLA.

## External providers
| Provider | Purpose | Data it would receive | Cost (as of 2026-11-07) | Privacy impact | Approval |
|---|---|---|---|---|---|
| DigitalOcean (BLR) | Hosting app + PostgreSQL | All app data (encrypted at rest), in India | ≈ $30.50/mo + 18% GST | Processor for all data; DPA needed | ★ Required |
| Google Gemini | AI answers (optional) | Monthly summary + 15 recent entries per question | Pay per use; set a spend cap | Financial summary leaves the app | ★ Required (off by default) |
| OCR provider (TBD; could be Gemini vision) | Read bill photos (optional) | Bill images | Pay per image | Images may contain names/addresses | ★ Required (off by default) |
| Email provider (TBD) | Password reset, invites, reminders | Email address, short message text | Free tiers exist | Contact data | ★ Required (not integrated) |
| Uptime monitor (TBD) | Check `/health`, `/health/jobs` | Nothing personal | Free tiers exist | None | ★ Recommended |
| Error tracker (TBD) | Crash reports | Request ID, path, error type (no bodies by design) | Free tiers exist | Low if scrubbing is verified | ★ Optional |

None of these is active today, apart from GitHub (source code and CI, synthetic test data only).
