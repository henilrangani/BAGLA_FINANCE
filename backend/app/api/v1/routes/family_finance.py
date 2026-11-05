"""Family Space: summary, shared budgets, shared goals, contributions, activity, privacy.

Access (every endpoint checks it on the server):
- Only active members of the family in the URL can read anything; others get 404,
  including when they guess the id of another family's budget, goal or contribution.
- admin/adult: create and edit budgets and goals · admin/adult/child: contribute to a goal
  · viewer: read only. Anyone can void their own contribution; admins can void any.
- Spending figures come only from entries their owners explicitly shared with this
  family (transactions.shared_family_id), from active members, posted, never void.
  Nothing here reads a member's private entries, accounts or notes.
"""
import uuid
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.v1.routes.family import membership, require
from app.core.database import get_db
from app.models import AuditEvent, FamilyGroup, FamilyMember, Transaction, User
from app.models.family_finance import FamilyBudget, FamilyGoal, FamilyGoalContribution
from app.schemas.common import PositivePaise
from app.services.ledger import audit, conflict, local_date_for, not_found

router = APIRouter()


class BudgetIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=80)
    limit_paise: PositivePaise


class BudgetPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=80)
    limit_paise: PositivePaise | None = None
    is_archived: bool | None = None


class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_paise: PositivePaise
    target_date: date | None = None


class GoalPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    target_paise: PositivePaise | None = None
    target_date: date | None = None
    status: Literal["active", "completed", "archived"] | None = None


class ContributionIn(BaseModel):
    amount_paise: PositivePaise
    note: str | None = Field(default=None, max_length=300)
    contributed_on: date | None = None
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=120)


def _month(month: str | None, user: User) -> tuple[date, date]:
    if month:
        try:
            y, m = (int(x) for x in month.split("-"))
            start = date(y, m, 1)
        except (ValueError, TypeError):
            raise HTTPException(422, "month must look like 2026-11") from None
    else:
        today = local_date_for(datetime.now(timezone.utc), user.timezone)
        start = today.replace(day=1)
    end = date(start.year + (start.month == 12), start.month % 12 + 1, 1)
    return start, end


async def _names(db: AsyncSession, user_ids: set) -> dict:
    ids = {u for u in user_ids if u}
    if not ids:
        return {}
    return {u.id: u.full_name for u in await db.scalars(select(User).where(User.id.in_(ids)))}


def _contrib_rows(rows, names, me):
    by: dict = {}
    for c in rows:
        key = c.user_id
        e = by.setdefault(key, {"member": names.get(key, "Former member"), "mine": key == me, "amount_paise": 0})
        e["amount_paise"] += c.amount_paise
    return sorted(by.values(), key=lambda x: -x["amount_paise"])


async def _goal_view(db: AsyncSession, g: FamilyGoal, me: uuid.UUID) -> dict:
    rows = list(await db.scalars(select(FamilyGoalContribution).where(
        FamilyGoalContribution.goal_id == g.id, FamilyGoalContribution.status == "recorded")))
    names = await _names(db, {c.user_id for c in rows})
    saved = sum(c.amount_paise for c in rows)
    return {"id": g.id, "name": g.name, "target_paise": g.target_paise, "target_date": g.target_date,
            "status": g.status, "saved_paise": saved, "remaining_paise": max(0, g.target_paise - saved),
            "by_member": _contrib_rows(rows, names, me),
            "contributions": [{"id": c.id, "member": names.get(c.user_id, "Former member"),
                               "mine": c.user_id == me, "amount_paise": c.amount_paise, "note": c.note,
                               "contributed_on": c.contributed_on} for c in
                              sorted(rows, key=lambda c: (c.contributed_on, c.created_at), reverse=True)[:20]]}


async def _shared_rows(db: AsyncSession, family_id: uuid.UUID, start: date, end: date):
    active = select(FamilyMember.user_id).where(FamilyMember.family_id == family_id, FamilyMember.status == "active")
    return list(await db.execute(select(Transaction, User.full_name).join(User, User.id == Transaction.user_id).where(
        Transaction.shared_family_id == family_id, Transaction.status == "posted",
        Transaction.user_id.in_(active), Transaction.local_date >= start, Transaction.local_date < end)))


def _signed(t: Transaction) -> int:
    return t.amount_paise if t.kind == "expense" else -t.amount_paise if t.kind == "refund" else 0


