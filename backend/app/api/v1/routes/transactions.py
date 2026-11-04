from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.schemas.transaction import (
    RefundCreate,
    ReverseRequest,
    TransactionCreate,
    TransactionPage,
    TransactionResponse,
    TransactionUpdate,
    TransferCreate,
    TransferResponse,
)
from app.services import ledger

router = APIRouter()


def _key(header_key: str | None, body_key: str | None) -> str | None:
    return header_key or body_key


@router.get("", response_model=TransactionPage)
async def list_transactions(
    account_id: UUID | None = None,
    kind: str | None = Query(default=None, max_length=32),
    category: str | None = Query(default=None, max_length=80),
    tx_status: Literal["pending", "posted", "void"] | None = Query(default=None, alias="status"),
    from_date: date | None = None,
    to_date: date | None = None,
    needs_review: bool | None = None,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items, nxt = await ledger.list_transactions(
        db, user.id, account_id=account_id, kind=kind, category=category, status_=tx_status,
        from_date=from_date, to_date=to_date, needs_review=needs_review, q=q, limit=limit, offset=offset)
    return {"items": items, "next_offset": nxt}


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create(payload: TransactionCreate, response: Response,
                 idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=255),
                 user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if idempotency_key:
        payload.idempotency_key = idempotency_key
    tx, replayed = await ledger.create_transaction(db, user, payload)
    if replayed:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replay"] = "true"
    return tx


@router.post("/transfers", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
async def transfer(payload: TransferCreate, response: Response,
                   idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=200),
                   user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if idempotency_key:
        payload.idempotency_key = idempotency_key
    out_leg, in_leg, replayed = await ledger.create_transfer(db, user, payload)
    if replayed:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replay"] = "true"
    return {"transfer_group_id": out_leg.transfer_group_id, "debit": out_leg, "credit": in_leg}


@router.get("/{tx_id}", response_model=TransactionResponse)
async def get_one(tx_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await ledger._get_tx(db, user.id, tx_id)


@router.patch("/{tx_id}", response_model=TransactionResponse)
async def update(tx_id: UUID, payload: TransactionUpdate, user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    return await ledger.update_transaction(db, user, tx_id, payload)


@router.delete("/{tx_id}", response_model=list[TransactionResponse])
async def void(tx_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Voids the entry (and its transfer partner). Nothing is hard-deleted; history is kept."""
    return await ledger.void_transaction(db, user, tx_id)


@router.post("/{tx_id}/refunds", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def refund(tx_id: UUID, payload: RefundCreate, response: Response,
                 idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=255),
                 user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if idempotency_key:
        payload.idempotency_key = idempotency_key
    tx, replayed = await ledger.create_refund(db, user, tx_id, payload)
    if replayed:
        response.status_code = status.HTTP_200_OK
    return tx


@router.post("/{tx_id}/reverse", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def reverse(tx_id: UUID, payload: ReverseRequest, user: User = Depends(get_current_user),
                  db: AsyncSession = Depends(get_db)):
    return await ledger.reverse_transaction(db, user, tx_id, payload.reason)


@router.get("/{tx_id}/history")
async def history(tx_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    events = await ledger.get_history(db, user.id, tx_id)
    return [{"action": e.action, "before": e.before, "after": e.after, "at": e.created_at.isoformat()}
            for e in events]
