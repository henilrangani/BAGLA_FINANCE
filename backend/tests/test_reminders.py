"""Bill reminders: idempotent queuing, user timezone, quiet hours, opt-out, retries, honest email."""
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select

from app.core.database import get_db
from app.models.notifications import Notification
from app.services.reminders import deliver_pending, in_quiet_hours, queue_bill_reminders, quiet_release
from tests.conftest import auth, register

API = "/api/v1"
IST = timezone(timedelta(hours=5, minutes=30))


async def run(now, email=None):
    async for db in get_db():
        q = await queue_bill_reminders(db, now)
        d = await deliver_pending(db, now, email)
        return q, d


async def bill(client, h, start, **extra):
    r = await client.post(f"{API}/recurring", headers=auth(h), json={
        "name": "Internet", "amount_paise": 79900, "frequency": "monthly", "start_date": start, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_quiet_hours_maths():
    assert in_quiet_hours(time(23, 0), time(22, 0), time(7, 0))
    assert in_quiet_hours(time(6, 59), time(22, 0), time(7, 0))
    assert not in_quiet_hours(time(7, 0), time(22, 0), time(7, 0))
    assert not in_quiet_hours(time(12, 0), None, None)
    # 23:30 IST with quiet 22:00-07:00 → released at 07:00 IST next day (01:30 UTC).
    now = datetime(2026, 11, 6, 18, 0, tzinfo=timezone.utc)  # 23:30 IST
    assert quiet_release(now, "Asia/Kolkata", time(22), time(7)) == datetime(2026, 11, 7, 1, 30, tzinfo=timezone.utc)


async def test_reminders_are_queued_once_in_the_users_timezone(client):
    h = await register(client, "rem@example.com")
    # 18:45 UTC on 6 Nov = 00:15 IST on 7 Nov: the bill due on 7 Nov is "today" for this user.
    now = datetime(2026, 11, 6, 18, 45, tzinfo=timezone.utc)
    await bill(client, h, "2026-11-07", remind_days_before=0)
    q, d = await run(now)
    assert q == 1 and d["delivered"] == 1
    items = (await client.get(f"{API}/notifications", headers=auth(h))).json()
    assert [i["title"] for i in items] == ["Internet is due today"]
    assert "₹799.00" in items[0]["body"]
    # Re-running never duplicates.
    assert (await run(now))[0] == 0 and len((await client.get(f"{API}/notifications", headers=auth(h))).json()) == 1
    # Read state.
    nid = items[0]["id"]
    assert (await client.post(f"{API}/notifications/{nid}/read", headers=auth(h))).status_code == 200
    assert (await client.get(f"{API}/notifications", headers=auth(h))).json()[0]["read"] is True


async def test_paid_bills_and_opt_out_get_no_reminders(client):
    h = await register(client, "opt@example.com")
    acc = (await client.get(f"{API}/accounts", headers=auth(h))).json()[0]["id"]
    now = datetime(2026, 11, 7, 6, 0, tzinfo=timezone.utc)  # 11:30 IST
    b = await bill(client, h, "2026-11-07", remind_days_before=3, account_id=acc)
    await client.post(f"{API}/recurring/{b['id']}/occurrences/2026-11-07/pay", headers=auth(h))
    assert (await run(now))[0] == 0  # paid: nothing to remind
    await bill(client, h, "2026-11-09", remind_days_before=3)
    r = await client.patch(f"{API}/notifications/preferences", headers=auth(h), json={"bill_reminders": False})
    assert r.json()["bill_reminders"] is False
    assert (await run(now))[0] == 0  # opted out
    await client.patch(f"{API}/notifications/preferences", headers=auth(h), json={"bill_reminders": True})
    assert (await run(now))[0] == 1  # due in 2 days, within the 3-day lead time


async def test_quiet_hours_delay_but_never_drop(client):
    h = await register(client, "quiet@example.com")
    await client.patch(f"{API}/notifications/preferences", headers=auth(h),
                       json={"quiet_start": "22:00:00", "quiet_end": "07:00:00"})
    late = datetime(2026, 11, 6, 17, 0, tzinfo=timezone.utc)  # 22:30 IST
    await bill(client, h, "2026-11-07", remind_days_before=1)
    q, d = await run(late)
    assert q == 1 and d["delivered"] == 0
    assert (await client.get(f"{API}/notifications", headers=auth(h))).json() == []
    morning = datetime(2026, 11, 7, 1, 31, tzinfo=timezone.utc)  # 07:01 IST
    assert (await run(morning))[1]["delivered"] == 1
    assert len((await client.get(f"{API}/notifications", headers=auth(h))).json()) == 1


async def test_email_is_never_reported_sent_without_a_provider_and_retries_with_one(client):
    h = await register(client, "mail@example.com")
    prefs = (await client.patch(f"{API}/notifications/preferences", headers=auth(h),
                                json={"email_enabled": True})).json()
    assert prefs["email_delivery_available"] is False
    now = datetime(2026, 11, 7, 6, 0, tzinfo=timezone.utc)
    await bill(client, h, "2026-11-07", remind_days_before=0)
    q, d = await run(now)
    assert q == 2 and d["delivered"] == 1 and d["skipped"] == 1  # in-app delivered; email skipped, not "sent"
    async for db in get_db():
        e = await db.scalar(select(Notification).where(Notification.channel == "email"))
        assert e.status == "skipped" and e.last_error == "no email provider configured" and e.delivered_at is None

    # With a (fake) provider that fails twice: retried with backoff, then delivered once.
    @dataclass
    class Flaky:
        name: str = "fake"
        calls: list = field(default_factory=list)

        async def send(self, to, subject, body):
            self.calls.append(to)
            if len(self.calls) < 3:
                raise RuntimeError("temporary failure")

    h2 = await register(client, "mail2@example.com")
    await client.patch(f"{API}/notifications/preferences", headers=auth(h2), json={"email_enabled": True})
    await bill(client, h2, "2026-11-07", remind_days_before=0)
    p = Flaky()
    t = now
    for _ in range(6):
        await run(t, p)
        t += timedelta(minutes=40)
    assert p.calls == ["mail2@example.com"] * 3
    async for db in get_db():
        e = await db.scalar(select(Notification).where(Notification.channel == "email",
                                                       Notification.status == "delivered"))
        assert e is not None and e.attempts == 3


async def test_notifications_are_private(client):
    a = await register(client, "na@example.com")
    b = await register(client, "nb@example.com")
    await bill(client, a, "2026-11-07", remind_days_before=0)
    await run(datetime(2026, 11, 7, 6, 0, tzinfo=timezone.utc))
    nid = (await client.get(f"{API}/notifications", headers=auth(a))).json()[0]["id"]
    assert (await client.get(f"{API}/notifications", headers=auth(b))).json() == []
    assert (await client.post(f"{API}/notifications/{nid}/read", headers=auth(b))).status_code == 404
    _ = IST


async def test_missed_months_are_reminded_as_overdue(client):
    h = await register(client, "late@example.com")
    await bill(client, h, "2026-09-07", remind_days_before=0)  # Sep and Oct unpaid, Nov due today
    q, _ = await run(datetime(2026, 11, 7, 6, 0, tzinfo=timezone.utc))
    titles = sorted(i["title"] for i in (await client.get(f"{API}/notifications", headers=auth(h))).json())
    assert q == 3 and titles == ["Internet is due today", "Internet was due", "Internet was due"]
