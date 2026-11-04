from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import verify_password
from app.models import (
    AuditEvent,
    AuthSession,
    BillingEvent,
    Budget,
    FamilyMember,
    FinancialAccount,
    GoalContribution,
    ImportBatch,
    ImportRow,
    SavingsGoal,
    SupportTicket,
    Transaction,
    User,
    UserSubscription,
)
from app.schemas.user import DeleteAccountRequest, UserResponse, UserUpdate
from app.services.ledger import _jsonable, snapshot

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(payload: UserUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    return user


def _row(obj, fields: tuple[str, ...]) -> dict:
    return {f: _jsonable(getattr(obj, f)) for f in fields}


@router.get("/me/export")
async def export_my_data(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Data-portability export of everything stored about the user (no password hash, no tokens)."""
    uid = user.id
    accounts = await db.scalars(select(FinancialAccount).where(FinancialAccount.user_id == uid))
    txs = await db.scalars(select(Transaction).where(Transaction.user_id == uid))
    budgets = await db.scalars(select(Budget).where(Budget.user_id == uid))
    goals = await db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == uid))
    contribs = await db.scalars(select(GoalContribution).where(GoalContribution.user_id == uid))
    audits = await db.scalars(select(AuditEvent).where(AuditEvent.user_id == uid))
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "format": "bagla-finance-export/1",
        "money_unit": "integer minor units (paise for INR)",
        "user": _row(user, ("id", "email", "full_name", "bagla_id", "timezone", "locale", "default_currency",
                            "created_at")),
        "accounts": [_row(a, ("id", "name", "account_type", "currency", "opening_balance_paise", "is_archived",
                              "created_at")) for a in accounts],
        "transactions": [{"id": str(t.id), **snapshot(t), "created_at": t.created_at.isoformat()} for t in txs],
        "budgets": [_row(b, ("id", "name", "category", "period", "amount_paise", "currency", "rollover",
                             "start_date", "end_date", "is_archived")) for b in budgets],
        "goals": [_row(g, ("id", "name", "target_paise", "currency", "deadline", "is_archived")) for g in goals],
        "goal_contributions": [_row(c, ("id", "goal_id", "amount_paise", "direction", "contributed_on", "note"))
                               for c in contribs],
        "audit_events": [_row(e, ("id", "entity_type", "entity_id", "action", "before", "after", "created_at"))
                         for e in audits],
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(payload: DeleteAccountRequest, user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    """Permanent erasure requested by the user themself (password + typed confirmation required)."""
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is incorrect")
    uid = user.id
    # Families keep working for everyone else: if this user is a family's only
    # admin, the longest-standing other member becomes admin.
    for m in list(await db.scalars(select(FamilyMember).where(
            FamilyMember.user_id == uid, FamilyMember.status == "active", FamilyMember.role == "admin"))):
        others = list(await db.scalars(select(FamilyMember).where(
            FamilyMember.family_id == m.family_id, FamilyMember.status == "active", FamilyMember.user_id != uid)
            .order_by(FamilyMember.created_at)))
        if others and not any(o.role == "admin" for o in others):
            others[0].role = "admin"
    batch_ids = select(ImportBatch.id).where(ImportBatch.user_id == uid)
    await db.execute(delete(ImportRow).where(ImportRow.batch_id.in_(batch_ids)))
    # Explicit order (children first) so it works without relying on DB cascades.
    for model in (GoalContribution, SavingsGoal, Budget, AuditEvent, AuthSession, ImportBatch, FamilyMember,
                  SupportTicket, UserSubscription, BillingEvent):
        await db.execute(delete(model).where(model.user_id == uid))
    # Transactions reference each other (refunds/reversals); clear links before deleting.
    await db.execute(Transaction.__table__.update().where(Transaction.user_id == uid)
                     .values(refund_of_id=None, reverses_id=None))
    await db.execute(delete(Transaction).where(Transaction.user_id == uid))
    await db.execute(delete(FinancialAccount).where(FinancialAccount.user_id == uid))
    await db.execute(delete(User).where(User.id == uid))
    await db.commit()
