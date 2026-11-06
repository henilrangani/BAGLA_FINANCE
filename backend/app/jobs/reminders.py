"""Scheduled job: queue bill reminders, then deliver due notifications.

Run every 15 minutes from the host's scheduler (cron / platform scheduled job):
    python -m app.jobs.reminders
Exit code 0 = ran or was skipped because another run holds the lock; 1 = failed (alert on it).

Safety:
- One run at a time: a PostgreSQL advisory lock; an overlapping run records `skipped` and exits.
- Queuing is idempotent (unique per user/channel/bill/due date); delivery claims rows with
  SKIP LOCKED, so nothing is delivered twice even if two runs overlap.
- Every run is recorded in `job_runs` (GET /health/jobs reports staleness for monitoring).
"""
import asyncio
import logging
import sys
from datetime import datetime, timezone

from sqlalchemy import text

from app.core.database import get_db, get_engine
from app.models.jobs import JobRun
from app.services.reminders import deliver_pending, queue_bill_reminders

log = logging.getLogger("bagla.jobs.reminders")
JOB = "reminders"
LOCK_KEY = 870_412_001  # arbitrary, unique to this job


async def run(now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    engine = get_engine()
    pg = engine.url.get_backend_name() == "postgresql"
    async with engine.connect() as lock_conn:
        if pg and not (await lock_conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK_KEY})).scalar():
            await _record(now, "skipped", {"reason": "another run holds the lock"})
            return {"status": "skipped"}
        try:
            async for db in get_db():
                rec = JobRun(job=JOB, started_at=now, status="running")
                db.add(rec)
                await db.commit()
                try:
                    queued = await queue_bill_reminders(db, now)
                    stats = {"queued": queued, **(await deliver_pending(db, now))}
                    rec.status, rec.details = "ok", stats
                except Exception as e:  # noqa: BLE001 - recorded, then re-raised for the exit code
                    await db.rollback()
                    rec.status, rec.details = "error", {"error": str(e)[:300]}
                    raise
                finally:
                    rec.finished_at = datetime.now(timezone.utc)
                    db.add(rec)
                    await db.commit()
                return {"status": rec.status, **(rec.details or {})}
        finally:
            if pg:
                await lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_KEY})
    return {}


async def _record(now: datetime, status: str, details: dict) -> None:
    async for db in get_db():
        db.add(JobRun(job=JOB, started_at=now, finished_at=datetime.now(timezone.utc), status=status, details=details))
        await db.commit()


def main() -> int:  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    try:
        log.info("reminders run: %s", asyncio.run(run()))
        return 0
    except Exception:
        log.exception("reminders run failed")
        return 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
