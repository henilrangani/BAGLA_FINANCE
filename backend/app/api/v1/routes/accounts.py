from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import FinancialAccount, User
from app.schemas.account import AccountCreate, AccountResponse, AccountUpdate
from app.services.ledger import account_nets, account_view, audit, get_account

router = APIRouter()


@router.get("", response_model=list[AccountResponse])
async def list_accounts(include_archived: bool = False, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    stmt = select(FinancialAccount).where(FinancialAccount.user_id == user.id)
    if not include_archived:
        stmt = stmt.where(FinancialAccount.is_archived.is_(False))
    nets = await account_nets(db, user.id)
    return [account_view(a, nets) for a in await db.scalars(stmt.order_by(FinancialAccount.created_at))]


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(payload: AccountCreate, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    acc = FinancialAccount(user_id=user.id, **payload.model_dump())
    db.add(acc)
    await db.flush()
    audit(db, user.id, "account", acc.id, "create", None, payload.model_dump(mode="json"))
    await db.commit()
    return account_view(acc, {})


@router.get("/{account_id}", response_model=AccountResponse)
async def get_one(account_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    acc = await get_account(db, user.id, account_id)
    return account_view(acc, await account_nets(db, user.id))


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(account_id: UUID, payload: AccountUpdate, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """Name and archive flag only. Opening balance changes must be recorded as adjustments."""
    acc = await get_account(db, user.id, account_id)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    before = {"name": acc.name, "is_archived": acc.is_archived}
    for k, v in changes.items():
        setattr(acc, k, v)
    audit(db, user.id, "account", acc.id, "update", before, {"name": acc.name, "is_archived": acc.is_archived})
    await db.commit()
    return account_view(acc, await account_nets(db, user.id))
