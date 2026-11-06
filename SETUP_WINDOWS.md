# Windows Setup (PowerShell)

Tested on Windows 11 with Docker Desktop (WSL 2) on 2026-11-06.

## 1. Install and start Docker Desktop
- Install Docker Desktop from docker.com if you don't have it, and start it.
- Wait until the whale icon says **Docker Desktop is running**.
- Check in PowerShell:
```powershell
docker version
docker compose version
```
Both should print versions without errors.

## 2. Extract the package
Extract `BAGLA_FINANCE_BETA_RELEASE_CANDIDATE_2026-11-06.zip` to a folder, for example `D:\BAGLA_RC`. Then:
```powershell
cd D:\BAGLA_RC
```

## 3. Configure environment variables
**Automatic (recommended):** skip this step. `start.ps1` creates `.env.release` with a random database password and a random 64-character signing secret.

**Manual:**
```powershell
Copy-Item .env.release.example .env.release
notepad .env.release
```
- Set `POSTGRES_PASSWORD` to a long random value.
- Set `JWT_SECRET` to at least 32 random characters.
- Optional: `APP_PORT` (default 8080) and `GEMINI_API_KEY` (leave empty; AI then uses rule-based answers).

Startup refuses to run if either required value is missing, or if `JWT_SECRET` is short or a known weak value. Keep `.env.release` private and never share or commit it.

## 4. Start: database, migrations, API, web
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1
```
In order, this:
1. Builds the images. The first time takes 5–10 minutes and needs internet to download base images and packages.
2. Starts PostgreSQL and waits until it's healthy.
3. Runs `alembic upgrade head` once (the `migrate` container), migrating to `0009_job_runs`.
4. Starts the API and waits for `/health`.
5. Starts the web server, the reminder scheduler and the gateway.

It ends with `BAGLA FINANCE is running: http://localhost:8080`.

The same thing without the script:
```powershell
docker compose -f compose.release.yaml --env-file .env.release up -d --build
```

## 5. Verify startup
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\status.ps1
```
Expected:
- `db`, `api` and `web` show **healthy**; `scheduler` and `gateway` show **running**.
- `/health: {"status":"ok"}`.
- `/health/jobs` shows `"healthy":true` once the reminder job has run (within a minute of start).

Then open **http://localhost:8080** in Chrome, Edge or Firefox.

## 6. First use
1. Click **Account & Sync** in the sidebar, then **New here? Create an account**.
2. Enter a name, an email and a password of 12+ characters, and click **Create account**.
3. For sample data instead, run the seed script. It prints a demo email and a one-time password:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\seed-demo.ps1
```

## 7. Stop, restart, back up
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\stop.ps1      # data kept in volume bagla_rc_pgdata
powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1     # same data comes back
powershell -ExecutionPolicy Bypass -File scripts\windows\backup.ps1    # backups\bagla_rc_<date>.dump + .sha256
```
Containers restart automatically after a reboot once Docker Desktop is running (`restart: unless-stopped`), unless you stopped them.

**Do not** run `docker compose -f compose.release.yaml down -v`, `docker volume prune` or `docker system prune`. Each deletes the database.

## 8. Logs
```powershell
docker compose -f compose.release.yaml --env-file .env.release logs --tail 100 api
docker compose -f compose.release.yaml --env-file .env.release logs --tail 100 scheduler
```
