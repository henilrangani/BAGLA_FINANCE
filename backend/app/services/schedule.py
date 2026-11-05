"""Recurring schedule maths. Pure functions, unit-tested.

Monthly/quarterly/yearly schedules keep the start date's day of month and
clamp to the month end (31 Jan → 28/29 Feb → 31 Mar), so they never drift.
"""
import calendar
from datetime import date, timedelta

STEP_MONTHS = {"monthly": 1, "quarterly": 3, "yearly": 12}
MAX_OCCURRENCES = 400  # safety bound per query


def _add_months(start: date, months: int) -> date:
    y, m = divmod(start.month - 1 + months, 12)
    year, month = start.year + y, m + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def nth_occurrence(start: date, frequency: str, n: int) -> date:
    if frequency == "daily":
        return start + timedelta(days=n)
    if frequency == "weekly":
        return start + timedelta(weeks=n)
    return _add_months(start, STEP_MONTHS[frequency] * n)


def occurrences(start: date, frequency: str, until: date, end: date | None = None,
                since: date | None = None) -> list[date]:
    """All scheduled dates in [since or start, min(until, end)], in order."""
    last = min(until, end) if end else until
    out: list[date] = []
    n = 0
    while len(out) < MAX_OCCURRENCES:
        d = nth_occurrence(start, frequency, n)
        if d > last:
            break
        if since is None or d >= since:
            out.append(d)
        n += 1
    return out


def is_scheduled(start: date, frequency: str, d: date, end: date | None = None) -> bool:
    return d in occurrences(start, frequency, d, end, since=d)


def next_on_or_after(start: date, frequency: str, d: date, end: date | None = None) -> date | None:
    n = 0
    while n < 100_000:
        x = nth_occurrence(start, frequency, n)
        if end and x > end:
            return None
        if x >= d:
            return x
        n += 1
    return None
