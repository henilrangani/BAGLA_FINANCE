# BAGLA FINANCE: Beta Release Candidate (2026-11-06)

**Every Rupee. Clearly Managed.**

BAGLA FINANCE is an India-first app for personal, group and family money. You can:
- record income, expenses and transfers in exact paise;
- see account balances and a dashboard;
- plan budgets and savings goals;
- import bank statements (CSV/XLSX);
- split group expenses and record paybacks;
- share chosen entries in a family space;
- track recurring bills with in-app reminders;
- export everything your account holds.

This package runs the whole app on your own computer with Docker. It is a **release candidate for a private beta**: it is not deployed anywhere and isn't connected to any bank, UPI app, card network, Account Aggregator or email service. See `KNOWN_LIMITATIONS.md`.

## What's inside
| Part | Technology |
|---|---|
| Web app | React 19, Vite 6, Tailwind 4 (built into static files) |
| Web server | Node 22 + Express (serves the app; AI routes with rule-based fallbacks) |
| API | Python 3.13, FastAPI, SQLAlchemy 2 (async), Alembic migrations, Argon2id passwords |
| Database | PostgreSQL 16 in its own Docker volume `bagla_rc_pgdata` |
| Gateway | nginx: one address for the app (`/`) and the API (`/api/v1`) |
| Scheduler | Reminder job every 15 minutes (in-app reminders) |

Money is stored as whole paise (integers) everywhere. Transfers are never counted as income or spending. AI is advisory only and cannot change your records.

## Prerequisites
- Windows 10/11 with **Docker Desktop** running (WSL 2 backend). Other systems with Docker Compose v2 work too.
- About **3 GB free disk space on the drive Docker uses** (usually C:) for the first build.
- A modern browser: **Chrome, Edge or Firefox**. Safari over plain `http://localhost` won't keep you signed in (see Troubleshooting).
- No Node or Python install is needed; everything builds inside Docker.

## Start
Full Windows steps: `SETUP_WINDOWS.md`. In PowerShell, from the extracted folder:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1
```
The first run:
1. Creates `.env.release` with new random secrets.
2. Builds the images (5–10 minutes).
3. Creates the database.
4. Runs all migrations.
5. Starts everything.

Then open **http://localhost:8080**.

Optional synthetic demo account with sample data (invented names and amounts only):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\seed-demo.ps1
```

## Stop and restart
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\stop.ps1     # stops; your data is kept
powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1    # starts again with the same data
powershell -ExecutionPolicy Bypass -File scripts\windows\status.ps1   # container health + health endpoints
powershell -ExecutionPolicy Bypass -File scripts\windows\backup.ps1   # database backup + SHA-256 in backups\
```
**Never run `docker compose ... down -v`, `docker volume prune` or `docker system prune`.** They delete the database volume and every record in it.

## Health checks
- `http://localhost:8080/health`: `{"status":"ok"}` when the API is up.
- `http://localhost:8080/health/jobs`: reminder job status. It returns 503 if the job hasn't succeeded in the last 45 minutes.

## Isolation from other databases
The stack uses its own Docker project (`bagla_rc`), network and volume. The database port is **not published** to your computer, and the app is bound to `127.0.0.1` only, so other devices on your network can't reach it. It never connects to any other PostgreSQL on the machine, including the older `bagla_finance_python_ready` containers. Those are untouched.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Docker is not running` | Start Docker Desktop, wait until it says *Running*, retry. |
| `Set POSTGRES_PASSWORD in .env.release` | `.env.release` is missing a value. Delete only that file **before the first start** and rerun `start.ps1`, or fill it in by hand. After the first start, don't change `POSTGRES_PASSWORD`: the database keeps the original one. |
| Port 8080 already in use | Set `APP_PORT=8090` (any free port) in `.env.release`, rerun `start.ps1`, open `http://localhost:8090`. |
| Page loads but sign-in "expires" immediately | Use `http://localhost:8080` (not your PC's network IP) in Chrome, Edge or Firefox. The sign-in cookie is `Secure`; browsers only accept that over plain http on localhost, and Safari not even there. |
| "Too many requests" when signing in | More than 20 sign-in attempts from your computer in 15 minutes (brute-force protection). Wait 15 minutes. |
| `no space left on device` during build | Free space on the drive Docker uses, then rerun `start.ps1`. |
| Something else | `docker compose -f compose.release.yaml --env-file .env.release logs --tail 100 api` (or `web`, `db`, `gateway`). |

## Documents
- `SETUP_WINDOWS.md`: step-by-step setup.
- `BETA_USER_GUIDE.md`: how to use the app.
- `RELEASE_TEST_REPORT.md`: what was tested and the results.
- `KNOWN_LIMITATIONS.md`: what isn't built or verified.
- `BETA_DEPLOYMENT_CHECKLIST.md`: what's needed before a hosted private beta.
- `BUILD_INFO.txt`: version and source commit.
