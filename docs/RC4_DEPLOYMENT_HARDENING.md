# RC4 Deployment Hardening

These are the code facts checked on 2026-11-07. Changes made today are on `phase-1-security-money` after `bd584b9`.

## 2.1 Frontend and backend configuration
| Check | Result |
|---|---|
| Production build | `vite build` passes; `tsc` 0 errors |
| API base URL | Production default `""`, which means same origin |
| Same-origin `/api/v1` | nginx gateway locally (`deploy/release/nginx.conf`); App Platform route `/api/v1` (`deploy/digitalocean/app.yaml`) |
| Cookies | `bagla_rt` HttpOnly, SameSite=Lax, path `/api/v1/auth`; **Secure is forced in staging/production** (the validator refuses false) |
| CSRF | Custom header plus an Origin allowlist on cookie refresh and logout |
| CORS | Explicit origins from `CORS_ORIGINS`, never `*` (credentials are used) |
| Env validation | `JWT_SECRET` must be ≥ 32 characters and not a known weak value; **`DATABASE_URL` is now required**; rate limits capped in production |
| Error handling | **New:** a generic 500 with a request ID; no stack traces or details to clients |
| Dev-only bypasses | `/docs` and `/openapi.json` are off in staging/production. The E2E-only relaxations (`REFRESH_COOKIE_SECURE=false`, a high `AUTH_RATE_LIMIT`) are refused in production by the validators |
| Secrets in code | None (grep) |

## 2.2 Database
| Check | Result |
|---|---|
| Connection | asyncpg; `pool_pre_ping`; **new:** pool size and overflow configurable (default 5 + 5), recycle 30 min |
| SSL | **Fixed today:** `sslmode=require` URLs work for both the API (asyncpg `ssl=`) and migrations (psycopg `sslmode=`). Unit-tested; CI PostgreSQL migrations pass through the new path |
| Migrations | 0001 → 0010; up/down/up and `alembic check` clean (local and CI PostgreSQL 16) |
| Transaction safety, idempotency | Row locks on refunds and edits; idempotency keys unique per user; concurrent-retry replay (fixed overnight) |
| Indexes, unique constraints, FKs | Declared in the models; `alembic check` shows no drift |
| Isolation | Every query is scoped by `user_id` or membership; the route sweep and cross-account probes pass |
| Backup / restore | `backup.ps1` (verified with rc1); **new** `restore.ps1` (new database only; NOT TESTED, Docker unavailable) |

## 2.3 Containers (`compose.release.yaml`)
| Check | Result |
|---|---|
| Non-root | api, scheduler and migrate run as `bagla` (uid 10001); web runs as `node`; postgres and nginx use their official images' defaults (nginx master runs as root, workers as `nginx`) |
| Health checks | db, api, web: yes. gateway and scheduler: none; the scheduler is monitored through `/health/jobs` |
| Graceful shutdown | uvicorn handles SIGTERM; postgres does a clean shutdown on `docker compose stop` |
| Restart policy | `unless-stopped`; migrate `no` |
| Log rotation | **New:** json-file 3 × 10 MB per service. Takes effect at the next `start.ps1` |
| Exposed ports | Only the gateway, on `127.0.0.1:${APP_PORT}`. The DB isn't published |
| Worker | A separate `scheduler` service (local); a scheduled job on App Platform |
| Env handling | `.env.release` (git-ignored) is generated with random secrets by `start.ps1`; `.env.release.example` has empty values |

## 2.4 Release scripts
| Script | Status |
|---|---|
| `start.ps1`, `stop.ps1`, `status.ps1`, `seed-demo.ps1`, `backup.ps1` | PASS with rc1 (Docker, extracted package); unchanged since |
| `restore.ps1` | New; parses; NOT TESTED (Docker unavailable) |
| Migration | Run by the `migrate` service (local) or the PRE_DEPLOY job (App Platform) |

## Not done / blocked
- **RC4 Docker install test:** BLOCKED (C: has 25 MB free; Docker CLI hangs).
- **Re-checking the release stack with the new log caps:** pending the next `start.ps1`.
