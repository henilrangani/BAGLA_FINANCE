"""Group expense splitting and settlements (server-backed).

Permissions (enforced here, tested in tests/test_splits_recurring.py):
- Only active members linked to the signed-in user can see or change a group.
- Admins manage the group and its members; any member adds expenses and settlements.
- Voiding: the person who created the entry, or an admin.
- Money is integer paise; shares always sum exactly to the expense amount.
- Settlements can't exceed what the payer currently owes the payee's side
  (prevents accidental double-recording); identical retries are idempotent.
- Voiding an expense never touches settlements: they record money that really
  changed hands. If a void would flip someone from "owes" to "is owed" (or back),
  the server refuses until the caller confirms (confirm_balance_change=true);
  GET .../void-preview shows the effect first. See DECISIONS D9.
- Personal ledgers (DECISIONS D12, services/group_ledger.py): a member who opts in gets
  share-based entries in their own ledger: their share as spending, money they fronted or
  paid back as transfers through a "Group: <name>" account whose balance equals their net.
  Only the caller's own ledger is ever written. Legacy full-amount entries
  (personal_transaction_id, batch 2) are still voided/updated with their expense; when
  someone else changes it, the payer's entry is only flagged needs_review.
- Writes lock the group row (SELECT ... FOR UPDATE on PostgreSQL) so concurrent
  settlements can't both pass the "at most what is owed" check.
"""
import hashlib
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import SplitExpense, SplitGroup, SplitMember, SplitSettlement, SplitShare, Transaction, User
from app.schemas.common import PositivePaise
from app.schemas.transaction import TransactionUpdate
from app.services import group_ledger, ledger
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
    # Also record the full amount in my own ledger, from this account (payer must be me).
    personal_account_id: uuid.UUID | None = None

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


async def _membership(db: AsyncSession, group_id: uuid.UUID, user: User,
                      lock: bool = False) -> tuple[SplitGroup, SplitMember]:
    me = await db.scalar(select(SplitMember).where(SplitMember.group_id == group_id, SplitMember.user_id == user.id,
                                                   SplitMember.status == "active"))
    group = None
    if me:
        q = select(SplitGroup).where(SplitGroup.id == group_id)
        group = await db.scalar(q.with_for_update() if lock else q)
    if me is None or group is None:
        raise not_found("Group not found")
    return group, me


async def _bump(db: AsyncSession, g: SplitGroup) -> None:
    """Optimistic concurrency for money-changing writes. Works without row locks (SQLite too):
    if another write committed after we read the group, this one is refused, not applied twice."""
    res = await db.execute(update(SplitGroup).where(SplitGroup.id == g.id, SplitGroup.version == g.version)
                           .values(version=g.version + 1))
    if res.rowcount != 1:
        await db.rollback()
        raise conflict("Someone changed this group at the same moment. Refresh and try again.")
    g.version += 1


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
                      "expense_date": e.expense_date, "status": e.status, "shares": shares.get(e.id, []),
                      "created_by_me": e.created_by_user == me.user_id,
                      "has_personal_entry": e.personal_transaction_id is not None}
                     for e in exps],
        "settlements": [{"id": s.id, "from_member_id": s.from_member_id, "to_member_id": s.to_member_id,
                         "amount_paise": s.amount_paise, "method": s.method, "note": s.note, "status": s.status,
                         "created_at": s.created_at} for s in setts],
        "total_spend_paise": sum(e.amount_paise for e in exps if e.status == "posted"),
        "suggested_settlements": suggest(net),
        "my_ledger": await group_ledger.status(db, me.user_id, group, net.get(me.id, 0)) if me.user_id else
        {"linked": False},
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
    g, me = await _membership(db, group_id, user, lock=True)
    if g.is_archived:
        raise conflict("This group is archived")
    if payload.personal_account_id is not None:
        if payload.paid_by_member_id != me.id:
            raise HTTPException(422, "Only the payer can record this in their own ledger")
        await ledger.get_account(db, user.id, payload.personal_account_id)  # 404 if not mine
    if payload.idempotency_key:
        existing = await db.scalar(select(SplitExpense).where(SplitExpense.group_id == group_id,
                                                              SplitExpense.idempotency_key == payload.idempotency_key))
        if existing:
            if existing.amount_paise != payload.amount_paise:
                raise conflict("Idempotency key was already used for a different expense")
            await _record_mine(db, user, g, me, payload.personal_account_id)  # finish an interrupted retry
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
    await _bump(db, g)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise conflict("Duplicate expense submission") from None
    await _record_mine(db, user, g, me, payload.personal_account_id)
    return await _detail(db, g, me)


async def _record_mine(db: AsyncSession, user: User, g: SplitGroup, me: SplitMember,
                       account_id: uuid.UUID | None) -> None:
    """Opt in (if asked) and bring my own ledger in step: my share as spending, the rest as money lent."""
    if account_id is not None:
        await group_ledger.link(db, user, g, me, account_id)
    await _autosync(db, user, g)


