# Deployment Guide

**Nothing has been deployed.** Production deployment requires founder approval (see `MASTER_DEVELOPMENT_PROMPT.md`).

## Environments
| Env | Frontend | Backend | Database |
|---|---|---|---|
| Local | `npm run dev` (127.0.0.1:3000) | `uvicorn` (127.0.0.1:8000) | Docker Postgres 16 |
| Staging (proposed) | Vercel preview | container host (TBD) | managed Postgres (TBD) |
| Production | after approval | after approval | after approval |

## Free-first hosting candidates (verify current terms before choosing; the founder decides)
- **Frontend:** Vercel Hobby (personal or non-commercial use only per Vercel's terms, so a paid plan or Cloudflare Pages may be needed for a commercial launch).
- **Backend:** any container host that runs the `backend/Dockerfile`.
- **Database:** managed Postgres with automated backups and PITR. Free tiers usually pause, cap storage, or lack PITR, so they aren't suitable for paying customers' financial records.

Before choosing, check commercial-use terms, backup and restore, region (India data residency preferences), uptime, and cost at about 200 users.

## Backend release checklist
1. CI is green on the branch (frontend, backend, PostgreSQL tests, migrations up/down/up).
2. `ENVIRONMENT=staging|production`, a strong `JWT_SECRET` from the host's secret store, and `CORS_ORIGINS` set to the exact frontend origin.
3. Take a database backup → `alembic upgrade head` → smoke test `/health`, register, login, create a transaction, reconciliation `ok`.
4. Roll back: redeploy the previous image. Migrations are additive, so roll back the schema only if required (`alembic downgrade -1` after a backup).

## Frontend
See the root `README.md` (Vercel). Set `GEMINI_API_KEY`, `GEMINI_MODEL` and `WEBHOOK_SECRET` only in Vercel's environment settings.
