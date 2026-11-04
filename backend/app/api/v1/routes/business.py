"""Support tickets, feedback, Bagla subscriptions and staff admin.

Honesty rules:
- Tickets are stored only; no email is sent (no provider configured), and the
  response says so.
- No payment gateway is connected. Plans without a price can be trialled but
  not purchased. Prices are never invented here; staff configure them.
- Admin endpoints expose operational data only (tickets, feedback, counts),
  never users' transactions, balances or account details.
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import (
    BillingEvent,
    Feedback,
    FinancialAccount,
    ImportBatch,
    Plan,
    SupportTicket,
    Transaction,
    User,
    UserSubscription,
)
from app.services.ledger import audit, conflict, not_found

support = APIRouter()
feedback = APIRouter()
billing = APIRouter()
admin = APIRouter()

TicketCategory = Literal["account_access", "security", "data_issue", "import", "billing", "bug", "question", "other"]
PRIORITY = {"security": "urgent", "data_issue": "high", "account_access": "high", "billing": "high"}


def now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- support


class TicketCreate(BaseModel):
    category: TicketCategory
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=10, max_length=4000)


def _ticket(t: SupportTicket) -> dict:
    return {"reference": t.reference, "category": t.category, "priority": t.priority, "subject": t.subject,
            "message": t.message, "status": t.status, "created_at": t.created_at, "updated_at": t.updated_at}


@support.post("/tickets", status_code=201)
async def create_ticket(payload: TicketCreate, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    open_count = await db.scalar(select(func.count()).select_from(SupportTicket).where(
        SupportTicket.user_id == user.id, SupportTicket.status.in_(("open", "in_progress"))))
    if (open_count or 0) >= 10:
        raise HTTPException(429, "You have 10 open tickets; please wait for a reply before opening more")
    t = SupportTicket(user_id=user.id, reference="BF-" + secrets.token_hex(3).upper(), category=payload.category,
                      priority=PRIORITY.get(payload.category, "normal"), subject=payload.subject.strip(),
                      message=payload.message.strip())
    db.add(t)
    await db.commit()
    return {**_ticket(t), "notice": "Your request is recorded. Email notifications aren't set up yet, so check "
                                    "status here. Expected first response: within 2 working days."}


@support.get("/tickets")
async def my_tickets(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(SupportTicket).where(SupportTicket.user_id == user.id)
                            .order_by(SupportTicket.created_at.desc()))
    return [_ticket(t) for t in rows]


# --------------------------------------------------------------------------- feedback


class FeedbackCreate(BaseModel):
    kind: Literal["satisfaction", "feature_request", "usability", "bug", "onboarding_completed",
                  "onboarding_abandoned"]
    rating: int | None = Field(default=None, ge=1, le=5)
    message: str | None = Field(default=None, max_length=2000)
    context: str | None = Field(default=None, max_length=80)


@feedback.post("", status_code=201)
async def give_feedback(payload: FeedbackCreate, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    f = Feedback(user_id=user.id, **payload.model_dump())
    db.add(f)
    await db.commit()
    return {"id": f.id, "thanks": True}


# --------------------------------------------------------------------------- billing (Bagla's own plans)


def entitlement(sub: UserSubscription | None, plans: dict[str, Plan], at: datetime) -> dict:
    """Server-authoritative access decision. Cancelling never cuts access before the paid/trial end."""
    if sub is None:
        return {"plan": "free", "status": "none", "has_access": False, "access_until": None, "features": {}}
    end = sub.trial_ends_at if sub.status == "trialing" else sub.current_period_end
    has = sub.status in ("trialing", "active", "canceled", "past_due") and end is not None and at < end
    st = sub.status if has else "expired"
    plan = plans.get(sub.plan_code)
    return {"plan": sub.plan_code, "status": st, "has_access": has, "access_until": end,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "features": (plan.features if plan and has else {})}


async def _plans(db: AsyncSession) -> dict[str, Plan]:
    return {p.code: p for p in await db.scalars(select(Plan))}


@billing.get("/plans")
async def list_plans(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return [{"code": p.code, "name": p.name, "price_paise": p.price_paise, "currency": p.currency,
             "billing_interval": p.billing_interval, "trial_days": p.trial_days, "features": p.features,
             "purchasable": False,  # no payment gateway connected yet
             } for p in await db.scalars(select(Plan).where(Plan.is_active.is_(True)))]


@billing.get("/me")
async def my_subscription(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sub = await db.scalar(select(UserSubscription).where(UserSubscription.user_id == user.id))
    return entitlement(sub, await _plans(db), now())


class TrialStart(BaseModel):
    plan_code: str = Field(min_length=1, max_length=40)


@billing.post("/trial", status_code=201)
async def start_trial(payload: TrialStart, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    plan = await db.scalar(select(Plan).where(Plan.code == payload.plan_code, Plan.is_active.is_(True)))
    if plan is None:
        raise not_found("Plan not found")
    if await db.scalar(select(UserSubscription).where(UserSubscription.user_id == user.id)):
        raise conflict("A trial or subscription already exists for this account (one trial per account)")
    end = now() + timedelta(days=plan.trial_days)
    sub = UserSubscription(user_id=user.id, plan_code=plan.code, status="trialing", trial_ends_at=end)
    db.add(sub)
    db.add(BillingEvent(user_id=user.id, event_type="trial_started", plan_code=plan.code,
                        details={"trial_ends_at": end.isoformat()}))
    await db.commit()
    return entitlement(sub, await _plans(db), now())


@billing.post("/cancel")
async def cancel(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sub = await db.scalar(select(UserSubscription).where(UserSubscription.user_id == user.id))
    if sub is None:
        raise not_found("No subscription")
    if not sub.cancel_at_period_end:
        sub.cancel_at_period_end = True
        sub.canceled_at = now()
        if sub.status == "active":
            sub.status = "canceled"  # renewal stops; access continues until current_period_end
        db.add(BillingEvent(user_id=user.id, event_type="cancel_requested", plan_code=sub.plan_code))
        await db.commit()
    return entitlement(sub, await _plans(db), now())


@billing.post("/resume")
async def resume(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sub = await db.scalar(select(UserSubscription).where(UserSubscription.user_id == user.id))
    if sub is None:
        raise not_found("No subscription")
    end = sub.trial_ends_at if sub.status == "trialing" else sub.current_period_end
    if end is None or end <= now():
        raise conflict("This subscription has ended; start a new one instead")
    sub.cancel_at_period_end = False
    sub.canceled_at = None
    if sub.status == "canceled":
        sub.status = "active"
    db.add(BillingEvent(user_id=user.id, event_type="resumed", plan_code=sub.plan_code))
    await db.commit()
    return entitlement(sub, await _plans(db), now())


@billing.get("/history")
async def history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(BillingEvent).where(BillingEvent.user_id == user.id)
                            .order_by(BillingEvent.created_at))
    return [{"event": e.event_type, "plan": e.plan_code, "amount_paise": e.amount_paise, "at": e.created_at}
            for e in rows]


# --------------------------------------------------------------------------- admin (staff only)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        # 404 (not 403) so the admin surface isn't discoverable.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return user


class TicketUpdate(BaseModel):
    status: Literal["open", "in_progress", "resolved", "closed"] | None = None
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    staff_note: str | None = Field(default=None, max_length=2000)


class PlanUpsert(BaseModel):
    code: str = Field(pattern=r"^[a-z0-9_-]{2,40}$")
    name: str = Field(min_length=1, max_length=80)
    price_paise: int | None = Field(default=None, strict=True, gt=0, le=10_000_000)
    billing_interval: Literal["month", "year"] = "month"
    trial_days: int = Field(default=7, ge=0, le=30)
    features: dict = Field(default_factory=dict)
    is_active: bool = True


@admin.get("/overview")
async def overview(staff: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    count = lambda model: select(func.count()).select_from(model)  # noqa: E731
    return {
        "users": await db.scalar(count(User)),
        "accounts": await db.scalar(count(FinancialAccount)),
        "transactions": await db.scalar(count(Transaction)),
        "imports": await db.scalar(count(ImportBatch)),
        "open_tickets": await db.scalar(count(SupportTicket).where(SupportTicket.status.in_(("open", "in_progress")))),
        "subscriptions_by_status": dict((await db.execute(
            select(UserSubscription.status, func.count()).group_by(UserSubscription.status))).all()),
        "feedback_avg_rating": await db.scalar(select(func.avg(Feedback.rating))),
    }


@admin.get("/tickets")
async def all_tickets(staff: User = Depends(require_admin), db: AsyncSession = Depends(get_db),
                      status_: str | None = None):
    stmt = select(SupportTicket).order_by(SupportTicket.created_at.desc()).limit(500)
    if status_:
        stmt = stmt.where(SupportTicket.status == status_)
    return [{**_ticket(t), "id": t.id, "staff_note": t.staff_note} for t in await db.scalars(stmt)]


@admin.patch("/tickets/{ticket_id}")
async def update_ticket(ticket_id: UUID, payload: TicketUpdate, staff: User = Depends(require_admin),
                        db: AsyncSession = Depends(get_db)):
    t = await db.get(SupportTicket, ticket_id)
    if t is None:
        raise not_found("Ticket not found")
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(t, k, v)
    audit(db, t.user_id, "support_ticket", t.id, "staff_update", None, {**changes, "staff": str(staff.id)})
    await db.commit()
    return _ticket(t)


@admin.get("/feedback")
async def all_feedback(staff: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(Feedback).order_by(Feedback.created_at.desc()).limit(500))
    return [{"kind": f.kind, "rating": f.rating, "message": f.message, "context": f.context, "at": f.created_at}
            for f in rows]


@admin.put("/plans")
async def upsert_plan(payload: PlanUpsert, staff: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    plan = await db.scalar(select(Plan).where(Plan.code == payload.code))
    if plan is None:
        plan = Plan(**payload.model_dump())
        db.add(plan)
    else:
        for k, v in payload.model_dump().items():
            setattr(plan, k, v)
    await db.flush()
    audit(db, staff.id, "plan", plan.id, "upsert", None, payload.model_dump(mode="json"))
    await db.commit()
    return {"code": plan.code, "price_paise": plan.price_paise, "trial_days": plan.trial_days}
