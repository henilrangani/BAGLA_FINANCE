"""Group expense splitting and settlements (server-backed).

Permissions (enforced here, tested in tests/test_splits_recurring.py):
- Only active members linked to the signed-in user can see or change a group.
- Admins manage the group and its members; any member adds expenses and settlements.
- Voiding: the person who created the entry, or an admin.
- Money is integer paise; shares always sum exactly to the expense amount.
- Settlements can't exceed what the payer currently owes the payee's side
  (prevents accidental double-recording); identical retries are idempotent.
"""
import hashlib
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import SplitExpense, SplitGroup, SplitMember, SplitSettlement, SplitShare, User
from app.schemas.common import PositivePaise
from app.services.ledger import audit, conflict, local_date_for, not_found

router = APIRouter()
VPA = re.compile(r"^[a-zA-Z0-9._-]{1,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$")


def _upi(v: str | None) -> str | None:
    if v is None or v.strip() == "":
        return None
    v = v.strip()
    if not VPA.match(v):
        raise ValueError("UPI ID must look like name@bank")
    return v


class MemberIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    upi_id: str | None = Field(default=None, max_length=320)
    _v = field_validator("upi_id")(lambda cls, v: _upi(v))


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    cover_emoji: str = Field(default="👥", max_length=16)
    budget_paise: PositivePaise | None = None
    members: list[MemberIn] = Field(default_factory=list, max_length=50)
    my_upi_id: str | None = Field(default=None, max_length=320)
    _v = field_validator("my_upi_id")(lambda cls, v: _upi(v))


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    budget_paise: PositivePaise | None = None
    is_archived: bool | None = None


class MemberUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    upi_id: str | None = Field(default=None, max_length=320)
    _v = field_validator("upi_id")(lambda cls, v: _upi(v))


class ShareIn(BaseModel):
    member_id: uuid.UUID
    share_paise: int = Field(strict=True, ge=0)


class ExpenseCreate(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    amount_paise: PositivePaise
    paid_by_member_id: uuid.UUID
    split: Literal["equal", "exact"] = "equal"
    participant_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)  # equal split; default all
    shares: list[ShareIn] | None = Field(default=None, max_length=50)  # exact split
    category: str | None = Field(default=None, max_length=80)
    expense_date: date | None = None
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=120)

    @model_validator(mode="after")
    def check(self):
        if self.split == "exact":
            if not self.shares:
                raise ValueError("exact split needs shares")
            if sum(s.share_paise for s in self.shares) != self.amount_paise:
                raise ValueError("shares must add up exactly to the amount")
            if len({s.member_id for s in self.shares}) != len(self.shares):
                raise ValueError("each member can appear once")
        return self


class ExpenseUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=300)
    category: str | None = Field(default=None, max_length=80)
    expense_date: date | None = None
    amount_paise: PositivePaise | None = None  # re-split equally among the same participants


class SettlementCreate(BaseModel):
    from_member_id: uuid.UUID
    to_member_id: uuid.UUID
    amount_paise: PositivePaise
    method: Literal["upi", "cash", "bank_transfer", "other"] = "upi"
    note: str | None = Field(default=None, max_length=300)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=120)


# --------------------------------------------------------------------------- helpers

def allocate_equal(total: int, n: int) -> list[int]:
    """Largest-remainder split: shares differ by at most 1 paisa and sum exactly."""
    base, rem = divmod(total, n)
    return [base + (1 if i < rem else 0) for i in range(n)]


async def _membership(db: AsyncSession, group_id: uuid.UUID, user: User) -> tuple[SplitGroup, SplitMember]:
    me = await db.scalar(select(SplitMember).where(SplitMember.group_id == group_id, SplitMember.user_id == user.id,
                                                   SplitMember.status == "active"))
    group = await db.get(SplitGroup, group_id) if me else None
    if me is None or group is None:
        raise not_found("Group not found")
    return group, me


def _admin(me: SplitMember) -> None:
    if me.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a group admin can do this")


