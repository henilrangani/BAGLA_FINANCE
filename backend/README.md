# Bagla Finance — Backend (FastAPI + PostgreSQL)

Server-side ledger, authentication, budgets, goals and reports. The React app in the repository root is **not connected yet**; that's Phase 3.

Origin: copied on 2026-11-04 from the local foundation at `Desktop\BAGLA_FINANCE_PYTHON_READY_FIXED\BAGLA_FINANCE_PYTHON_READY`, which was not under Git. That folder was left untouched. See `../DECISIONS.md` D11.

## Local setup (Windows)
```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
copy .env.example .env      # then set JWT_SECRET (see comment in the file)
docker compose up -d        # local PostgreSQL 16 (needs Docker Desktop running)
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```
Interactive API docs: http://127.0.0.1:8000/docs (disabled when `ENVIRONMENT` is `staging` or `production`).

## Tests
```powershell
.\.venv\Scripts\python.exe -m pytest -q             # SQLite (no setup needed)
$env:TEST_DATABASE_URL="postgresql+asyncpg://bagla:bagla_local_only@localhost:5432/bagla_finance"
.\.venv\Scripts\python.exe -m pytest -q             # same suite on PostgreSQL (DESTROYS that DB's tables)
.\.venv\Scripts\ruff.exe check app migrations tests
```
Only run the PostgreSQL suite against a **throwaway** local database. It drops and recreates every table.

## Layout
- `app/models`: SQLAlchemy models (`ledger.py` is the authoritative ledger)
- `app/services`: business rules (`ledger.py`, `reports.py`, `planning.py`, `auth_service.py`)
- `app/api/v1/routes`: HTTP endpoints
- `migrations/versions`: Alembic migrations (0001 original, 0002 ledger/auth/planning)

Full details: `../ARCHITECTURE.md`, `../DATABASE_SCHEMA.md`, `../API_DOCUMENTATION.md`.
