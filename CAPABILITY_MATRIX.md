# Capability Matrix (2026-11-06, after the customer-experience sprint)

**Labels:**
- **Tested:** implemented, with automated tests that exercise it end to end.
- **Implemented:** built, with only partial test coverage.
- **Partial:** built in part.
- **Blocked:** needs a provider, configuration or approval.
- **Not started.**

A component existing doesn't count; each row cites its evidence.

## Core money
| Capability | Status | Evidence / gap |
|---|---|---|
| Register, sign in/out, session cookie, CSRF, rate limits | Tested | `test_auth*.py`, `auth.spec.ts`. Separate refresh limit (rc1). |
| Add / edit / void entries in exact paise | Tested | `test_ledger.py`, `money.spec.ts` |
| Balances, transfers not counted as spending | Tested | `test_money.py`, insights tests |
| Refund / reversal | Partial | API tested; **no UI to create them** |
| Budgets and goals | Tested | `money.spec.ts`, `navigation.spec.ts` (cancel) |
| CSV/XLSX statement import with duplicate check | Tested | `test_imports.py`, `money.spec.ts` |
| PDF statements | Not started | needs per-bank parsing |
| Full account export (JSON), CSV export | Tested | `auth.spec.ts` (download), `test_route_security.py` |
| Recurring bills, in-app reminders | Tested | `recurring.spec.ts`, `test_reminders.py` |
| Email reminders | Blocked | no email provider (★) |

## Groups
| Capability | Status | Evidence / gap |
|---|---|---|
| Custom group: name, 9 types + custom category, icon, description, budget | Tested | `groups-flexible.spec.ts`, `test_group_flexible.py` |
| 2–30 people (server max 50), add, remove, edit before saving | Tested | same; a 20-member API test |
| No invented members (old presets added "Amit, Rahul…") | Tested | `groups-flexible.spec.ts` |
| Edit group details later | Tested | `groups-flexible.spec.ts` |
| Rename member (display name only; account, history and balance unchanged) | Tested | `test_renaming_a_member_keeps_identity_and_history`, E2E |
| Registered / invited / added-by-name shown | Tested | `test_many_members_and_member_states`, `groups.spec.ts` |
| Remove member: needs a zero balance, explains the outstanding amount, keeps history | Tested | `test_removing_a_member…`, `groups.spec.ts` |
| Split: equal, exact amounts, percentages, shares, chosen participants | Tested | `allocate_weighted` property test (2000 cases), `split.test.ts` (same vectors), E2E (server == preview) |
| Preview each share before saving; save blocked until it adds up | Tested | `groups-flexible.spec.ts` |
| Amount edit keeps proportions (non-equal splits) | Tested | `test_shares_split_and_amount_edit_keeps_proportions` |
| Who owes whom, settlement suggestions | Tested | existing tests (unchanged algorithm) |
| Partial and full paybacks, payment method, undo | Tested | `groups-flexible.spec.ts`, `group-edit-undo.spec.ts` |
| Itemised (per-item) split | Not started | `SplitType` has "itemized", but no UI or server support |
| Group / family notifications | Not started | |

## AI and scanning
| Capability | Status | Evidence / gap |
|---|---|---|
| Shows whether an AI provider is configured (`/api/ai/status`) | Tested | `server.test.ts`, `ai-assistant.spec.ts` |
| Built-in answers from records: category/date-range totals, top categories, budget differences, patterns, ways to spend less, income vs spending, money terms | Tested | `insights.test.ts`, `ai-assistant.spec.ts` (exact paise) |
| AI answers with labels, Stop, timeout, Retry, errors, empty state | Tested with a **mocked** provider | `ai-assistant.spec.ts`, `server.test.ts` (mock client) |
| Live Gemini answers | **Blocked** | no key; model name `gemini-3.7-flash` unverified; needs ★ key and budget |
| AI can't write records or make payments | Tested | server filters to navigation-only actions; UI only navigates |
| Bill scan: photo/camera/manual → review → explicit save, duplicate guard | Tested | `receipt.spec.ts` |
| Automatic bill reading (OCR) | **Blocked** | the reader interface and UI are tested with a mocked server; real OCR needs a provider (★) |

## Navigation and accessibility
| Capability | Status | Evidence / gap |
|---|---|---|
| Close/Cancel/Escape/Back/discard on every overlay | Tested | `navigation.spec.ts`, `NAVIGATION_AUDIT.md` |
| Focus trap and focus return | Tested | `navigation.spec.ts` |
| WCAG A/AA automated scan: 11 screens (light and dark) and the 4 new dialogs | Tested | `screens.spec.ts` |
| Screen readers (NVDA/TalkBack/VoiceOver) | Not started | manual pass needed |
| Mobile layout 360–390 px | Tested | `mobile.spec.ts`, iPhone/Pixel projects |
| Hindi / Gujarati | Not started | strings are inline |
| Simple / Pro mode | Not started | the header's "accessibility mode" changes presentation only |

## Honesty (no fake integrations)
| Item | Status |
|---|---|
| Payment sync demo | labelled simulation; sample entries marked "(simulated)" |
| Account Aggregator and SMS reading in Settings | now "Not available" (they had fake Grant/Enable toggles) |
| Sidebar "Premium User" / hard-coded initials | replaced by real initials and "Signed in · synced" / "On this device only" |
| "AI Receipt & Bill OCR", "Gemini parser", "graph algorithm" marketing copy | rewritten to what the app does |
| Payment initiation, bank connection | none, and none claimed |

## Needs founder approval (★)
1. AI provider key, budget and live verification (Gemini or another provider).
2. OCR provider for bill reading.
3. Email provider.
4. Hosting, managed database, legal review and merge/deploy (see `BETA_DEPLOYMENT_CHECKLIST.md`).
5. The legacy container lockdown.