async def _members(db: AsyncSession, group_id: uuid.UUID, active_only=False) -> list[SplitMember]:
    q = select(SplitMember).where(SplitMember.group_id == group_id)
    if active_only:
        q = q.where(SplitMember.status == "active")
    return list(await db.scalars(q.order_by(SplitMember.created_at, SplitMember.id)))


async def balances(db: AsyncSession, group_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """Net paise per member: paid − share + settlements paid − settlements received. Sums to 0."""
    net: dict[uuid.UUID, int] = {m.id: 0 for m in await _members(db, group_id)}
    exps = {e.id: e for e in await db.scalars(select(SplitExpense).where(
        SplitExpense.group_id == group_id, SplitExpense.status == "posted"))}
    for e in exps.values():
        net[e.paid_by_member_id] += e.amount_paise
    if exps:
        for s in await db.scalars(select(SplitShare).where(SplitShare.expense_id.in_(list(exps)))):
            net[s.member_id] -= s.share_paise
    for st in await db.scalars(select(SplitSettlement).where(
            SplitSettlement.group_id == group_id, SplitSettlement.status == "recorded")):
        net[st.from_member_id] += st.amount_paise
        net[st.to_member_id] -= st.amount_paise
    return net


def suggest(net: dict[uuid.UUID, int]) -> list[dict]:
    debt = sorted([[k, -v] for k, v in net.items() if v < 0], key=lambda x: (-x[1], str(x[0])))
    cred = sorted([[k, v] for k, v in net.items() if v > 0], key=lambda x: (-x[1], str(x[0])))
    out, i, j = [], 0, 0
    while i < len(debt) and j < len(cred):
        amt = min(debt[i][1], cred[j][1])
        out.append({"from_member_id": debt[i][0], "to_member_id": cred[j][0], "amount_paise": amt})
        debt[i][1] -= amt
        cred[j][1] -= amt
        if debt[i][1] == 0:
            i += 1
        if cred[j][1] == 0:
            j += 1
    return out


async def _detail(db: AsyncSession, group: SplitGroup, me: SplitMember) -> dict:
    members = await _members(db, group.id)
    exps = list(await db.scalars(select(SplitExpense).where(SplitExpense.group_id == group.id)
                                 .order_by(SplitExpense.expense_date.desc(), SplitExpense.created_at.desc())))
    shares: dict[uuid.UUID, list] = {}
    if exps:
        for s in await db.scalars(select(SplitShare).where(SplitShare.expense_id.in_([e.id for e in exps]))):
            shares.setdefault(s.expense_id, []).append({"member_id": s.member_id, "share_paise": s.share_paise})
    setts = list(await db.scalars(select(SplitSettlement).where(SplitSettlement.group_id == group.id)
                                  .order_by(SplitSettlement.created_at.desc())))
    net = await balances(db, group.id)
    return {
        "id": group.id, "name": group.name, "description": group.description, "cover_emoji": group.cover_emoji,
        "currency": group.currency, "budget_paise": group.budget_paise, "is_archived": group.is_archived,
        "my_member_id": me.id, "my_role": me.role,
        "members": [{"id": m.id, "display_name": m.display_name, "upi_id": m.upi_id, "role": m.role,
                     "status": m.status, "linked": m.user_id is not None, "is_me": m.id == me.id,
                     "net_paise": net.get(m.id, 0)} for m in members],
        "expenses": [{"id": e.id, "description": e.description, "amount_paise": e.amount_paise,
                      "category": e.category, "paid_by_member_id": e.paid_by_member_id,
                      "expense_date": e.expense_date, "status": e.status, "shares": shares.get(e.id, [])}
                     for e in exps],
        "settlements": [{"id": s.id, "from_member_id": s.from_member_id, "to_member_id": s.to_member_id,
                         "amount_paise": s.amount_paise, "method": s.method, "note": s.note, "status": s.status,
                         "created_at": s.created_at} for s in setts],
        "total_spend_paise": sum(e.amount_paise for e in exps if e.status == "posted"),
        "suggested_settlements": suggest(net),
    }


# --------------------------------------------------------------------------- groups & members

@router.get("")
async def my_groups(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.execute(select(SplitGroup, SplitMember).join(SplitMember, SplitMember.group_id == SplitGroup.id)
                            .where(SplitMember.user_id == user.id, SplitMember.status == "active"))
    out = []
    for g, me in rows:
        net = await balances(db, g.id)
        out.append({"id": g.id, "name": g.name, "cover_emoji": g.cover_emoji, "my_role": me.role,
                    "my_net_paise": net.get(me.id, 0), "is_archived": g.is_archived})
    return out


@router.post("", status_code=201)
async def create_group(payload: GroupCreate, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    g = SplitGroup(name=payload.name.strip(), description=payload.description, cover_emoji=payload.cover_emoji,
                   budget_paise=payload.budget_paise, created_by=user.id)
    db.add(g)
    await db.flush()
    me = SplitMember(group_id=g.id, user_id=user.id, display_name=user.full_name, upi_id=payload.my_upi_id,
                     role="admin")
    db.add(me)
    for m in payload.members:
        db.add(SplitMember(group_id=g.id, display_name=m.display_name.strip(), upi_id=m.upi_id))
    await db.flush()
    audit(db, user.id, "split_group", g.id, "create", None, {"name": g.name, "members": len(payload.members) + 1})
    await db.commit()
    return await _detail(db, g, me)


@router.get("/{group_id}")
async def get_group(group_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    return await _detail(db, g, me)


@router.patch("/{group_id}")
async def update_group(group_id: uuid.UUID, payload: GroupUpdate, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    _admin(me)
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(g, k, v)
    audit(db, user.id, "split_group", g.id, "update", None, payload.model_dump(mode="json", exclude_unset=True))
    await db.commit()
    return await _detail(db, g, me)


@router.post("/{group_id}/members", status_code=201)
async def add_member(group_id: uuid.UUID, payload: MemberIn, user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    _admin(me)
    if len(await _members(db, group_id, active_only=True)) >= 50:
        raise conflict("A group can have at most 50 members")
    m = SplitMember(group_id=g.id, display_name=payload.display_name.strip(), upi_id=payload.upi_id)
    db.add(m)
    await db.flush()
    audit(db, user.id, "split_group", g.id, "member_added", None, {"member_id": str(m.id)})
    await db.commit()
    return await _detail(db, g, me)


@router.patch("/{group_id}/members/{member_id}")
async def update_member(group_id: uuid.UUID, member_id: uuid.UUID, payload: MemberUpdate,
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    m = await db.scalar(select(SplitMember).where(SplitMember.id == member_id, SplitMember.group_id == group_id))
    if m is None:
        raise not_found("Member not found")
    if m.id != me.id:
        _admin(me)  # people edit their own UPI ID; admins edit anyone's
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    audit(db, user.id, "split_group", g.id, "member_updated", None, {"member_id": str(m.id)})
    await db.commit()
    return await _detail(db, g, me)


@router.delete("/{group_id}/members/{member_id}")
async def remove_member(group_id: uuid.UUID, member_id: uuid.UUID, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    m = await db.scalar(select(SplitMember).where(SplitMember.id == member_id, SplitMember.group_id == group_id,
                                                  SplitMember.status == "active"))
    if m is None:
        raise not_found("Member not found")
    if m.id != me.id:
        _admin(me)
    if (await balances(db, group_id)).get(m.id, 0) != 0:
        raise conflict("Settle this member's balance before removing them")
    if m.role == "admin" and sum(1 for x in await _members(db, group_id, True) if x.role == "admin") <= 1:
        raise conflict("A group needs at least one admin")
    m.status = "removed"
    audit(db, user.id, "split_group", g.id, "member_removed", None, {"member_id": str(m.id)})
    await db.commit()
    return {"removed": True}


@router.post("/{group_id}/members/{member_id}/invite")
async def invite_member(group_id: uuid.UUID, member_id: uuid.UUID, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    """One-time code a named member uses to link the seat to their own Bagla account."""
    g, me = await _membership(db, group_id, user)
    _admin(me)
    m = await db.scalar(select(SplitMember).where(SplitMember.id == member_id, SplitMember.group_id == group_id,
                                                  SplitMember.status == "active", SplitMember.user_id.is_(None)))
    if m is None:
        raise not_found("Unlinked member not found")
    token = secrets.token_urlsafe(24)
    m.invite_token_hash = hashlib.sha256(token.encode()).hexdigest()
    m.invite_expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).date()
    await db.commit()
    return {"token": token, "expires_on": m.invite_expires_at}


class ClaimIn(BaseModel):
    token: str = Field(min_length=20, max_length=100)


@router.post("/claim")
async def claim_seat(payload: ClaimIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    m = await db.scalar(select(SplitMember).where(
        SplitMember.invite_token_hash == hashlib.sha256(payload.token.encode()).hexdigest()))
    today = local_date_for(datetime.now(timezone.utc), user.timezone)
    expired = bool(m and m.invite_expires_at and m.invite_expires_at < today)
    if m is None or m.user_id is not None or m.status != "active" or expired:
        raise HTTPException(400, "This code is invalid or has expired")
    if await db.scalar(select(SplitMember).where(SplitMember.group_id == m.group_id, SplitMember.user_id == user.id,
                                                 SplitMember.status == "active")):
        raise conflict("You're already a member of this group")
    m.user_id, m.invite_token_hash, m.invite_expires_at = user.id, None, None
    audit(db, user.id, "split_group", m.group_id, "seat_claimed", None, {"member_id": str(m.id)})
    await db.commit()
    return {"group_id": m.group_id, "member_id": m.id}


# --------------------------------------------------------------------------- expenses

async def _write_shares(db: AsyncSession, exp: SplitExpense, pairs: list[tuple[uuid.UUID, int]]) -> None:
    for mid, p in pairs:
        db.add(SplitShare(expense_id=exp.id, member_id=mid, share_paise=p))


@router.post("/{group_id}/expenses", status_code=201)
async def add_expense(group_id: uuid.UUID, payload: ExpenseCreate, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    if g.is_archived:
        raise conflict("This group is archived")
    if payload.idempotency_key:
        existing = await db.scalar(select(SplitExpense).where(SplitExpense.group_id == group_id,
                                                              SplitExpense.idempotency_key == payload.idempotency_key))
        if existing:
            if existing.amount_paise != payload.amount_paise:
                raise conflict("Idempotency key was already used for a different expense")
            return await _detail(db, g, me)
    active = {m.id for m in await _members(db, group_id, True)}
    if payload.paid_by_member_id not in active:
        raise HTTPException(422, "The payer must be an active member of this group")
    if payload.split == "exact":
        pairs = [(s.member_id, s.share_paise) for s in payload.shares]
    else:
        ids = payload.participant_ids or [m.id for m in await _members(db, group_id, True)]
        if len(set(ids)) != len(ids) or not ids:
            raise HTTPException(422, "Participants must be distinct and not empty")
        pairs = list(zip(ids, allocate_equal(payload.amount_paise, len(ids)), strict=True))
    if any(mid not in active for mid, _ in pairs):
        raise HTTPException(422, "Every participant must be an active member of this group")
    exp = SplitExpense(group_id=g.id, description=payload.description.strip(), amount_paise=payload.amount_paise,
                       category=payload.category, paid_by_member_id=payload.paid_by_member_id,
                       expense_date=payload.expense_date or local_date_for(datetime.now(timezone.utc), user.timezone),
                       created_by_user=user.id, idempotency_key=payload.idempotency_key)
    db.add(exp)
    await db.flush()
    await _write_shares(db, exp, pairs)
    audit(db, user.id, "split_expense", exp.id, "create", None,
          {"amount_paise": exp.amount_paise, "shares": {str(m): p for m, p in pairs}})
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise conflict("Duplicate expense submission") from None
    return await _detail(db, g, me)


async def _expense(db, group_id, expense_id) -> SplitExpense:
    e = await db.scalar(select(SplitExpense).where(SplitExpense.id == expense_id, SplitExpense.group_id == group_id))
    if e is None:
        raise not_found("Expense not found")
    return e


@router.patch("/{group_id}/expenses/{expense_id}")
async def edit_expense(group_id: uuid.UUID, expense_id: uuid.UUID, payload: ExpenseUpdate,
                       user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    e = await _expense(db, group_id, expense_id)
    if e.status == "void":
        raise conflict("Voided expenses can't be edited")
    if e.created_by_user != user.id and me.role != "admin":
        raise HTTPException(403, "Only the person who added it or an admin can edit this expense")
    before = {"description": e.description, "amount_paise": e.amount_paise, "category": e.category,
              "expense_date": str(e.expense_date)}
    ch = payload.model_dump(exclude_unset=True)
    for k in ("description", "category", "expense_date"):
        if k in ch:
            setattr(e, k, ch[k])
    if "amount_paise" in ch and ch["amount_paise"] != e.amount_paise:
        old = list(await db.scalars(select(SplitShare).where(SplitShare.expense_id == e.id)
                                    .order_by(SplitShare.share_paise.desc(), SplitShare.member_id)))
        ids = [s.member_id for s in old if s.share_paise > 0] or [s.member_id for s in old]
        for s in old:
            await db.delete(s)
        await db.flush()
        e.amount_paise = ch["amount_paise"]
        await _write_shares(db, e, list(zip(ids, allocate_equal(e.amount_paise, len(ids)), strict=True)))
    audit(db, user.id, "split_expense", e.id, "update", before, payload.model_dump(mode="json", exclude_unset=True))
    await db.commit()
    return await _detail(db, g, me)


@router.delete("/{group_id}/expenses/{expense_id}")
async def void_expense(group_id: uuid.UUID, expense_id: uuid.UUID, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    e = await _expense(db, group_id, expense_id)
    if e.created_by_user != user.id and me.role != "admin":
        raise HTTPException(403, "Only the person who added it or an admin can delete this expense")
    if e.status != "void":
        e.status = "void"
        audit(db, user.id, "split_expense", e.id, "void", None, None)
        await db.commit()
    return await _detail(db, g, me)


# --------------------------------------------------------------------------- settlements

@router.post("/{group_id}/settlements", status_code=201)
async def record_settlement(group_id: uuid.UUID, payload: SettlementCreate, user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    if payload.idempotency_key:
        existing = await db.scalar(select(SplitSettlement).where(
            SplitSettlement.group_id == group_id, SplitSettlement.idempotency_key == payload.idempotency_key))
        if existing:
            if existing.amount_paise != payload.amount_paise:
                raise conflict("Idempotency key was already used for a different settlement")
            return await _detail(db, g, me)
    active = {m.id for m in await _members(db, group_id, True)}
    if payload.from_member_id not in active or payload.to_member_id not in active:
        raise HTTPException(422, "Both people must be active members of this group")
    if payload.from_member_id == payload.to_member_id:
        raise HTTPException(422, "Payer and receiver must be different")
    net = await balances(db, group_id)
    owes = -net.get(payload.from_member_id, 0)
    owed = net.get(payload.to_member_id, 0)
    if payload.amount_paise > min(owes, owed):
        raise conflict(f"That's more than is currently owed (at most {max(0, min(owes, owed))} paise)")
    s = SplitSettlement(group_id=g.id, from_member_id=payload.from_member_id, to_member_id=payload.to_member_id,
                        amount_paise=payload.amount_paise, method=payload.method, note=payload.note,
                        created_by_user=user.id, idempotency_key=payload.idempotency_key)
    db.add(s)
    await db.flush()
    audit(db, user.id, "split_settlement", s.id, "create", None, {"amount_paise": s.amount_paise})
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise conflict("Duplicate settlement submission") from None
    return await _detail(db, g, me)


@router.delete("/{group_id}/settlements/{settlement_id}")
async def void_settlement(group_id: uuid.UUID, settlement_id: uuid.UUID, user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user)
    s = await db.scalar(select(SplitSettlement).where(SplitSettlement.id == settlement_id,
                                                      SplitSettlement.group_id == group_id))
    if s is None:
        raise not_found("Settlement not found")
    if s.created_by_user != user.id and me.role != "admin":
        raise HTTPException(403, "Only the person who recorded it or an admin can undo this settlement")
    if s.status != "void":
        s.status = "void"
        audit(db, user.id, "split_settlement", s.id, "void", None, None)
        await db.commit()
    return await _detail(db, g, me)
