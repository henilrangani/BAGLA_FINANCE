"""Budgets and savings goals. Spent / saved figures are always derived, never stored."""
import uuid
from datetime import date

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, UUIDMixin

PERIODS = ("daily", "weekly", "monthly", "yearly")


class Budget(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "budgets"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_budget_amount_positive"),
        CheckConstraint("period IN ('daily', 'weekly', 'monthly', 'yearly')", name="ck_budget_period"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)  # None = all spending
    period: Mapped[str] = mapped_column(String(16), default="monthly")
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    rollover: Mapped[bool] = mapped_column(Boolean, default=False)
    alert_threshold_pct: Mapped[int] = mapped_column(BigInteger, default=80)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)


class SavingsGoal(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "savings_goals"
    __table_args__ = (CheckConstraint("target_paise > 0", name="ck_goal_target_positive"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    target_paise: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)


class GoalContribution(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "goal_contributions"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_contrib_amount_positive"),
        CheckConstraint("direction IN ('deposit', 'withdrawal')", name="ck_contrib_direction"),
    )

    goal_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("savings_goals.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount_paise: Mapped[int] = mapped_column(BigInteger)
    direction: Mapped[str] = mapped_column(String(16), default="deposit")
    contributed_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
