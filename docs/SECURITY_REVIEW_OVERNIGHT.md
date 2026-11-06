# Security Review (overnight, 2026-11-06)

Tools run:
- `ruff check` (includes the flake8-bandit `S` rules): pass.
- `npm audit --omit=dev`: 0 vulnerabilities.
- A secret-pattern grep over tracked files: no hard-coded keys, tokens or passwords.
- The OpenAPI route sweep (`test_every_non_public_route_requires_auth`) and cross-account probes (`test_ids_from_another_account_never_resolve`): pass.

| Area | Finding | Status |
|---|---|---|
| Registration / login | Argon2id; per-account lockout; 20 sign-in attempts per IP per 15 min (production cap) | OK, tested |
| Session cookies | `bagla_rt` HttpOnly, Secure (enforced in staging/production), SameSite=Lax, path `/api/v1/auth` | OK, tested |
| Refresh tokens | Atomic rotation, 20 s concurrent grace, reuse revokes all sessions; separate refresh rate limit (120, max 300) | OK, tested |
| CSRF | `X-Bagla-CSRF` header plus an Origin allowlist on cookie refresh/logout, checked before any state change | OK, tested |
| API authentication | Every non-public route requires a bearer token; public routes are an explicit allowlist (`/health`, `/health/jobs`, auth) | OK, tested |
| User isolation | Other users' IDs return 404 on every resource | OK, tested |
| Group authorisation | Members only; admins manage; renames don't change identity; payback capped | OK, tested |
| Family privacy | Private until shared; removed members lose access; expired invites refused (new test) | OK, tested |
| File uploads | Statements ≤ 700 KB, ≤ 5,000 rows, XLSX via `defusedxml`; bill photos ≤ 4 MB, image types only, checked on the device and the server; request bodies ≤ 1 MB (API) / 6 MB (AI routes) | OK |
| AI requests | Key server-side; status never returns it; timeouts; rate limits; only error messages logged; navigation-only actions | OK, tested with a mock |
| Logs | No request bodies, prompts, tokens or financial data logged (grep) | OK |
| Exports | No password hashes or tokens (`test_responses_never_contain_secrets`); CSV formula injection neutralised | OK, tested |
| Account deletion | Personal data removed; shared group records kept with the name detached | OK, tested |
| Environment | Required secrets validated at start-up (`JWT_SECRET` ≥ 32 characters, not a known weak value); `.env*` ignored by Git and Docker | OK |
| Concurrency | Idempotent retries and refund cap under concurrency (fixed tonight) | Fixed, tested |

## Open risks
1. **★ Legacy containers exposed on this PC.** `bagla_finance_python_ready-postgres-1` listens on 0.0.0.0:5432 with the default password, and Redis on 0.0.0.0:6379. Not changed (founder decision).
2. **In-memory rate limits.** They're per process and reset on restart. Move them to a shared store before running more than one API instance.
3. **`/health/jobs` is public.** It reveals only the job's last run time and status. Accepted.
4. **No MFA**, and no email verification or password reset (needs an email provider ★).
5. **No external penetration test** (★ before public launch).
6. **Local package over plain http.** It uses the Secure cookie on localhost (it doesn't work in Safari). Production must use HTTPS.

No regulatory certification or "bank-grade" claim is made anywhere in the app or docs.
