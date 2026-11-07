# Capability Audit (2026-11-06)

✅ exists and is tested · 🟡 partial · ⬜ not built. Evidence: code paths and tests in this repo.

## Financial intelligence
| Capability | Status | Where / gap |
|---|---|---|
| Opening balances and ledger reconciliation | ✅ | `opening_balance_paise`; balances derived; `GET /reports/reconciliation`; share-ledger invariants |
| Account-level balance integrity | ✅ | Derived from posted entries; group account = net (tests) |
| Income / expense / transfer classification | ✅ | `kind`; transfers excluded from totals (frontend + backend) |
| Refund and reversal traceability | ✅ API / 🟡 UI | `refund_of_id`, one reversal per entry; **no UI to create refunds or reversals** |
| Category and budget variance | 🟡 | Budgets spent vs. limit; analytics screen computes on device data; no server variance report |
| Savings rate and cash flow | 🟡 | Rule-based coach and report summary; cash-flow chart uses device data |
| Anomaly detection | 🟡 | AI route (`lib/ai.ts`) only, needs a Gemini key; no rule-based server detector |
| Import confidence and reconciliation | 🟡 | Per-row errors, duplicate flags, header detection; no statement-closing-balance check |

## Transaction management
| Capability | Status | Where / gap |
|---|---|---|
| CSV / XLSX import | ✅ | `services/imports.py`, E2E |
| PDF statements | ⬜ | Needs parsing per bank format and an OCR decision |
| Duplicate detection; preview and confirm | ✅ | Import preview → commit; re-upload shows duplicates (E2E) |
| Pending / failed / reversed / refunded | 🟡 | pending/posted/void, refunds and reversals in the API; no "failed" (no bank feed); UI shows void only |
| History and audit trail | ✅ | `audit_events`; `GET /transactions/{id}/history` |
| Safe export | ✅ | CSV formula-injection guard; JSON export of all data |

## AI financial coach
| Capability | Status | Where / gap |
|---|---|---|
| Gemini integration | 🟡 | Code ready; model name `gemini-3.1-flash-lite` (corrected 2026-11-07: the old default `gemini-3.7-flash` does not exist on Google's pricing page); no key configured; pricing not approved |
| Explanations / insights / budget suggestions | 🟡 | Routes exist; deterministic fallbacks; not tested with a live key |
| Unusual-spending detection | 🟡 | AI-only (see above) |
| Privacy-aware context | ✅ | Minimised payloads; no ids, emails or passwords |
| Prompt-injection protection | ✅ design / ⬜ red-team | Outputs parsed and validated; actions need a click; no live red-team |
| Advisory only | ✅ | AI code has no database or ledger API access |

## Family and group finance
All ✅ (tested): personal vs. shared boundaries, roles, shared goals and budgets, group reconciliation (share ledger), settlement history and undo, activity feed, privacy reset, audit events. Gaps 🟡: no notifications for family/group events; exact re-split on edit (equal only).

## Offline-first reliability
| Capability | Status | Where / gap |
|---|---|---|
| Durable queue, idempotent retries, duplicate prevention | ✅ | `src/api/sync.ts` outbox, `local:<id>` keys (E2E offline) |
| Conflict resolution | 🟡 | The server is the source of truth; a rejected queued change is dropped with a visible message. No merge UI |
| Sync status | ✅ | Banner: offline / error / signed out |
| Multi-device consistency | 🟡 | Pull on load, reconnect and after writes; no live push between devices |
| Offline edits and voids | ✅ | Queued `tx_update` / `tx_delete`; group writes need a connection (by design) |

## Accessibility and localisation
| Capability | Status | Where / gap |
|---|---|---|
| English / Hindi / Gujarati | ⬜ | Strings are inline; needs extraction plus translation review |
| Responsive (360–1280 px) | ✅ | E2E: Pixel 7, iPhone 13, 360 px, desktop |
| Simple / Pro mode | ⬜ | Not built |
| Screen-reader testing | ⬜ | axe scans only; manual NVDA/TalkBack/VoiceOver pass needed |
| Keyboard navigation | 🟡 | Add-expense flow tested; full audit not done |
| Dark-mode accessibility | ✅ | axe A/AA, 11 screens |
| Larger text | ⬜ | No in-app text-size setting (browser zoom works) |
| Understandable errors | ✅ mostly | Plain-language API and UI messages |
| Voice workflows | 🟡 | `VoiceExpenseModal` (browser speech plus parsing); not tested end to end |

## Business and operations
| Capability | Status | Where / gap |
|---|---|---|
| Plans, trials, cancellation | ✅ API | No plans configured; no prices invented |
| Payment gateway | ⬜ | Webhook HMAC scaffold only; needs merchant KYC ★ |
| Admin dashboard | 🟡 | Staff API (no transaction access); System status page with real checks |
| Support and feedback | ✅ | Tickets, rating, admin views |
| Privacy-safe product analytics | ⬜ | None (deliberately) |
| Error tracking and uptime monitoring | 🟡 | `/health`, `/health/jobs` ready; no error tracker connected |
| Automated backup verification; DR exercises | 🟡 | Manual procedure verified on a real dump; automation ⬜ |
| API versioning and docs | ✅ | `/api/v1`, `API_DOCUMENTATION.md`, OpenAPI |
