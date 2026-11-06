"""Bill reminders: scheduling, quiet hours, opt-out, retries.

`queue_bill_reminders(db, now)` is idempotent: one notification per (user, channel, bill,
due date). Run it periodically (e.g. every 15 minutes from cron or a platform scheduler:
`python -m app.jobs.reminders`). `deliver_pending(db, now, email)` hands due items to their
channel and retries failures with exponential backoff (5 attempts).

- Dates are computed in each user's own timezone (users.timezone), so "due tomorrow" is
  right for IST users even when the job runs on a UTC server.
- Quiet hours (local) delay delivery until they end; nothing is dropped.
- Opt-out: bill_reminders=false stops new reminders; email is opt-in and needs a provider.
- Email: no provider is configured in this project, so email items become `skipped`
  ("no email provider configured"); they are never reported as delivered.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Protocol
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RecurringBill, RecurringOccurrence, User
from app.models.notifications import Notification, NotificationPreference
from app.services.schedule import next_on_or_after, occurrences

MAX_ATTEMPTS = 5


class EmailProvider(Protocol):
    name: str

    async def send(self, to: str, subject: str, body: str) -> None: ...


@dataclass
class DisabledEmailProvider:
    """Default: nothing is sent. Wire a real provider (after founder approval) to enable email."""
    name: str = "disabled"

    async def send(self, to: str, subject: str, body: str) -> None:  # pragma: no cover - never called
        raise RuntimeError("no email provider configured")


def _local(now: datetime, tz: str) -> datetime:
    try:
        return now.astimezone(ZoneInfo(tz))
    except Exception:  # noqa: BLE001 - bad stored timezone: fall back to India
        return now.astimezone(ZoneInfo("Asia/Kolkata"))


def in_quiet_hours(local_t: time, start: time | None, end: time | None) -> bool:
    if start is None or end is None or start == end:
        return False
    return start <= local_t < end if start < end else (local_t >= start or local_t < end)


def quiet_release(now: datetime, tz: str, start: time | None, end: time | None) -> datetime:
    """When a notification created `now` may be delivered (now, or the end of quiet hours)."""
    loc = _local(now, tz)
    if not in_quiet_hours(loc.time(), start, end):
        return now
    release = loc.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)
    if release <= loc:
        release += timedelta(days=1)
    return release.astimezone(timezone.utc)


async def prefs_for(db: AsyncSession, user_id) -> NotificationPreference:
    p = await db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user_id))
    return p or NotificationPreference(user_id=user_id, bill_reminders=True, email_enabled=False)


def _due_dates(b: RecurringBill, today: date, handled: set[date]) -> list[tuple[date, bool]]:
    """(due date, overdue?) that deserve a reminder now: overdue ones, and the next within the lead time."""
    out = [(d, True) for d in occurrences(b.start_date, b.frequency, today - timedelta(days=1), b.end_date)
           if d not in handled][-3:]  # at most the 3 most recent missed ones
    nxt = next_on_or_after(b.start_date, b.frequency, today, b.end_date)
    if nxt and nxt not in handled and (nxt - today).days <= b.remind_days_before:
        out.append((nxt, False))
    return out


async def queue_bill_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    rows = (await db.execute(
        select(RecurringBill, User.timezone, User.is_active).join(User, User.id == RecurringBill.user_id)
        .where(RecurringBill.status == "active"))).all()
    # Plain snapshots: a rollback (duplicate) must not expire what the loop still reads.
    work = [dict(id=b.id, user_id=b.user_id, name=b.name, amount=b.amount_paise, start=b.start_date,
                 freq=b.frequency, end=b.end_date, lead=b.remind_days_before, tz=tz)
            for b, tz, active in rows if active]
    created = 0
    for w in work:
        pref = await prefs_for(db, w["user_id"])
        if not pref.bill_reminders:
            continue
        quiet = (pref.quiet_start, pref.quiet_end)
        channels = ["in_app"] + (["email"] if pref.email_enabled else [])
        today = _local(now, w["tz"]).date()
        handled = {o.due_date for o in await db.scalars(select(RecurringOccurrence).where(
            RecurringOccurrence.bill_id == w["id"]))}
        bill = RecurringBill(start_date=w["start"], frequency=w["freq"], end_date=w["end"],
                             remind_days_before=w["lead"])
        for due, overdue in _due_dates(bill, today, handled):
            amount = f"₹{w['amount'] // 100:,}.{w['amount'] % 100:02d}"
            when = "was due" if overdue else ("is due today" if due == today else f"is due on {due:%d %b}")
            key = f"bill:{w['id']}:{due}"
            for ch in channels:
                exists = await db.scalar(select(Notification.id).where(
                    Notification.user_id == w["user_id"], Notification.channel == ch, Notification.dedupe_key == key))
                if exists:
                    continue
                db.add(Notification(user_id=w["user_id"], kind="bill_due", channel=ch, dedupe_key=key,
                                    title=f"{w['name']} {when}", body=f"{w['name']}: {amount} {when}.",
                                    data={"bill_id": str(w["id"]), "due_date": due.isoformat()},
                                    next_attempt_at=quiet_release(now, w["tz"], *quiet)))
                try:
                    await db.commit()
                    created += 1
                except IntegrityError:
                    await db.rollback()  # a concurrent run queued it first
    return created


LEASE = timedelta(minutes=10)


async def deliver_pending(db: AsyncSession, now: datetime | None = None,
                          email: EmailProvider | None = None) -> dict:
    """Deliver due notifications. Each row is *claimed* with a conditional update that pushes
    next_attempt_at forward by a lease, committed before sending; only the claimer sends.
    Works the same on PostgreSQL and SQLite. A crash mid-send leaves the row to be retried when
    the lease expires (at-least-once for email; in-app delivery is idempotent)."""
    now = now or datetime.now(timezone.utc)
    email = email or DisabledEmailProvider()
    stats = {"delivered": 0, "failed": 0, "skipped": 0, "retry": 0}
    for _ in range(500):
        cand = await db.scalar(select(Notification.id).where(Notification.status == "pending",
                                                             Notification.next_attempt_at <= now)
                               .order_by(Notification.next_attempt_at).limit(1)
                               .with_for_update(skip_locked=True))
        if cand is None:
            break
        claimed = await db.execute(update(Notification).where(
            Notification.id == cand, Notification.status == "pending", Notification.next_attempt_at <= now)
            .values(next_attempt_at=now + LEASE))
        await db.commit()
        if claimed.rowcount != 1:
            continue  # another worker took it
        n = await db.get(Notification, cand)
        await db.refresh(n)
        if n.channel == "in_app":
            n.status, n.delivered_at = "delivered", now
            stats["delivered"] += 1
        elif email.name == "disabled":
            n.status, n.last_error = "skipped", "no email provider configured"
            stats["skipped"] += 1
        else:
            user = await db.get(User, n.user_id)
            n.attempts += 1
            try:
                await email.send(user.email, n.title, n.body)
                n.status, n.delivered_at, n.last_error = "delivered", now, None
                stats["delivered"] += 1
            except Exception as e:  # noqa: BLE001 - provider errors are retried
                n.last_error = str(e)[:300]
                if n.attempts >= MAX_ATTEMPTS:
                    n.status = "failed"
                    stats["failed"] += 1
                else:
                    n.next_attempt_at = now + timedelta(minutes=2 ** n.attempts)
                    stats["retry"] += 1
        await db.commit()
    return stats
