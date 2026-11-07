# Environment Variables

Never commit real values. `.env*` files are git-ignored. Secrets go in the host's secret store.

## Backend (FastAPI, `backend/`)
| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes, always** | none (start-up fails without it) | `postgresql+asyncpg://USER:PASS@HOST:PORT/DB`; managed DBs may add `?sslmode=require` (handled). Local dev: `127.0.0.1:55432/bagla_dev`. SQLite (`sqlite+aiosqlite:///…`) is for tests/E2E only. |
| `JWT_SECRET` | **yes** | none | ≥ 32 random characters; weak or placeholder values are refused at startup. Generate: `python -c "import secrets;print(secrets.token_urlsafe(48))"`. Rotating it signs everyone out of access tokens; refresh sessions remain DB-backed. |
| `ENVIRONMENT` | yes (prod) | `development` | `development` \| `test` \| `staging` \| `production`. Staging/production enable HSTS and the safety checks below. |
| `CORS_ORIGINS` | yes (prod) | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated exact origins of the web app. Never `*` (credentials are allowed). |
| `ACCESS_TOKEN_MINUTES` | no | 15 | Bearer access token lifetime (held in memory by the app). |
| `REFRESH_TOKEN_DAYS` | no | 30 | Refresh session lifetime (HttpOnly cookie for the web app). |
| `REFRESH_COOKIE_SECURE` | no | `true` | **Refused as `false` in staging/production.** Local http E2E only. |
| `REFRESH_COOKIE_SAMESITE` | no | `lax` | `lax` when the API is served on the same site as the app (recommended: `/api/v1` rewrite). `none` requires Secure. |
| `REFRESH_COOKIE_DOMAIN` | no | unset | Only if app and API are on different subdomains of one site. |
| `REFRESH_REUSE_GRACE_SECONDS` | no | 20 | 0–60. Concurrent-refresh window (two tabs). Replays after it revoke all sessions. |
| `AUTH_RATE_LIMIT` | no | 20 | Auth attempts per IP per 15 min. **Refused above 20 in staging/production.** In-memory per process. |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCKOUT_MINUTES` | no | 5 / 15 | Per-account lockout. |
| `MAX_BODY_BYTES` | no | 1000000 | Request size cap (statement uploads are additionally capped at 700 KB / 5,000 rows). |

## Web app build (Vite)
| Variable | Notes |
|---|---|
| `VITE_API_URL` | API origin. **Leave unset in production**: the app then calls `/api/v1` on its own origin, which the host rewrites to the API (keeps the cookie first-party and the CSP at `connect-src 'self'`). Dev default `http://127.0.0.1:8000`. |

## AI/webhook server routes (Express `server.ts` / Vercel `api/`)
| Variable | Notes |
|---|---|
| `GEMINI_API_KEY` | Optional. Server-side only; never prefixed `VITE_`. Without it, AI features fall back to deterministic logic. |
| `GEMINI_MODEL` | Optional model name; default in `lib/ai.ts` (verify availability/pricing before launch). |
| `ALLOWED_ORIGINS` | Origins allowed to call the AI routes. |
| `WEBHOOK_SECRET` | Payment webhook HMAC secret. The webhook is disabled unless set; no payment gateway is connected. |

## Browser test suite (`npm run e2e`)
| Variable | Notes |
|---|---|
| `E2E_DATABASE_URL` | Run against a PostgreSQL test database (already migrated) instead of a fresh SQLite file. |
| `E2E_PYTHON` | Python with backend deps (default `backend/.venv`). |
| `E2E_API_PORT` / `E2E_APP_PORT` | Defaults 8010 / 3010. |
| `E2E_OUTPUT` / `E2E_DIR` | Report/trace folder and SQLite folder (default `../test-results/…`, outside the repo). |

The suite generates a random `JWT_SECRET` per run and sets `AUTH_RATE_LIMIT=1000` and `CORS_ORIGINS` for itself.
