"""The authoritative ledger.

Rules (enforced by constraints here and by app/services/ledger.py):
- Money is BIGINT minor units (paise for INR). amount_paise is always > 0;
  `direction` says whether it adds to (credit) or removes from (debit) the
  account.
- Account balance = opening_balance_paise + credits - debits over entries with
  status 'posted'. It is never stored, so it can't drift.
- `kind` drives reporting: transfers, reversals and adjustments are never
  income or expense; refunds reduce spend and must reference the original.
- Entries are never hard-deleted. "Delete" sets status='void'; every change
  writes an immutable audit_events row.
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
    Index,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, UTCDateTime, UUIDMixin, utcnow

ACCOUNT_TYPES = ("bank", "cash", "savings", "credit_card", "wallet", "loan", "investment", "other")
DIRECTIONS = ("debit", "credit")
KINDS = (
    "income",
    "expense",
    "transfer",
    "refund",
    "reversal",
    "savings_contribution",
    "loan_repayment",
    "investment",
    "adjustment",
)
STATUSES = ("pending", "posted", "void")
SOURCES = (
    "manual",
    "voice",
    "receipt",
    "import",
    "notification_observed",
    "aggregator",
    "ai_suggested",
    "migration",
)


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


class FinancialAccount(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "financial_accounts"
    __table_args__ = (CheckConstraint(_in("account_type", ACCOUNT_TYPES), name="ck_account_type"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    account_type: Mapped[str] = mapped_column(String(40))
    opening_balance_paise: Mapped[int] = mapped_column(BigInteger, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Transaction(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_tx_amount_positive"),
        CheckConstraint(_in("direction", DIRECTIONS), name="ck_tx_direction"),
        CheckConstraint(_in("kind", KINDS), name="ck_tx_kind"),
        CheckConstraint(_in("status", STATUSES), name="ck_tx_status"),
        CheckConstraint(_in("source", SOURCES), name="ck_tx_source"),
        UniqueConstraint("user_id", "idempotency_key", name="uq_tx_user_idempotency"),
        UniqueConstraint("reverses_id", name="uq_tx_reverses_id"),  # an entry can be reversed only once
        Index("ix_tx_user_local_date", "user_id", "local_date"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("financial_accounts.id", ondelete="RESTRICT"), index=True
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    direction: Mapped[str] = mapped_column(String(10))
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="posted")
    description: Mapped[str] = mapped_column(String(500))
    merchant: Mapped[str | None] = mapped_column(String(160), nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # When it happened: UTC instant + the user's local calendar date and zone.
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    local_date: Mapped[date] = mapped_column(Date)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    # Provenance
    source: Mapped[str] = mapped_column(String(40), default="manual")
    source_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    # Links
    transfer_group_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    refund_of_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    reverses_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=True
    )
    # Private by default. Set only by the owner to share this one entry with a family.
    shared_family_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("family_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)


class AuditEvent(Base, UUIDMixin):
    """Append-only history of every change to financial records."""

    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    action: Mapped[str] = mapped_column(String(40))
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