async def _autosync(db: AsyncSession, user: User, g: SplitGroup) -> dict | None:
    """After the caller changes the group, update the caller's own share-based ledger (if linked)."""
    lk = await group_ledger.get_link(db, g.id, user.id)
    return await group_ledger.sync(db, user, g, lk) if lk else None


def _mirror_text(exp: SplitExpense) -> str:
    return f"Group: {exp.description}"[:500]


async def _mirror_after_change(db: AsyncSession, user: User, exp: SplitExpense, action: str) -> str | None:
    """Keep the payer's mirror entry in step. Returns what happened."""
    if exp.personal_transaction_id is None:
        return None
    tx = await db.get(Transaction, exp.personal_transaction_id)
    if tx is None or tx.status == "void":
        return None
    if tx.user_id != user.id:
        if not tx.needs_review:
            tx.needs_review = True
            audit(db, user.id, "transaction", tx.id, "flagged_by_group_change", None,
                  {"split_expense_id": str(exp.id), "action": action})
            await db.commit()
        return "flagged_for_payer"
    if action == "void":
        await ledger.void_transaction(db, user, tx.id)
        return "voided"
    if tx.amount_paise != exp.amount_paise or tx.description != _mirror_text(exp):
        await ledger.update_transaction(db, user, tx.id, TransactionUpdate(
            amount_paise=exp.amount_paise, description=_mirror_text(exp)))
        return "updated"
    return None


async def _mirror_blocker(db: AsyncSession, exp: SplitExpense) -> str | None:
    """Refuse up front (before changing anything) if the mirror entry can't follow."""
    if exp.personal_transaction_id is None:
        return None
    tx = await db.get(Transaction, exp.personal_transaction_id)
    if tx is None or tx.status == "void":
        return None
    if await ledger.is_reversed(db, tx.id) or await ledger.refunded_total(db, tx.id) > 0:
        return "The matching entry in the payer's personal ledger has a refund or reversal; undo that first"
    return None


async def _expense(db, group_id, expense_id, lock: bool = False) -> SplitExpense:
    q = select(SplitExpense).where(SplitExpense.id == expense_id, SplitExpense.group_id == group_id)
    e = await db.scalar(q.with_for_update() if lock else q)
    if e is None:
        raise not_found("Expense not found")
    return e


@router.patch("/{group_id}/expenses/{expense_id}")
async def edit_expense(group_id: uuid.UUID, expense_id: uuid.UUID, payload: ExpenseUpdate,
                       user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user, lock=True)
    e = await _expense(db, group_id, expense_id, lock=True)
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
    if "amount_paise" in ch:
        blocker = await _mirror_blocker(db, e) or await group_ledger.blocker(db, user.id, g.id, e.id)
        if blocker:
            await db.rollback()
            raise conflict(blocker)
    audit(db, user.id, "split_expense", e.id, "update", before, payload.model_dump(mode="json", exclude_unset=True))
    await _bump(db, g)
    await db.commit()
    await _mirror_after_change(db, user, e, "update")
    await _autosync(db, user, g)
    return await _detail(db, g, me)


def _sign(v: int) -> int:
    return (v > 0) - (v < 0)


async def _void_effect(db: AsyncSession, group_id: uuid.UUID, e: SplitExpense) -> dict:
    """Balances now vs. after voiding e, and who ends up on the other side because of recorded payments."""
    before = await balances(db, group_id)
    after = dict(before)
    if e.status == "posted":
        after[e.paid_by_member_id] -= e.amount_paise
        for sh in await db.scalars(select(SplitShare).where(SplitShare.expense_id == e.id)):
            after[sh.member_id] += sh.share_paise
    flipped = [{"member_id": m, "before_paise": before[m], "after_paise": after[m]}
               for m in before if _sign(before[m]) != _sign(after[m]) and after[m] != 0]
    recorded = await db.scalar(select(func.count()).select_from(SplitSettlement).where(
        SplitSettlement.group_id == group_id, SplitSettlement.status == "recorded")) or 0
    return {"before": before, "after": after, "flipped": flipped, "recorded_settlements": recorded,
            "suggested_after": suggest(after)}


