"""Family Space: shared budgets and goals (server-backed).

Privacy model (enforced in routes/family_finance.py):
- Budgets measure only entries their owners explicitly shared with the family.
- Goal contributions are records of money a member says they set aside; they don't
  move money or touch anyone's ledger. Each member sees who contributed how much.
- Nothing is hard-deleted: budgets/goals are archived, contributions voided.
"""
import uuid
from datetime import date

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, UUIDMixin


class FamilyBudget(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "family_budgets"
    __table_args__ = (CheckConstraint("limit_paise > 0", name="ck_family_budget_limit"),)

    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("family_groups.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)  # None = all shared spending
    limit_paise: Mapped[int] = mapped_column(BigInteger)  # per calendar month
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"),
                                                         nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)


class FamilyGoal(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "family_goals"
    __table_args__ = (
        CheckConstraint("target_paise > 0", name="ck_family_goal_target"),
        CheckConstraint("status IN ('active', 'completed', 'archived')", name="ck_family_goal_status"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("family_groups.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    target_paise: Mapped[int] = mapped_column(BigInteger)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"),
                                                         nullable=True)


class FamilyGoalContribution(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "family_goal_contributions"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_family_contribution_amount"),
        CheckConstraint("status IN ('recorded', 'void')", name="ck_family_contribution_status"),
        UniqueConstraint("goal_id", "idempotency_key", name="uq_family_contribution_idem"),
    )

    goal_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("family_goals.id", ondelete="CASCADE"), index=True)
    # SET NULL: a member deleting their account keeps the goal's history for the family.
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"),
                                                      nullable=True, index=True)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    contributed_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="recorded")
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
