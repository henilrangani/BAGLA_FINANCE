# Product Roadmap

_2026-11-06. Effort is in engineer-days (one experienced full-stack engineer), including tests and docs. ★ = depends on a founder decision or an external provider._

## P0: before and during the closed beta (security, financial integrity, recovery)
| Item | Effort | Depends on |
|---|---|---|
| Provision beta infra (DO Bangalore or chosen host), env, same-origin routing, TLS | 1–2 | ★ host approval |
| Beta DB: migrate to head, `alembic check`, backup + restore drill, least-privilege role | 1 | ★ |
| Schedule reminder job + `/health/jobs` and job-failure alerts | 0.5 | host |
| Error tracking (self-hostable or free tier) with PII scrubbing | 1 | ★ provider |
| Automated weekly backup-restore verification job | 1.5 | DB host |
| Secure the local legacy container (bind localhost or stop) | 0.1 | ★ approval |
| Privacy notice + terms finalised; grievance contact | n/a | ★ counsel |
| Real-phone smoke test (Android + iPhone) | 0.5 | infra |

## P1: beta reliability, analytics, imports, accessibility
| Item | Effort | Depends on |
|---|---|---|
| Refund / reversal / transfer creation in the UI | 3 | none |
| Server-side reports: budget variance, cash flow, savings rate (replace device-only charts in account mode) | 4 | none |
| Statement reconciliation: closing-balance check, per-import summary | 2 | none |
| Rule-based anomaly flags (no AI needed) | 2 | none |
| Shared rate-limit store (Postgres or Redis) | 1.5 | before scaling out |
| Screen-reader pass (NVDA, TalkBack, VoiceOver) + fixes | 3 | none |
| Full keyboard audit + larger-text setting | 2 | none |
| Offline conflict UI (show rejected queued changes, retry/discard) | 2 | none |
| Email provider: password reset, invites, reminder emails | 3 | ★ provider |

## P2: AI intelligence, family capabilities, localisation
| Item | Effort | Depends on |
|---|---|---|
| Gemini: verify model/pricing, live tests, prompt-injection red-team, spend caps | 3 | ★ key + budget |
| AI budget recommendations grounded in server reports | 3 | P1 reports |
| Hindi + Gujarati: string extraction, i18n framework, number/date formats, translation review | 8–12 | ★ translators |
| Simple Mode / Pro Mode | 4 | design decision |
| Family/group notifications (in app) | 2 | reminder outbox |
| Exact re-split on group expense edit | 1 | none |
| PDF statement import (text-based PDFs first) | 5–8 | sample statements per bank |
| Voice workflows end to end | 3 | none |

## P3: subscriptions, integrations, scale
| Item | Effort | Depends on |
|---|---|---|
| Paid plans + payment gateway (webhooks, idempotent entitlement) | 6–10 | ★ merchant KYC, pricing |
| Account Aggregator integration | 20+ | ★ licensed AA partner, legal |
| Privacy-safe product analytics (self-hosted, opt-in) | 2 | ★ |
| Multi-instance scale: shared rate limits, background worker, read replicas | 4 | traffic |
| Native-feel PWA push notifications | 3 | ★ |

## Sequencing
- P0 is about 7 engineer-days plus founder and counsel time.
- P1 is about 23 days.
- P2 is about 32–40 days.
- P3 depends on partners.

Public launch needs P0, the P1 accessibility and reliability items, the email provider, the legal review and an external penetration test.
