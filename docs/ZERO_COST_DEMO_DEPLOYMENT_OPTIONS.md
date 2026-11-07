# Zero-Cost Demo and Deployment Options (budget: ₹0)

## Decision for today's investor meeting
**A local demonstration on this laptop, shown by screen share.** It's working and tested:
- **Location:** `D:\BAGLA_FINANCE_WORKSPACE\investor-demo`.
- **Data:** synthetic only.
- **Verified:** the four journeys (individual, flatmates, family privacy, AI) were checked by an automated walkthrough on 2026-11-07.
- **Cost:** ₹0. Nothing is exposed to the internet.

## Why there's no public demo today
| Option | Verdict |
|---|---|
| Static frontend only (e.g. Cloudflare Pages free plan) | Possible for the **web app shell** only. The app needs the API and a database for sign-in, groups and family, so a static-only site would show device-only demo mode, not the real product. Not worth the risk of confusion. |
| Free backend + free database tiers | Typical free tiers sleep after inactivity, have small or expiring databases, or need a card on file that converts to paid. **Not suitable for a finance app, and not acceptable under the ₹0 / no-auto-billing rule.** Not used. |
| Public tunnel to this laptop | **Rejected** (the founder's rule; it would expose a local machine). |
| DigitalOcean (paid) | The right next step after funding: about ₹3,000/month (`PRODUCTION_DEPLOYMENT_AND_COST_PLAN.md`). ★ Needs approval and payment. |

## The four levels (don't mix them up)
| Level | What it means | Status |
|---|---|---|
| **Local demonstration** | This laptop, synthetic data, screen share | **READY** |
| **Temporary public demonstration** | A hosted copy with synthetic data only | Not done (needs paid hosting; ₹0 budget) |
| **Private beta** | Hosted, about 20 invited real users, legal review done | BLOCKED (`FINAL_PRIVATE_BETA_GO_NO_GO.md`) |
| **Production** | Public launch | Not started (pen test, HA, email, legal) |
