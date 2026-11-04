from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.services import reports
from app.services.planning import today_for

router = APIRouter()


@router.get("/summary")
async def summary(from_date: date | None = None, to_date: date | None = None,
                  user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Income, spend, refunds, categories, cash vs digital for a date range (default: this month)."""
    today = today_for(user.timezone)
    start = from_date or today.replace(day=1)
    end = to_date or today
    if end < start:
        raise HTTPException(422, "to_date must be on or after from_date")
    if (end - start).days > 366 * 5:
        raise HTTPException(422, "range too large (max 5 years)")
    return await reports.summary(db, user.id, start, end)


@router.get("/net-worth")
async def net_worth(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await reports.net_worth(db, user.id)


@router.get("/reconciliation")
async def reconciliation(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await reports.reconciliation(db, user.id)
