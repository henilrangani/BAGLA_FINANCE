# Pricing Strategy (hypotheses for discussion; not approved prices)

**No demand or conversion data exists yet.** Every conversion rate below is an **assumption** to test in the beta, not a forecast. Costs come from the official prices read on 2026-11-07 (DigitalOcean, Google Gemini; see `PRODUCTION_DEPLOYMENT_AND_COST_PLAN.md` and `AI_PROVIDER_COST_ANALYSIS.md`).

## Fixed assumptions
| Item | Value | Source / note |
|---|---|---|
| GST on a consumer subscription | 18% | Prices below are **GST-inclusive** (what the user pays); net revenue = price ÷ 1.18 |
| Payment gateway fee | ~2% + 18% GST on the fee ≈ 2.4% of price | Typical Indian gateway card/UPI-subscription rate; **get a quote** (UPI AutoPay mandates may differ) |
| Hosting (beta stack) | ≈ $36/mo incl. GST ≈ ₹3,000/mo | DigitalOcean BLR, verified prices; serves the first ~1,000 users |
| AI cost per heavy user | ≈ ₹1–3/month | 60 questions × ~8k input + ~400 output tokens on gemini-3.1-flash-lite ($0.25 / $1.50 per 1M) ≈ $0.16 ≈ ₹13 at most; most users ask far fewer. Cap per plan |
| USD→INR | ₹84 | For estimates only |

## Option 1: ₹29/month per module (the original idea)
| Per paying user | Value |
|---|---|
| Price (incl. GST) | ₹29 |
| Net of GST | ₹24.58 |
| Gateway (~2.4% of ₹29) | ₹0.70 |
| **Net per month** | **≈ ₹23.9** |
| Annual | ≈ ₹287 |

**Assessment:** low friction, but a user wanting groups plus AI plus family needs three modules (₹87), which is confusing. Gateway minimums and failed-mandate costs eat a larger share of tiny payments. Module boundaries also complicate the product (what's "groups" versus "family"?). **Not recommended as the main model.** Keep ₹29 only as a possible single add-on (e.g. extra AI questions).

## Recommended structure (to test)
| Plan | Price (incl. GST) | Includes |
|---|---|---|
| **Free** | ₹0 | Unlimited manual entries, accounts, monthly dashboard, 3 budgets, 2 goals, 1 group (up to 6 people), recurring bills, CSV export, built-in (non-AI) insights |
| **Plus (individual)** | **₹49/mo** or **₹399/yr** | Unlimited budgets, goals and groups; advanced reports and exports; statement import; AI assistant (e.g. 100 questions/mo); priority support |
| **Family** | **₹99/mo** or **₹799/yr** | Everything in Plus for up to 5 adults; family space with shared budgets, goals and contributions; family reports; more AI |

| Per paying user/household | Plus monthly | Plus annual | Family monthly | Family annual |
|---|---|---|---|---|
| Net of GST | ₹41.5 | ₹338 / yr | ₹83.9 | ₹677 / yr |
| Gateway (~2.4%) | ₹1.2 | ₹9.6 | ₹2.4 | ₹19.2 |
| AI allowance (worst case) | ₹13 | ₹156 / yr | ₹26 | ₹312 / yr |
| **Contribution (worst case)** | **≈ ₹27 / mo** | **≈ ₹172 / yr** | **≈ ₹55 / mo** | **≈ ₹346 / yr** |
| Contribution (typical AI use ~₹3) | ≈ ₹37 / mo | ≈ ₹292 / yr | ≈ ₹78 / mo | ≈ ₹623 / yr |

## Break-even on infrastructure (≈ ₹3,000/mo hosting)
| Mix | Paying users needed |
|---|---|
| All Plus monthly (₹37 typical contribution) | ≈ 81 |
| All Family monthly (₹78) | ≈ 39 |
| 50/50 | ≈ 53 |

**Illustrative only (assumptions, not forecasts).** At 1,000 registered users and an assumed 3–5% paid conversion (to be measured in the beta), that's 30–50 paying users, about break-even on hosting only. **Salaries, legal, security reviews and marketing are not included**; they're the real cost drivers.

## What to validate in the private beta
1. Willingness to pay: survey plus a "notify me" on the Plus/Family pages (no charging in the beta).
2. Which feature drives upgrades (groups, family, AI, reports).
3. Actual AI usage per user, to set the caps.
4. Annual-plan uptake (better margins, lower churn).

**Not implemented:** payment collection. It needs ★ merchant KYC, a gateway and legal review. The `billing` API supports plans and trials but has no prices configured.
