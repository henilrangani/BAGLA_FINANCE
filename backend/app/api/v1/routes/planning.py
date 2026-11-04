from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Budget, GoalContribution, SavingsGoal, User
from app.schemas.planning import (
    BudgetCreate,
    BudgetResponse,
    BudgetUpdate,
    ContributionCreate,
    ContributionResponse,
    GoalCreate,
    GoalResponse,
    GoalUpdate,
)
from app.services.ledger import audit, conflict
from app.services.planning import budget_view, get_budget, get_goal, goal_saved, goal_view, today_for

budgets = APIRouter()
goals = APIRouter()


@budgets.get("", response_model=list[BudgetResponse])
async def list_budgets(include_archived: bool = False, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    stmt = select(Budget).where(Budget.user_id == user.id)
    if not include_archived:
        stmt = stmt.where(Budget.is_archived.is_(False))
    return [await budget_view(db, b, user.timezone) for b in await db.scalars(stmt.order_by(Budget.created_at))]


@budgets.post("", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
async def create_budget(payload: BudgetCreate, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    data = payload.model_dump()
    data["start_date"] = data["start_date"] or today_for(user.timezone).replace(day=1)
    b = Budget(user_id=user.id, **data)
    db.add(b)
    await db.flush()
    audit(db, user.id, "budget", b.id, "create", None, payload.model_dump(mode="json"))
    await db.commit()
    return await budget_view(db, b, user.timezone)


@budgets.patch("/{budget_id}", response_model=BudgetResponse)
async def update_budget(budget_id: UUID, payload: BudgetUpdate, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    b = await get_budget(db, user.id, budget_id)
    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(b, k) for k in changes}
    for k, v in changes.items():
        setattr(b, k, v)
    if b.end_date and b.end_date < b.start_date:
        raise conflict("end_date must be on or after start_date")
    audit(db, user.id, "budget", b.id, "update", {k: str(v) for k, v in before.items()},
          payload.model_dump(mode="json", exclude_unset=True))
    await db.commit()
    return await budget_view(db, b, user.timezone)


@goals.get("", response_model=list[GoalResponse])
async def list_goals(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user.id,
                                                     SavingsGoal.is_archived.is_(False)))
    return [await goal_view(db, g) for g in rows]


@goals.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(payload: GoalCreate, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    g = SavingsGoal(user_id=user.id, **payload.model_dump())
    db.add(g)
    await db.flush()
    audit(db, user.id, "goal", g.id, "create", None, payload.model_dump(mode="json"))
    await db.commit()
    return await goal_view(db, g)


@goals.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: UUID, payload: GoalUpdate, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    g = await get_goal(db, user.id, goal_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    audit(db, user.id, "goal", g.id, "update", None, payload.model_dump(mode="json", exclude_unset=True))
    await db.commit()
    return await goal_view(db, g)


@goals.get("/{goal_id}/contributions", response_model=list[ContributionResponse])
async def list_contributions(goal_id: UUID, user: User = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    await get_goal(db, user.id, goal_id)
    return list(await db.scalars(select(GoalContribution).where(GoalContribution.goal_id == goal_id)
                                 .order_by(GoalContribution.contributed_on)))


@goals.post("/{goal_id}/contributions", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def contribute(goal_id: UUID, payload: ContributionCreate, user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    g = await get_goal(db, user.id, goal_id)
    if payload.direction == "withdrawal" and payload.amount_paise > await goal_saved(db, g.id):
        raise conflict("Can't withdraw more than has been saved")
    c = GoalContribution(goal_id=g.id, user_id=user.id, amount_paise=payload.amount_paise,
                         direction=payload.direction, note=payload.note,
                         contributed_on=payload.contributed_on or today_for(user.timezone))
    db.add(c)
    await db.flush()
    audit(db, user.id, "goal_contribution", c.id, "create", None, payload.model_dump(mode="json"))
    await db.commit()
    return await goal_view(db, g)
