"""Recurring bills: schedules, due list, pay/skip with no duplicate postings.

No background scheduler is needed for correctness: due dates are computed
from the schedule whenever the list is requested, so a missed day (app closed,
phone off) still appears as due. Push/email reminders need a scheduler and a
provider (not configured); the API exposes what is due or coming up so the app
can remind in-app.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import RecurringBill, RecurringOccurrence, User
from app.schemas.common import PositivePaise
from app.schemas.transaction import TransactionCreate
from app.services import ledger
from app.services.ledger import audit, conflict, get_account, local_date_for, not_found
from app.services.schedule import is_scheduled, next_on_or_after, occurrences

router = APIRouter()
Freq = Literal["daily", "weekly", "monthly", "quarterly", "yearly"]


class BillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    amount_paise: PositivePaise
    frequency: Freq = "monthly"
    start_date: date
    end_date: date | None = None
    category: str | None = Field(default=None, max_length=80)
    account_id: uuid.UUID | None = None
    remind_days_before: int = Field(default=3, ge=0, le=30)

    @model_validator(mode="after")
    def order(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class BillUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    amount_paise: PositivePaise | None = None
    category: str | None = Field(default=None, max_length=80)
    end_date: date | None = None
    remind_days_before: int | None = Field(default=None, ge=0, le=30)
    status: Literal["active", "paused", "cancelled"] | None = None
    account_id: uuid.UUID | None = None


class PayIn(BaseModel):
    account_id: uuid.UUID | None = None
    amount_paise: PositivePaise | None = None  # if the bill amount differed this time


def _today(user: User) -> date:
    return local_date_for(datetime.now(timezone.utc), user.timezone)


async def _bill(db: AsyncSession, user: User, bill_id: uuid.UUID) -> RecurringBill:
    b = await db.scalar(select(RecurringBill).where(RecurringBill.id == bill_id, RecurringBill.user_id == user.id))
    if b is None:
        raise not_found("Bill not found")
    return b


async def _handled(db: AsyncSession, bill_id: uuid.UUID) -> dict[date, RecurringOccurrence]:
    return {o.due_date: o for o in await db.scalars(select(RecurringOccurrence).where(
        RecurringOccurrence.bill_id == bill_id))}


async def _view(db: AsyncSession, b: RecurringBill, today: date) -> dict:
    handled = await _handled(db, b.id)
    due = [d for d in occurrences(b.start_date, b.frequency, today, b.end_date) if d not in handled] \
        if b.status == "active" else []
    nxt = next_on_or_after(b.start_date, b.frequency, today + timedelta(days=1), b.end_date) \
        if b.status == "active" else None
    return {
        "id": b.id, "name": b.name, "amount_paise": b.amount_paise, "currency": b.currency, "category": b.category,
        "account_id": b.account_id, "frequency": b.frequency, "start_date": b.start_date, "end_date": b.end_date,
        "status": b.status, "remind_days_before": b.remind_days_before,
        "overdue_dates": due,  # scheduled on or before today, not paid/skipped (missed runs included)
        "next_due_date": due[0] if due else nxt,
        "reminder_due": bool(due) or bool(nxt and (nxt - today).days <= b.remind_days_before),
        "history": [{"due_date": d, "status": o.status, "transaction_id": o.transaction_id}
                    for d, o in sorted(handled.items(), reverse=True)][:24],
    }


@router.get("")
async def list_bills(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    today = _today(user)
    bills = await db.scalars(select(RecurringBill).where(RecurringBill.user_id == user.id,
                                                         RecurringBill.status != "cancelled")
                             .order_by(RecurringBill.created_at))
    return [await _view(db, b, today) for b in bills]


@router.post("", status_code=201)
async def create_bill(payload: BillCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if payload.account_id:
        await get_account(db, user.id, payload.account_id)
    b = RecurringBill(user_id=user.id, **payload.model_dump())
    db.add(b)
    await db.flush()
    audit(db, user.id, "recurring_bill", b.id, "create", None, payload.model_dump(mode="json"))
    await db.commit()
    return await _view(db, b, _today(user))


@router.patch("/{bill_id}")
async def update_bill(bill_id: uuid.UUID, payload: BillUpdate, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    b = await _bill(db, user, bill_id)
    if b.status == "cancelled":
        raise conflict("Cancelled bills can't be changed; create a new one")
    ch = payload.model_dump(exclude_unset=True)
    if ch.get("account_id"):
        await get_account(db, user.id, ch["account_id"])
    before = {k: str(getattr(b, k)) for k in ch}
    for k, v in ch.items():
        setattr(b, k, v)
    if b.end_date and b.end_date < b.start_date:
        raise conflict("end_date must be on or after start_date")
    audit(db, user.id, "recurring_bill", b.id, "update", before, payload.model_dump(mode="json", exclude_unset=True))
    await db.commit()
    return await _view(db, b, _today(user))


@router.get("/due")
async def due_soon(within_days: int = Query(default=7, ge=0, le=60), user: User = Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)):
    """Everything overdue plus anything due within `within_days` (for in-app reminders)."""
    today = _today(user)
    out = []
    for b in await db.scalars(select(RecurringBill).where(RecurringBill.user_id == user.id,
                                                          RecurringBill.status == "active")):
        handled = await _handled(db, b.id)
        for d in occurrences(b.start_date, b.frequency, today + timedelta(days=within_days), b.end_date):
            if d not in handled:
                out.append({"bill_id": b.id, "name": b.name, "due_date": d, "amount_paise": b.amount_paise,
                            "overdue": d < today})
    return sorted(out, key=lambda x: (x["due_date"], x["name"]))


async def _occurrence(db, user, bill_id, due_date, status_: str, pay: PayIn | None):
    b = await _bill(db, user, bill_id)
    if b.status != "active":
        raise conflict("Only active bills can be paid or skipped")
    if not is_scheduled(b.start_date, b.frequency, due_date, b.end_date):
        raise HTTPException(422, "That date isn't on this bill's schedule")
    if due_date > _today(user) + timedelta(days=60):
        raise HTTPException(422, "Too far in the future")
    existing = await db.scalar(select(RecurringOccurrence).where(RecurringOccurrence.bill_id == b.id,
                                                                 RecurringOccurrence.due_date == due_date))
    if existing:
        if existing.status != status_:
            raise conflict(f"This occurrence is already marked {existing.status}")
        return await _view(db, b, _today(user))  # idempotent retry
    tx_id = None
    if status_ == "paid":
        account_id = (pay and pay.account_id) or b.account_id
        if account_id is None:
            raise HTTPException(422, "Choose the account this bill was paid from")
        await get_account(db, user.id, account_id)
        tx, _ = await ledger.create_transaction(db, user, TransactionCreate(
            account_id=account_id, amount_paise=(pay and pay.amount_paise) or b.amount_paise, kind="expense",
            description=f"{b.name} ({due_date.isoformat()})", category=b.category,
            occurred_at=datetime.combine(due_date, datetime.min.time().replace(hour=12), timezone.utc),
            idempotency_key=f"rec:{b.id}:{due_date.isoformat()}"))
        tx_id = tx.id
    db.add(RecurringOccurrence(bill_id=b.id, due_date=due_date, status=status_, transaction_id=tx_id))
    audit(db, user.id, "recurring_bill", b.id, status_, None, {"due_date": due_date.isoformat(),
                                                               "transaction_id": str(tx_id) if tx_id else None})
    await db.commit()
    return await _view(db, b, _today(user))


@router.post("/{bill_id}/occurrences/{due_date}/pay")
async def pay(bill_id: uuid.UUID, due_date: date, payload: PayIn | None = None,
              user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _occurrence(db, user, bill_id, due_date, "paid", payload)


@router.post("/{bill_id}/occurrences/{due_date}/skip")
async def skip(bill_id: uuid.UUID, due_date: date, user: User = Depends(get_current_user),
               db: AsyncSession = Depends(get_db)):
    return await _occurrence(db, user, bill_id, due_date, "skipped", None)
