from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, Field

MAX_PAISE = 1_000_000_000_000  # ₹1,000 crore per entry; guards typos/overflow

# Strict: JSON 12.5, "1250" or true are rejected. Money is always integer minor units.
PositivePaise = Annotated[int, Field(strict=True, gt=0, le=MAX_PAISE)]
SignedPaise = Annotated[int, Field(strict=True, ge=-MAX_PAISE, le=MAX_PAISE)]


def _currency(v: str) -> str:
    v = v.strip().upper()
    if len(v) != 3 or not v.isalpha():
        raise ValueError("currency must be a 3-letter ISO 4217 code")
    return v


Currency = Annotated[str, AfterValidator(_currency)]


def _tz(v: str) -> str:
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("unknown time zone; use an IANA name like Asia/Kolkata") from None
    return v


TimeZoneName = Annotated[str, Field(max_length=64), AfterValidator(_tz)]


def _aware(v: datetime | None) -> datetime | None:
    if v is not None and v.tzinfo is None:
        raise ValueError("timestamp must include a time zone offset, e.g. 2026-11-04T10:30:00+05:30")
    return v


AwareDatetime = Annotated[datetime, AfterValidator(_aware)]

Text160 = Annotated[str, Field(min_length=1, max_length=160)]
