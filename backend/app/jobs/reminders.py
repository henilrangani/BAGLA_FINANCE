"""Scheduled job: queue bill reminders, then deliver due notifications.

Run every ~15 minutes (cron, a platform scheduler, or a systemd timer):
    python -m app.jobs.reminders
Safe to run concurrently or repeatedly: queuing is idempotent and delivery is per-row.
"""
import asyncio
import logging

from app.core.database import get_db
from app.services.reminders import deliver_pending, queue_bill_reminders

log = logging.getLogger("bagla.jobs.reminders")


async def run() -> dict:
    async for db in get_db():
        queued = await queue_bill_reminders(db)
        stats = await deliver_pending(db)
        return {"queued": queued, **stats}
    return {}


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    log.info("reminders run: %s", asyncio.run(run()))
