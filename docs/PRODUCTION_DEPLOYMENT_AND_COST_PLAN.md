# Production Deployment and Cost Plan (after funding)

**These are estimates, not quotations.** Unit prices are from official pages read on 2026-11-07 (DigitalOcean App Platform and Managed PostgreSQL, Bangalore; Google Gemini). Taxes: DigitalOcean charges 18% GST to India accounts without a GSTIN. USD→INR at ₹84. Architecture and procedure: `DIGITALOCEAN_DEPLOYMENT_PLAN.md` and `deploy/digitalocean/app.yaml`. **Nothing is provisioned.**

## Monthly infrastructure by stage
| Stage | Set-up | USD/mo (before GST) | ≈ ₹/mo incl. GST |
|---|---|---|---|
| **Beta / up to ~100 users** | API 1 GiB ($10) + web 0.5 GiB ($5) + reminder job (~$0.35) + PostgreSQL 1 GiB single node ($15.15) | ~$30.50 | **~₹3,000** |
| **~500 users** | API 2 GiB ($25) + web ($5) + job + PostgreSQL 2 GiB (Standard; verify the price before purchase, about $30) | ~$60 | ~₹6,000 |
| **~1,000 users** | 2 × API 2 GiB ($50) + web ($5) + job + PostgreSQL 4 GiB (Standard max; about $60, verify) + shared rate-limit store | ~$115–130 | ~₹11,500–13,000 |
| **HA database** (when required) | Advanced edition from $130/mo (Standard can't add a standby for new accounts after 30 Nov 2026) | +$130 | +₹13,000 |

## Other recurring costs (estimates; get quotes)
| Item | ≈ ₹/month | Note |
|---|---|---|
| AI (paid Gemini Flash-Lite) | 100 users ≈ ₹660; 1,000 ≈ ₹6,600 at a typical 30 questions/month | Capped per plan (`AI_PROVIDER_COST_ANALYSIS.md`) |
| Email (password reset, reminders) | ₹0–1,500 | Free tiers cover small volumes |
| Uptime and error monitoring | ₹0–2,000 | Free tiers exist; PII scrubbing required |
| Domain | ~₹100 (₹800–1,200/yr) | |
| Off-site encrypted backups | < ₹200 | Small database |

## Year-one infrastructure budget (beta → ~500 users)
| | ₹ |
|---|---|
| Months 1–3 (beta, ~₹3,500 incl. AI and extras) | ~10,500 |
| Months 4–12 (~₹8,000/month average) | ~72,000 |
| **Year 1 infrastructure** | **~₹82,500** |
| Three-month reserve (at the ~500-user level) | ~₹24,000 |

## One-off costs before public launch (estimates; quotes needed)
| Item | ≈ ₹ | Note |
|---|---|---|
| Legal review (privacy notice, terms, DPDP process) | 50,000–1,50,000 | Depends on counsel |
| External penetration test | 75,000–2,00,000 | Scope: web + API |
| Accessibility audit (screen readers) | 25,000–50,000 | Or in-house |

## Deployment gates (see `FINAL_PRIVATE_BETA_GO_NO_GO.md`)
1. ★ Approve hosting and billing.
2. Provision the database and app.
3. Run the restore drill.
4. Set up monitoring.
5. Legal review.
6. ★ Merge and deploy.
7. Smoke test.
8. Send invitations.
