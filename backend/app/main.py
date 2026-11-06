from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging

configure_logging()
settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.2.0",
    # Interactive docs only outside production.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # never "*": requests carry credentials
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Bagla-Client", "X-Bagla-CSRF"],
)


@app.middleware("http")
async def guard(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > settings.max_body_bytes:
        return JSONResponse({"detail": "Request body too large"}, status_code=413)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/docs"):
        del response.headers["Content-Security-Policy"]  # Swagger UI needs scripts (dev only)
    return response


app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/jobs")
async def health_jobs():
    """For uptime monitors: is the reminder job running on schedule? No user data is returned."""
    from datetime import datetime, timezone

    from sqlalchemy import select

    from app.core.database import get_db
    from app.models.jobs import JobRun

    async for db in get_db():
        last_ok = await db.scalar(select(JobRun.finished_at).where(JobRun.job == "reminders", JobRun.status == "ok")
                                  .order_by(JobRun.finished_at.desc()).limit(1))
        last = await db.scalar(select(JobRun).where(JobRun.job == "reminders")
                               .order_by(JobRun.started_at.desc()).limit(1))
        age = (datetime.now(timezone.utc) - last_ok).total_seconds() if last_ok else None
        healthy = age is not None and age <= 45 * 60  # 3 missed 15-minute runs
        body = {"reminders": {"last_success_at": last_ok, "age_seconds": int(age) if age is not None else None,
                              "last_status": last.status if last else None, "healthy": healthy}}
        return JSONResponse(jsonable_encoder(body), status_code=200 if healthy else 503)
