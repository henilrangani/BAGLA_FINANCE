"""Statement imports, family sharing, support, feedback and Bagla's own subscriptions.

Bagla subscription billing (Plan, UserSubscription, BillingEvent) is kept
completely separate from users' personal-finance ledger tables.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, UTCDateTime, UUIDMixin

# --------------------------------------------------------------------------- imports


class ImportBatch(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "import_batches"
    __table_args__ = (
        CheckConstraint("status IN ('preview', 'committed', 'cancelled')", name="ck_import_status"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("financial_accounts.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(255))
    file_sha256: Mapped[str] = mapped_column(String(64), index=True)
    file_format: Mapped[str] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(16), default="preview")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    imported_count: Mapped[int] = mapped_column(Integer, default=0)
    column_map: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class ImportRow(Base, UUIDMixin):
    __tablename__ = "import_rows"

    batch_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("import_batches.id", ondelete="CASCADE"), index=True)
    row_number: Mapped[int] = mapped_column(Integer)
    local_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str] = mapped_column(String(500), default="")
    amount_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    direction: Mapped[str | None] = mapped_column(String(10), nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dedupe_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)


# --------------------------------------------------------------------------- family

FAMILY_ROLES = ("admin", "adult", "child", "viewer")


class FamilyGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "family_groups"

    name: Mapped[str] = mapped_column(String(120))
    # SET NULL: one member deleting their account must never delete the family for everyone else.
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"),
                                                         nullable=True)


class FamilyMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "family_members"
    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_family_member"),
        CheckConstraint("role IN ('admin', 'adult', 'child', 'viewer')", name="ck_family_role"),
        CheckConstraint("status IN ('active', 'removed')", name="ck_family_member_status"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("family_groups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="active")


class FamilyInvite(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "family_invites"
    __table_args__ = (CheckConstraint("role IN ('admin', 'adult', 'child', 'viewer')", name="ck_invite_role"),)

    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("family_groups.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(16))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"),
                                                         nullable=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    accepted_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


# --------------------------------------------------------------------------- support & feedback


class SupportTicket(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'in_progress', 'resolved', 'closed')", name="ck_ticket_status"),
        CheckConstraint("priority IN ('low', 'normal', 'high', 'urgent')", name="ck_ticket_priority"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reference: Mapped[str] = mapped_column(String(16), unique=True)
    category: Mapped[str] = mapped_column(String(32))
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    subject: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(4000))
    status: Mapped[str] = mapped_column(String(16), default="open")
    staff_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)


class Feedback(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "feedback"
    __table_args__ = (CheckConstraint("rating IS NULL OR (rating BETWEEN 1 AND 5)", name="ck_feedback_rating"),)

    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32))
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    context: Mapped[str | None] = mapped_column(String(80), nullable=True)  # e.g. screen / onboarding step


# --------------------------------------------------------------------------- Bagla subscriptions (NOT the user ledger)


class Plan(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "plans"
    __table_args__ = (CheckConstraint("billing_interval IN ('month', 'year')", name="ck_plan_interval"),)

    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    # None = price not decided; such plans can be trialled but not purchased.
    price_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    billing_interval: Mapped[str] = mapped_column(String(8), default="month")
    trial_days: Mapped[int] = mapped_column(Integer, default=7)
    features: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserSubscription(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "user_subscriptions"
    __table_args__ = (
        CheckConstraint("status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')", name="ck_sub_status"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    plan_code: Mapped[str] = mapped_column(String(40), ForeignKey("plans.code"))
    status: Mapped[str] = mapped_column(String(16))
    trial_ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    canceled_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    trial_used: Mapped[bool] = mapped_column(Boolean, default=True)


class BillingEvent(Base, UUIDMixin, TimestampMixin):
    """Append-only billing history (trial started, canceled, payment events from a future gateway)."""

    __tablename__ = "billing_events"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    plan_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    amount_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    provider_ref: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
