"""Family groups with explicit, per-entry sharing.

Privacy rules (tested in tests/test_family.py):
- A member's transactions are private unless the owner shares a specific entry.
- Only active members see shared entries; removed members lose access at once
  and their shared entries are un-shared.
- admin: invite, remove, change roles · adult/child: share own entries ·
  viewer: read shared entries only. The last admin can't leave or be demoted.
- Invites are single-use random tokens (stored hashed) that expire in 7 days.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import FamilyGroup, FamilyInvite, FamilyMember, Transaction, User
from app.schemas.transaction import TransactionResponse
from app.services.ledger import _get_tx, audit, conflict, not_found

router = APIRouter()
Role = Literal["admin", "adult", "child", "viewer"]


class FamilyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class InviteCreate(BaseModel):
    role: Role = "adult"


class InviteAccept(BaseModel):
    token: str = Field(min_length=20, max_length=100)


class RoleChange(BaseModel):
    role: Role


class ShareRequest(BaseModel):
    family_id: UUID | None  # None = make private again


def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def membership(db: AsyncSession, family_id: UUID, user_id: UUID) -> FamilyMember:
    m = await db.scalar(select(FamilyMember).where(FamilyMember.family_id == family_id,
                                                   FamilyMember.user_id == user_id, FamilyMember.status == "active"))
    if m is None:
        raise not_found("Family not found")
    return m


def require(m: FamilyMember, *roles: str) -> None:
    if m.role not in roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your family role doesn't allow this")


async def _admins(db: AsyncSession, family_id: UUID) -> int:
    return int(await db.scalar(select(func.count()).select_from(FamilyMember).where(
        FamilyMember.family_id == family_id, FamilyMember.role == "admin", FamilyMember.status == "active")) or 0)


async def _members_view(db: AsyncSession, family_id: UUID) -> list[dict]:
    rows = await db.execute(select(FamilyMember, User.full_name).join(User, User.id == FamilyMember.user_id).where(
        FamilyMember.family_id == family_id, FamilyMember.status == "active"))
    # Only names and roles; no emails or financial data of other members.
    return [{"member_id": m.id, "user_id": m.user_id, "name": name, "role": m.role} for m, name in rows]


@router.post("", status_code=201)
async def create(payload: FamilyCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fam = FamilyGroup(name=payload.name.strip(), created_by=user.id)
    db.add(fam)
    await db.flush()
    db.add(FamilyMember(family_id=fam.id, user_id=user.id, role="admin"))
    audit(db, user.id, "family", fam.id, "create", None, {"name": fam.name})
    await db.commit()
    return {"id": fam.id, "name": fam.name, "my_role": "admin", "members": await _members_view(db, fam.id)}


@router.get("")
async def mine(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.execute(select(FamilyGroup, FamilyMember.role).join(
        FamilyMember, FamilyMember.family_id == FamilyGroup.id).where(
        FamilyMember.user_id == user.id, FamilyMember.status == "active"))
    return [{"id": f.id, "name": f.name, "my_role": role} for f, role in rows]


@router.get("/{family_id}")
async def get_one(family_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    m = await membership(db, family_id, user.id)
    fam = await db.get(FamilyGroup, family_id)
    return {"id": fam.id, "name": fam.name, "my_role": m.role, "members": await _members_view(db, family_id)}


@router.post("/{family_id}/invites", status_code=201)
async def invite(family_id: UUID, payload: InviteCreate, user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    require(await membership(db, family_id, user.id), "admin")
    token = secrets.token_urlsafe(24)
    inv = FamilyInvite(family_id=family_id, token_hash=_h(token), role=payload.role, created_by=user.id,
                       expires_at=datetime.now(timezone.utc) + timedelta(days=7))
    db.add(inv)
    await db.commit()
    # The token is shown once; share it with the person yourself (no email is sent).
    return {"invite_id": inv.id, "token": token, "role": inv.role, "expires_at": inv.expires_at}


@router.post("/invites/accept")
async def accept(payload: InviteAccept, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    inv = await db.scalar(select(FamilyInvite).where(FamilyInvite.token_hash == _h(payload.token)).with_for_update())
    if inv is None or inv.revoked or inv.accepted_by or inv.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(400, "This invite is invalid or has expired")
    existing = await db.scalar(select(FamilyMember).where(FamilyMember.family_id == inv.family_id,
                                                          FamilyMember.user_id == user.id))
    if existing and existing.status == "active":
        raise conflict("You're already a member")
    if existing:
        existing.status, existing.role = "active", inv.role
    else:
        db.add(FamilyMember(family_id=inv.family_id, user_id=user.id, role=inv.role))
    inv.accepted_by = user.id
    audit(db, user.id, "family", inv.family_id, "join", None, {"role": inv.role})
    await db.commit()
    return {"family_id": inv.family_id, "role": inv.role}


async def _remove(db: AsyncSession, family_id: UUID, target: FamilyMember, actor: User) -> None:
    if target.role == "admin" and await _admins(db, family_id) <= 1:
        raise conflict("A family needs at least one admin; make someone else admin first")
    target.status = "removed"
    # Removal revokes sharing immediately.
    await db.execute(update(Transaction).where(Transaction.user_id == target.user_id,
                                               Transaction.shared_family_id == family_id).values(shared_family_id=None))
    audit(db, actor.id, "family", family_id, "member_removed", None, {"user_id": str(target.user_id)})
    await db.commit()


@router.delete("/{family_id}/members/{member_id}", status_code=204)
async def remove_member(family_id: UUID, member_id: UUID, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    me = await membership(db, family_id, user.id)
    target = await db.scalar(select(FamilyMember).where(FamilyMember.id == member_id,
                                                        FamilyMember.family_id == family_id,
                                                        FamilyMember.status == "active"))
    if target is None:
        raise not_found("Member not found")
    if target.user_id != user.id:
        require(me, "admin")
    await _remove(db, family_id, target, user)


@router.patch("/{family_id}/members/{member_id}")
async def change_role(family_id: UUID, member_id: UUID, payload: RoleChange, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    require(await membership(db, family_id, user.id), "admin")
    target = await db.scalar(select(FamilyMember).where(FamilyMember.id == member_id,
                                                        FamilyMember.family_id == family_id,
                                                        FamilyMember.status == "active"))
    if target is None:
        raise not_found("Member not found")
    if target.role == "admin" and payload.role != "admin" and await _admins(db, family_id) <= 1:
        raise conflict("A family needs at least one admin")
    before = target.role
    target.role = payload.role
    audit(db, user.id, "family", family_id, "role_changed", {"role": before}, {"role": payload.role})
    await db.commit()
    return {"member_id": target.id, "role": target.role}


@router.post("/share/{tx_id}", response_model=TransactionResponse)
async def share(tx_id: UUID, payload: ShareRequest, user: User = Depends(get_current_user),
                db: AsyncSession = Depends(get_db)):
    tx = await _get_tx(db, user.id, tx_id)  # only the owner can share their own entry
    if payload.family_id is not None:
        require(await membership(db, payload.family_id, user.id), "admin", "adult", "child")
    before = tx.shared_family_id
    tx.shared_family_id = payload.family_id
    audit(db, user.id, "transaction", tx.id, "share" if payload.family_id else "unshare",
          {"shared_family_id": str(before) if before else None},
          {"shared_family_id": str(payload.family_id) if payload.family_id else None})
    await db.commit()
    await db.refresh(tx)
    return tx


@router.get("/{family_id}/transactions")
async def shared_transactions(family_id: UUID, user: User = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)):
    await membership(db, family_id, user.id)
    active = select(FamilyMember.user_id).where(FamilyMember.family_id == family_id, FamilyMember.status == "active")
    rows = await db.execute(select(Transaction, User.full_name).join(User, User.id == Transaction.user_id).where(
        Transaction.shared_family_id == family_id, Transaction.status == "posted",
        Transaction.user_id.in_(active)).order_by(Transaction.occurred_at.desc()).limit(500))
    items, spend = [], 0
    for t, name in rows:
        # Shared view excludes account ids, notes and provenance of other members.
        items.append({"id": t.id, "member": name, "mine": t.user_id == user.id, "kind": t.kind,
                      "direction": t.direction, "amount_paise": t.amount_paise, "currency": t.currency,
                      "description": t.description, "category": t.category, "local_date": t.local_date})
        spend += t.amount_paise if t.kind == "expense" else -t.amount_paise if t.kind == "refund" else 0
    return {"items": items, "shared_net_spend_paise": spend}
