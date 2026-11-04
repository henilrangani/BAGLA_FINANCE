import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, UTCDateTime, UUIDMixin, utcnow


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"
    # Constraint names match what migration 0001 created in PostgreSQL.
    __table_args__ = (
        UniqueConstraint("email", name="users_email_key"),
        UniqueConstraint("bagla_id", name="users_bagla_id_key"),
    )

    email: Mapped[str] = mapped_column(String(320), index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    full_name: Mapped[str] = mapped_column(String(160))
    bagla_id: Mapped[str] = mapped_column(String(64), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Staff access is granted only directly in the database (never via the API).
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Preferences
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    locale: Mapped[str] = mapped_column(String(8), default="en")
    default_currency: Mapped[str] = mapped_column(String(3), default="INR")
    # Brute-force protection
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class AuthSession(Base, UUIDMixin):
    """A refresh-token session. Tokens are stored only as SHA-256 hashes and rotated on every use."""

    __tablename__ = "auth_sessions"
    __table_args__ = (UniqueConstraint("refresh_token_hash", name="auth_sessions_refresh_token_hash_key"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