@router.get("/{group_id}/expenses/{expense_id}/void-preview")
async def void_preview(group_id: uuid.UUID, expense_id: uuid.UUID, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    """What voiding would do, so the app can explain it before asking for confirmation."""
    g, me = await _membership(db, group_id, user)
    e = await _expense(db, group_id, expense_id)
    eff = await _void_effect(db, group_id, e)
    personal = "share_ledger_updates" if await group_ledger.get_link(db, g.id, user.id) else None
    if e.personal_transaction_id:
        tx = await db.get(Transaction, e.personal_transaction_id)
        if tx and tx.status != "void":
            personal = "will_void" if tx.user_id == user.id else "will_flag_for_payer"
    return {
        "expense_id": e.id, "status": e.status, "amount_paise": e.amount_paise,
        "can_void": e.status == "posted" and (e.created_by_user == user.id or me.role == "admin"),
        "balances": [{"member_id": m, "before_paise": eff["before"][m], "after_paise": eff["after"][m]}
                     for m in eff["before"]],
        "balance_flips": eff["flipped"], "recorded_settlements": eff["recorded_settlements"],
        "suggested_after": eff["suggested_after"], "personal_entry": personal,
        "blocker": await _mirror_blocker(db, e) or await group_ledger.blocker(db, user.id, g.id, e.id),
    }


@router.delete("/{group_id}/expenses/{expense_id}")
async def void_expense(group_id: uuid.UUID, expense_id: uuid.UUID,
                       confirm_balance_change: bool = Query(default=False),
                       user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user, lock=True)
    e = await _expense(db, group_id, expense_id, lock=True)
    if e.created_by_user != user.id and me.role != "admin":
        raise HTTPException(403, "Only the person who added it or an admin can delete this expense")
    if e.status == "void":  # idempotent: a repeated or concurrent void changes nothing
        return await _detail(db, g, me)
    blocker = await _mirror_blocker(db, e) or await group_ledger.blocker(db, user.id, g.id, e.id)
    if blocker:
        raise conflict(blocker)
    eff = await _void_effect(db, group_id, e)
    if eff["flipped"] and not confirm_balance_change:
        raise HTTPException(409, {
            "code": "balance_change_needs_confirmation",
            "message": "Payments already recorded mean some people will need to be paid back. "
                       "Confirm to void; the recorded payments stay in the history.",
            "balance_flips": [{"member_id": str(f["member_id"]), "before_paise": f["before_paise"],
                               "after_paise": f["after_paise"]} for f in eff["flipped"]],
        })
    # Conditional update + group version: exactly one caller wins even without row locks.
    res = await db.execute(update(SplitExpense).where(SplitExpense.id == e.id, SplitExpense.status == "posted")
                           .values(status="void"))
    if res.rowcount != 1:
        await db.rollback()
        raise conflict("This expense was just changed by someone else. Refresh and try again.")
    await _bump(db, g)
    e.status = "void"
    audit(db, user.id, "split_expense", e.id, "void", {"status": "posted"},
          {"status": "void", "balance_flips": len(eff["flipped"]),
           "recorded_settlements_kept": eff["recorded_settlements"]})
    await db.commit()
    await _mirror_after_change(db, user, e, "void")
    await _autosync(db, user, g)
    return await _detail(db, g, me)


# --------------------------------------------------------------------------- settlements

@router.post("/{group_id}/settlements", status_code=201)
async def record_settlement(group_id: uuid.UUID, payload: SettlementCreate, user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user, lock=True)
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
    await _bump(db, g)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise conflict("Duplicate settlement submission") from None
    await _autosync(db, user, g)
    return await _detail(db, g, me)


@router.delete("/{group_id}/settlements/{settlement_id}")
async def void_settlement(group_id: uuid.UUID, settlement_id: uuid.UUID, user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    g, me = await _membership(db, group_id, user, lock=True)
    s = await db.scalar(select(SplitSettlement).where(SplitSettlement.id == settlement_id,
                                                      SplitSettlement.group_id == group_id))
    if s is None:
        raise not_found("Settlement not found")
    if s.created_by_user != user.id and me.role != "admin":
        raise HTTPException(403, "Only the person who recorded it or an admin can undo this settlement")
    if s.status != "void":
        s.status = "void"
        audit(db, user.id, "split_settlement", s.id, "void", None, None)
        await _bump(db, g)
        await db.commit()
        await _autosync(db, user, g)
    return await _detail(db, g, me)


# --------------------------------------------------------------------------- my ledger

class LedgerLinkIn(BaseModel):
    funding_account_id: uuid.UUID


@router.post("/{group_id}/ledger")
async def link_my_ledger(group_id: uuid.UUID, payload: LedgerLinkIn, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """Track my share of this group's spending in my own transactions (paid from this account)."""
    g, me = await _membership(db, group_id, user)
    await group_ledger.link(db, user, g, me, payload.funding_account_id)
    report = await _autosync(db, user, g)
    return {"sync": report, "group": await _detail(db, g, me)}


@router.post("/{group_id}/ledger/sync")
async def sync_my_ledger(group_id: uuid.UUID, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """Bring my own ledger in step with changes other members made. Idempotent."""
    g, me = await _membership(db, group_id, user)
    lk = await group_ledger.get_link(db, g.id, user.id)
    if lk is None:
        raise HTTPException(409, "Turn on 'Track my share' for this group first")
    report = await group_ledger.sync(db, user, g, lk)
    return {"sync": report, "group": await _detail(db, g, me)}
