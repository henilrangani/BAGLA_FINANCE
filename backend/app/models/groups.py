"""Group expense splitting and recurring bills (server-backed).

Groups:
- Members may be registered users (user_id set) or named people without an
  account (e.g. friends on a trip). Only members linked to a user can access
  the group; an admin manages members.
- Each expense stores exact integer-paise shares that must sum to the amount
  (enforced in the service). Settlements are recorded payments between
  members. Balances are always derived, never stored. Nothing is hard-
  deleted: expenses and settlements are voided.
- Group expenses are separate from personal ledgers; they never appear in
  another member's personal transactions.

Recurring bills:
- Due dates are generated from the schedule on demand, so missed days are
  never skipped or duplicated regardless of when the app was last opened.
- Paying an occurrence posts one expense with idempotency key
  rec:<bill>:<date>, and the (bill, due_date) pair is unique.
"""
import uuid
from datetime import date

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, UUIDMixin


class SplitGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "split_groups"

    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(500), default="")
    cover_emoji: Mapped[str] = mapped_column(String(16), default="👥")
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    budget_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"),
                                                         nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    # Optimistic concurrency: every money-changing write bumps this (see routes/splits._bump).
    version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class SplitMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "split_members"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'member')", name="ck_split_member_role"),
        CheckConstraint("status IN ('active', 'removed')", name="ck_split_member_status"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_groups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"),
                                                      nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    upi_id: Mapped[str | None] = mapped_column(String(320), nullable=True)
    role: Mapped[str] = mapped_column(String(16), default="member")
    status: Mapped[str] = mapped_column(String(16), default="active")
    # Single-use link token so a named member can claim their seat (stored hashed).
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    invite_expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)


class SplitExpense(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "split_expenses"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_split_expense_amount"),
        CheckConstraint("status IN ('posted', 'void')", name="ck_split_expense_status"),
        UniqueConstraint("group_id", "idempotency_key", name="uq_split_expense_idem"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_groups.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(String(300))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    paid_by_member_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_members.id", ondelete="RESTRICT"))
    expense_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="posted")
    created_by_user: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # The payer's own ledger entry mirroring this expense (created server-side, voided with it).
    personal_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)


class SplitLedgerLink(Base, UUIDMixin, TimestampMixin):
    """A member's opt-in to share-based entries in their own ledger for one group."""
    __tablename__ = "split_ledger_links"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_split_ledger_link"),)

    group_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_groups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_members.id", ondelete="CASCADE"))
    group_account_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("financial_accounts.id", ondelete="CASCADE"))
    funding_account_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("financial_accounts.id",
                                                                         ondelete="CASCADE"))


class SplitShare(Base, UUIDMixin):
    __tablename__ = "split_shares"
    __table_args__ = (
        CheckConstraint("share_paise >= 0", name="ck_split_share_nonneg"),
        UniqueConstraint("expense_id", "member_id", name="uq_split_share"),
    )

    expense_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_expenses.id", ondelete="CASCADE"),
                                                  index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_members.id", ondelete="RESTRICT"))
    share_paise: Mapped[int] = mapped_column(BigInteger)


class SplitSettlement(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "split_settlements"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_split_settlement_amount"),
        CheckConstraint("status IN ('recorded', 'void')", name="ck_split_settlement_status"),
        CheckConstraint("from_member_id <> to_member_id", name="ck_split_settlement_distinct"),
        UniqueConstraint("group_id", "idempotency_key", name="uq_split_settlement_idem"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_groups.id", ondelete="CASCADE"), index=True)
    from_member_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_members.id", ondelete="RESTRICT"))
    to_member_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("split_members.id", ondelete="RESTRICT"))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    method: Mapped[str] = mapped_column(String(24), default="upi")
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="recorded")
    created_by_user: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)


class RecurringBill(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "recurring_bills"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_recurring_amount"),
        CheckConstraint("frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')", name="ck_recurring_freq"),
        CheckConstraint("status IN ('active', 'paused', 'cancelled')", name="ck_recurring_status"),
        CheckConstraint("remind_days_before BETWEEN 0 AND 30", name="ck_recurring_remind"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("financial_accounts.id", ondelete="SET NULL"), nullable=True)
    frequency: Mapped[str] = mapped_column(String(16), default="monthly")
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")
    remind_days_before: Mapped[int] = mapped_column(Integer, default=3)


class RecurringOccurrence(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "recurring_occurrences"
    __table_args__ = (
        UniqueConstraint("bill_id", "due_date", name="uq_recurring_occurrence"),
        CheckConstraint("status IN ('paid', 'skipped')", name="ck_occurrence_status"),
    )

    bill_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("recurring_bills.id", ondelete="CASCADE"), index=True)
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16))
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
