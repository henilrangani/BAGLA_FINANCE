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
    RecurringBill,
    RecurringOccurrence,
    SavingsGoal,
    SplitMember,
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
        **(await _export_shared(db, uid)),
    }


async def _export_shared(db: AsyncSession, uid) -> dict:
    """Recurring bills, reminders, and the user's own part of groups and families.
    Other people's personal data is not included: only names as shown inside a shared space."""
    from app.models import (
        FamilyGroup,
        FamilyMember,
        Notification,
        NotificationPreference,
        RecurringBill,
        RecurringOccurrence,
        SplitExpense,
        SplitGroup,
        SplitLedgerLink,
        SplitMember,
        SplitSettlement,
        SplitShare,
    )
    from app.models.family_finance import FamilyGoal, FamilyGoalContribution

    bills = list(await db.scalars(select(RecurringBill).where(RecurringBill.user_id == uid)))
    occ = list(await db.scalars(select(RecurringOccurrence).where(
        RecurringOccurrence.bill_id.in_([b.id for b in bills])))) if bills else []
    seats = list(await db.scalars(select(SplitMember).where(SplitMember.user_id == uid)))
    groups = []
    for seat in seats:
        g = await db.get(SplitGroup, seat.group_id)
        exps = list(await db.scalars(select(SplitExpense).where(SplitExpense.group_id == g.id)))
        my_shares = {s.expense_id: s.share_paise for s in await db.scalars(select(SplitShare).where(
            SplitShare.member_id == seat.id))}
        setts = list(await db.scalars(select(SplitSettlement).where(
            SplitSettlement.group_id == g.id,
            (SplitSettlement.from_member_id == seat.id) | (SplitSettlement.to_member_id == seat.id))))
        groups.append({
            "group": _row(g, ("id", "name", "currency", "created_at")),
            "my_member": _row(seat, ("id", "display_name", "upi_id", "role", "status")),
            "expenses_i_paid_or_share": [
                {**_row(e, ("id", "description", "amount_paise", "expense_date", "status")),
                 "i_paid": e.paid_by_member_id == seat.id, "my_share_paise": my_shares.get(e.id, 0)}
                for e in exps if e.paid_by_member_id == seat.id or e.id in my_shares],
            "my_settlements": [{**_row(x, ("id", "amount_paise", "method", "status", "created_at")),
                                "direction": "paid" if x.from_member_id == seat.id else "received"} for x in setts],
        })
    links = list(await db.scalars(select(SplitLedgerLink).where(SplitLedgerLink.user_id == uid)))
    fams = list(await db.scalars(select(FamilyMember).where(FamilyMember.user_id == uid)))
    families = []
    for fm in fams:
        f = await db.get(FamilyGroup, fm.family_id)
        goals = {g.id: g.name for g in await db.scalars(select(FamilyGoal).where(FamilyGoal.family_id == f.id))}
        contribs = list(await db.scalars(select(FamilyGoalContribution).where(
            FamilyGoalContribution.user_id == uid,
            FamilyGoalContribution.goal_id.in_(list(goals))))) if goals else []
        families.append({"family": _row(f, ("id", "name", "created_at")), "my_role": fm.role, "status": fm.status,
                         "my_goal_contributions": [{**_row(c, ("id", "amount_paise", "note", "contributed_on",
                                                                "status")), "goal": goals.get(c.goal_id)}
                                                   for c in contribs]})
    pref = await db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == uid))
    notes = list(await db.scalars(select(Notification).where(Notification.user_id == uid)))
    return {
        "recurring_bills": [_row(b, ("id", "name", "amount_paise", "currency", "category", "frequency", "start_date",
                                     "end_date", "status", "remind_days_before")) for b in bills],
        "recurring_occurrences": [_row(o, ("id", "bill_id", "due_date", "status", "transaction_id")) for o in occ],
        "groups": groups,
        "group_ledger_links": [_row(lk, ("group_id", "group_account_id", "funding_account_id")) for lk in links],
        "families": families,
        "notification_preferences": _row(pref, ("bill_reminders", "email_enabled", "quiet_start", "quiet_end"))
        if pref else None,
        "notifications": [_row(n, ("id", "kind", "channel", "title", "body", "status", "created_at", "read_at"))
                          for n in notes],
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
    # Split groups also keep working: hand admin over if needed, then turn this
    # user's seats into named (unlinked) members so others' balances stay intact.
    for m in list(await db.scalars(select(SplitMember).where(
            SplitMember.user_id == uid, SplitMember.status == "active", SplitMember.role == "admin"))):
        others = list(await db.scalars(select(SplitMember).where(
            SplitMember.group_id == m.group_id, SplitMember.status == "active", SplitMember.user_id.is_not(None),
            SplitMember.user_id != uid).order_by(SplitMember.created_at)))
        if others and not any(o.role == "admin" for o in others):
            others[0].role = "admin"
    await db.execute(SplitMember.__table__.update().where(SplitMember.user_id == uid)
                     .values(user_id=None, upi_id=None, role="member"))
    bill_ids = select(RecurringBill.id).where(RecurringBill.user_id == uid)
    await db.execute(delete(RecurringOccurrence).where(RecurringOccurrence.bill_id.in_(bill_ids)))
    await db.execute(delete(RecurringBill).where(RecurringBill.user_id == uid))
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
