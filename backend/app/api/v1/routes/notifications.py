"""In-app notifications and reminder preferences (own data only)."""
import uuid
from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.models.notifications import Notification, NotificationPreference
from app.services.ledger import not_found

router = APIRouter()


class PrefsIn(BaseModel):
    bill_reminders: bool | None = None
    email_enabled: bool | None = None
    quiet_start: time | None = None
    quiet_end: time | None = None


def _prefs_view(p: NotificationPreference) -> dict:
    return {"bill_reminders": p.bill_reminders, "email_enabled": p.email_enabled,
            "quiet_start": p.quiet_start, "quiet_end": p.quiet_end,
            # Honest status: no provider is wired, so email can be chosen but won't be sent.
            "email_delivery_available": False}


@router.get("/preferences")
async def get_prefs(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user.id))
    return _prefs_view(p or NotificationPreference(user_id=user.id, bill_reminders=True, email_enabled=False))


@router.patch("/preferences")
async def set_prefs(payload: PrefsIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user.id))
    if p is None:
        p = NotificationPreference(user_id=user.id, bill_reminders=True, email_enabled=False)
        db.add(p)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.commit()
    return _prefs_view(p)


@router.get("")
async def my_notifications(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(Notification).where(
        Notification.user_id == user.id, Notification.channel == "in_app", Notification.status == "delivered")
        .order_by(Notification.delivered_at.desc()).limit(50))
    return [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "data": n.data,
             "delivered_at": n.delivered_at, "read": n.read_at is not None} for n in rows]


@router.post("/{notification_id}/read")
async def mark_read(notification_id: uuid.UUID, user: User = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    n = await db.scalar(select(Notification).where(Notification.id == notification_id,
                                                   Notification.user_id == user.id))
    if n is None:
        raise not_found("Notification not found")
    n.read_at = n.read_at or datetime.now(timezone.utc)
    await db.commit()
    return {"read": True}


@router.post("/read-all")
async def mark_all_read(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(update(Notification).where(Notification.user_id == user.id,
                                                      Notification.read_at.is_(None))
                           .values(read_at=datetime.now(timezone.utc)))
    await db.commit()
    return {"marked": res.rowcount}
