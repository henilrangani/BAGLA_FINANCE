"""Reminder preferences and a notification outbox (services/reminders.py).

Delivery channels: "in_app" (always available; shown in the app's bell) and "email"
(only through a configured provider; none is configured, so email items are recorded as
`skipped` with the reason, never as delivered).
"""
import uuid
from datetime import datetime, time

from sqlalchemy import JSON, Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Time, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, UTCDateTime, UUIDMixin


class NotificationPreference(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "notification_preferences"
    __table_args__ = (UniqueConstraint("user_id", name="uq_notification_pref_user"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bill_reminders: Mapped[bool] = mapped_column(Boolean, default=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)  # opt-in only
    quiet_start: Mapped[time | None] = mapped_column(Time, nullable=True)  # local time, e.g. 22:00
    quiet_end: Mapped[time | None] = mapped_column(Time, nullable=True)  # local time, e.g. 07:00


class Notification(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("user_id", "channel", "dedupe_key", name="uq_notification_dedupe"),
        CheckConstraint("channel IN ('in_app', 'email')", name="ck_notification_channel"),
        CheckConstraint("status IN ('pending', 'delivered', 'failed', 'skipped')", name="ck_notification_status"),
        Index("ix_notifications_pending", "status", "next_attempt_at"),  # delivery queue scan
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    channel: Mapped[str] = mapped_column(String(16), default="in_app")
    dedupe_key: Mapped[str] = mapped_column(String(160))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(String(500))
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(UTCDateTime)
    delivered_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
