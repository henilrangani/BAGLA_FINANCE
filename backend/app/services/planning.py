import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Budget, GoalContribution, SavingsGoal
from app.services.ledger import local_date_for, not_found
from app.services.reports import net_spend, period_bounds, reportable


def today_for(tz: str) -> date:
    return local_date_for(datetime.now(timezone.utc), tz)


async def _spent(db: AsyncSession, b: Budget, start: date, end: date) -> int:
    lo, hi = max(start, b.start_date), min(end, b.end_date) if b.end_date else end
    if hi < lo:
        return 0
    rows = [t for t in await reportable(db, b.user_id, lo, hi) if t.currency == b.currency]
    return max(0, net_spend(rows, b.category))


async def budget_view(db: AsyncSession, b: Budget, tz: str, today: date | None = None) -> dict:
    today = today or today_for(tz)
    start, end = period_bounds(b.period, today)
    rollover = 0
    if b.rollover:
        prev_start, prev_end = period_bounds(b.period, start - timedelta(days=1))
        if prev_end >= b.start_date:
            rollover = max(0, b.amount_paise - await _spent(db, b, prev_start, prev_end))
    available = b.amount_paise + rollover
    spent = await _spent(db, b, start, end)
    used = (spent * 100) // available if available else 0
    alert = "over_limit" if spent > available else "near_limit" if used >= b.alert_threshold_pct else "ok"
    return {
        "id": b.id, "name": b.name, "category": b.category, "period": b.period,
        "amount_paise": b.amount_paise, "currency": b.currency, "rollover": b.rollover,
        "alert_threshold_pct": b.alert_threshold_pct, "start_date": b.start_date, "end_date": b.end_date,
        "is_archived": b.is_archived, "period_start": start, "period_end": end, "rollover_paise": rollover,
        "available_paise": available, "spent_paise": spent, "remaining_paise": available - spent,
        "used_pct": int(used), "alert": alert,
    }


async def get_budget(db: AsyncSession, user_id: uuid.UUID, budget_id: uuid.UUID) -> Budget:
    b = await db.scalar(select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id))
    if b is None:
        raise not_found("Budget not found")
    return b


async def get_goal(db: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> SavingsGoal:
    g = await db.scalar(select(SavingsGoal).where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id))
    if g is None:
        raise not_found("Goal not found")
    return g


async def goal_saved(db: AsyncSession, goal_id: uuid.UUID) -> int:
    rows = await db.scalars(select(GoalContribution).where(GoalContribution.goal_id == goal_id))
    return sum(c.amount_paise if c.direction == "deposit" else -c.amount_paise for c in rows)


async def goal_view(db: AsyncSession, g: SavingsGoal) -> dict:
    saved = await goal_saved(db, g.id)
    return {
        "id": g.id, "name": g.name, "target_paise": g.target_paise, "currency": g.currency,
        "deadline": g.deadline, "is_archived": g.is_archived, "saved_paise": saved,
        "remaining_paise": max(0, g.target_paise - saved),
        "progress_pct": min(100, (max(saved, 0) * 100) // g.target_paise),
    }
