# Security Audit

**Scope:** automated scans plus a code review by Claude, 2026-11-04. **This is not a professional penetration test.** A qualified third-party test is recommended before public launch.

## Tools run (actual results)
| Tool | Target | Result |
|---|---|---|
| `npm audit` | frontend + Node layer | 0 vulnerabilities, after fixing S-08 |
| `pip-audit` | backend runtime + dev environment | 0 known vulnerabilities, after fixing S-09 |
| `bandit -r app` | backend code | 0 issues, after fixing S-10 |
| `ruff` (incl. `S` security rules) | backend | clean |
| Manual grep review | frontend (`innerHTML`, `eval`, `target=_blank`, URL construction, logging) | 1 finding (S-07) |
| Automated tests | auth, isolation, webhook, input limits | 75 frontend + 49 backend passing |

Not run: Semgrep, Trivy, OWASP ZAP or other dynamic scanning, Playwright security tests. Not installed; candidates for CI later.

## Findings
| ID | Finding | Severity | Evidence / affected code | Fix | Retest | Residual risk |
|---|---|---|---|---|---|---|
| S-01 | Hardcoded master PIN `1234` | Critical | `FinanceContext.tsx` (old `unlockApp`) | Removed; PBKDF2-hashed PIN with backoff | `pin.test.ts` ✅; manual browser check ✅ | The lock is a privacy screen; local data is not encrypted |
| S-02 | Unauthenticated webhook accepting and logging any payload | High | `api/webhooks/payment-sync.ts`, `server.ts` | HMAC-SHA256, 5-minute window, replay cache, disabled without a secret | `lib/server.test.ts` ✅; live curl ✅ | Replay cache is per instance |
| S-03 | AI routes open to abuse (no limits, 25 MB bodies) | High | `server.ts` | Validation, size limits, same-origin check, rate limits, timeouts | tests ✅; live curl ✅ | In-memory limits on serverless |
| S-04 | No security headers or CSP | Medium | `server.ts`, `vercel.json` | Headers + production CSP | test ✅ | Vercel headers unverified until deploy |
| S-05 | False "AES-encrypted / compliant" claims | Medium (trust/legal) | UI, README | Removed and replaced with accurate text | grep ✅ | Landing-page copy still needs a full review |
| S-06 | Full transactions (incl. receipt images) sent to AI | Medium (privacy) | `askBaglaAi`, `DailySummaryModal` | Minimized payloads | code review ✅ | Gemini still receives the user's prompt text |
| S-07 | **UPI intent parameter injection** via unencoded UPI ID (`x@bank&am=99999` could change the pre-filled amount) | Medium | `GroupsView.tsx` settlement link | `src/utils/upi.ts` validates the UPI ID and URL-encodes all fields; used in both UPI links | `upi.test.ts` ✅ (4 tests) | User still confirms in their UPI app |
| S-08 | Critical advisories in `tinypool` via Vitest (dev dependency) | Critical (dev-only) | `package-lock.json` | Vitest 3.2.4 → 4.1.12 | `npm audit` 0 ✅ | none known |
| S-09 | `pytest` PYSEC-2026-1845 (dev dependency) | Low (dev-only) | backend dev requirements | pytest 9.0.3 + pytest-asyncio 1.3.0 | `pip-audit` 0 ✅ | none known |
| S-10 | `assert` used as a runtime guard (removed under `python -O`) | Low | `backend/app/core/database.py` | Explicit check | bandit 0 ✅ | none |
| S-11 | Backend copy: account deletion would cascade-delete family groups the user created | High (data loss) | `models/extra.py` (my own first draft) | `ON DELETE SET NULL` + admin hand-over | `test_deleting_an_account_does_not_delete_the_family` ✅ | none known |
| S-12 | Original backend: JWT `type` not checked, no logout or revocation, no lockout | High | original `app/core/security.py`, `deps.py` | Session-bound JWTs, rotation, lockout | `test_auth.py` ✅ (14 tests) | Per-IP limiter in-memory |
| S-13 | Original backend: `account_id` nullable `SET NULL` let ledger entries lose their account | Medium (integrity) | migration 0001 | 0002: NOT NULL + `RESTRICT`; orphans moved to "Unassigned (migrated)" | SQL renders ✅ | Not run on live PostgreSQL yet |

## OWASP API Top 10 quick map (backend)
- **API1 BOLA:** every query is user-scoped; cross-user tests on accounts, transactions, refunds, reversals, transfers, budgets, goals, imports and family all return 404 ✅
- **API2 Broken auth:** see S-12 ✅
- **API3 Property-level authorization:** response models whitelist fields; family view strips account ids and notes ✅
- **API4 Resource consumption:** 1 MB body limit; row and file caps on imports; pagination ≤ 200 ✅
- **API5 Function-level authorization:** admin routes need `is_admin` (database-only flag) and return 404 to others ✅
- **API6 Sensitive flows:** auth rate limits ✅; signup abuse/captcha ⬜
- **API7 SSRF:** no server-side URL fetching ✅
- **API8 Misconfiguration:** docs hidden in production, CORS allowlist, strict headers ✅
- **API9 Inventory:** versioned `/api/v1`; old placeholder routes removed ✅
- **API10 Unsafe consumption:** AI output re-validated (Node layer); XLSX parsed with defusedxml ✅

## Open items (founder review)
- Row-level security in PostgreSQL (defense in depth) ⬜
- Shared (Redis or Postgres) rate limiting before more than one instance ⬜
- Email verification, password reset and MFA (need an email or SMS provider) ⬜
- Professional penetration test before public launch ⬜