@router.get("/{family_id}/summary")
async def summary(family_id: uuid.UUID, month: str | None = Query(default=None, max_length=7),
                  user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    m = await membership(db, family_id, user.id)
    fam = await db.get(FamilyGroup, family_id)
    start, end = _month(month, user)
    rows = await _shared_rows(db, family_id, start, end)
    by_member: dict = {}
    by_cat: dict = {}
    total = 0
    for t, name in rows:
        amt = _signed(t)
        if amt == 0:
            continue
        total += amt
        e = by_member.setdefault(t.user_id, {"member": name, "mine": t.user_id == user.id, "spend_paise": 0,
                                             "entries": 0})
        e["spend_paise"] += amt
        e["entries"] += 1
        by_cat[t.category or "Uncategorised"] = by_cat.get(t.category or "Uncategorised", 0) + amt
    budgets = []
    for b in await db.scalars(select(FamilyBudget).where(FamilyBudget.family_id == family_id,
                                                         FamilyBudget.is_archived.is_(False))
                              .order_by(FamilyBudget.created_at)):
        spent = total if b.category is None else by_cat.get(b.category, 0)
        budgets.append({"id": b.id, "name": b.name, "category": b.category, "limit_paise": b.limit_paise,
                        "spent_paise": spent, "remaining_paise": b.limit_paise - spent,
                        "over": spent > b.limit_paise})
    goals = [await _goal_view(db, g, user.id) for g in await db.scalars(
        select(FamilyGoal).where(FamilyGoal.family_id == family_id, FamilyGoal.status != "archived")
        .order_by(FamilyGoal.created_at))]
    my_shared = len([1 for t, _ in await _shared_rows(db, family_id, date(1900, 1, 1), date(9999, 1, 1))
                     if t.user_id == user.id])
    return {
        "family": {"id": fam.id, "name": fam.name, "my_role": m.role},
        "period": {"start": start, "end_exclusive": end},
        "shared_spend_paise": total,
        "by_member": sorted(by_member.values(), key=lambda x: -x["spend_paise"]),
        "by_category": sorted([{"category": k, "spend_paise": v} for k, v in by_cat.items()],
                              key=lambda x: -x["spend_paise"]),
        "budgets": budgets, "goals": goals, "my_shared_entries": my_shared,
    }


# --------------------------------------------------------------------------- budgets

async def _budget(db, family_id, budget_id) -> FamilyBudget:
    b = await db.scalar(select(FamilyBudget).where(FamilyBudget.id == budget_id, FamilyBudget.family_id == family_id))
    if b is None:
        raise not_found("Budget not found")
    return b


@router.post("/{family_id}/budgets", status_code=201)
async def create_budget(family_id: uuid.UUID, payload: BudgetIn, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    require(await membership(db, family_id, user.id), "admin", "adult")
    b = FamilyBudget(family_id=family_id, name=payload.name.strip(), category=payload.category,
                     limit_paise=payload.limit_paise, created_by=user.id)
    db.add(b)
    await db.flush()
    audit(db, user.id, "family", family_id, "budget_created", None, {"name": b.name, "limit_paise": b.limit_paise})
    await db.commit()
    return {"id": b.id}


@router.patch("/{family_id}/budgets/{budget_id}")
async def update_budget(family_id: uuid.UUID, budget_id: uuid.UUID, payload: BudgetPatch,
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    require(await membership(db, family_id, user.id), "admin", "adult")
    b = await _budget(db, family_id, budget_id)
    ch = payload.model_dump(exclude_unset=True)
    for k, v in ch.items():
        setattr(b, k, v)
    audit(db, user.id, "family", family_id, "budget_archived" if ch.get("is_archived") else "budget_updated",
          None, {"name": b.name, "limit_paise": b.limit_paise})
    await db.commit()
    return {"id": b.id}


# --------------------------------------------------------------------------- goals

async def _goal(db, family_id, goal_id) -> FamilyGoal:
    g = await db.scalar(select(FamilyGoal).where(FamilyGoal.id == goal_id, FamilyGoal.family_id == family_id))
    if g is None:
        raise not_found("Goal not found")
    return g


@router.post("/{family_id}/goals", status_code=201)
async def create_goal(family_id: uuid.UUID, payload: GoalIn, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    require(await membership(db, family_id, user.id), "admin", "adult")
    g = FamilyGoal(family_id=family_id, name=payload.name.strip(), target_paise=payload.target_paise,
                   target_date=payload.target_date, created_by=user.id)
    db.add(g)
    await db.flush()
    audit(db, user.id, "family", family_id, "goal_created", None, {"name": g.name, "target_paise": g.target_paise})
    await db.commit()
    return await _goal_view(db, g, user.id)


@router.patch("/{family_id}/goals/{goal_id}")
async def update_goal(family_id: uuid.UUID, goal_id: uuid.UUID, payload: GoalPatch,
                      user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    require(await membership(db, family_id, user.id), "admin", "adult")
    g = await _goal(db, family_id, goal_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    audit(db, user.id, "family", family_id, "goal_updated", None, {"name": g.name, "status": g.status})
    await db.commit()
    return await _goal_view(db, g, user.id)


@router.post("/{family_id}/goals/{goal_id}/contributions", status_code=201)
async def contribute(family_id: uuid.UUID, goal_id: uuid.UUID, payload: ContributionIn,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    require(await membership(db, family_id, user.id), "admin", "adult", "child")
    g = await _goal(db, family_id, goal_id)
    if g.status != "active":
        raise conflict("This goal isn't active")
    if payload.idempotency_key:
        existing = await db.scalar(select(FamilyGoalContribution).where(
            FamilyGoalContribution.goal_id == g.id, FamilyGoalContribution.idempotency_key == payload.idempotency_key))
        if existing:
            if existing.amount_paise != payload.amount_paise or existing.user_id != user.id:
                raise conflict("Idempotency key was already used for a different contribution")
            return await _goal_view(db, g, user.id)
    c = FamilyGoalContribution(goal_id=g.id, user_id=user.id, amount_paise=payload.amount_paise, note=payload.note,
                               contributed_on=payload.contributed_on or local_date_for(datetime.now(timezone.utc),
                                                                                       user.timezone),
                               idempotency_key=payload.idempotency_key)
    db.add(c)
    await db.flush()
    audit(db, user.id, "family", family_id, "goal_contribution", None,
          {"goal": g.name, "amount_paise": c.amount_paise})
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise conflict("Duplicate contribution") from None
    return await _goal_view(db, g, user.id)


@router.delete("/{family_id}/goals/{goal_id}/contributions/{contribution_id}")
async def void_contribution(family_id: uuid.UUID, goal_id: uuid.UUID, contribution_id: uuid.UUID,
                            user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    m = await membership(db, family_id, user.id)
    g = await _goal(db, family_id, goal_id)
    c = await db.scalar(select(FamilyGoalContribution).where(FamilyGoalContribution.id == contribution_id,
                                                             FamilyGoalContribution.goal_id == g.id))
    if c is None:
        raise not_found("Contribution not found")
    if c.user_id != user.id:
        require(m, "admin")
    if c.status != "void":
        c.status = "void"
        audit(db, user.id, "family", family_id, "goal_contribution_voided", None,
              {"goal": g.name, "amount_paise": c.amount_paise})
        await db.commit()
    return await _goal_view(db, g, user.id)


# --------------------------------------------------------------------------- privacy & activity

@router.post("/{family_id}/unshare-mine")
async def unshare_mine(family_id: uuid.UUID, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    """Make every entry I shared with this family private again (one tap)."""
    await membership(db, family_id, user.id)
    res = await db.execute(update(Transaction).where(Transaction.user_id == user.id,
                                                     Transaction.shared_family_id == family_id)
                           .values(shared_family_id=None))
    audit(db, user.id, "family", family_id, "entries_unshared", None, {"count": res.rowcount})
    await db.commit()
    return {"unshared": res.rowcount}


_LABELS = {
    "create": "created the family", "join": "joined", "member_removed": "removed a member",
    "role_changed": "changed a member's role", "budget_created": "added a budget", "budget_updated": "edited a budget",
    "budget_archived": "archived a budget", "goal_created": "added a goal", "goal_updated": "updated a goal",
    "goal_contribution": "contributed to a goal", "goal_contribution_voided": "removed a contribution",
    "entry_shared": "shared an entry", "entry_unshared": "made an entry private",
    "entries_unshared": "made their shared entries private",
}
_SAFE = {"name", "goal", "amount_paise", "limit_paise", "target_paise", "role", "status", "count", "description"}


@router.get("/{family_id}/activity")
async def activity(family_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await membership(db, family_id, user.id)
    rows = list(await db.scalars(select(AuditEvent).where(AuditEvent.entity_type == "family",
                                                          AuditEvent.entity_id == family_id)
                                 .order_by(AuditEvent.created_at.desc()).limit(50)))
    names = await _names(db, {r.actor_user_id for r in rows})
    return [{"at": r.created_at, "actor": names.get(r.actor_user_id, "Former member"),
             "mine": r.actor_user_id == user.id, "action": r.action, "label": _LABELS.get(r.action, r.action),
             "details": {k: v for k, v in (r.after or {}).items() if k in _SAFE}} for r in rows]
