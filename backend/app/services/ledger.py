"""Ledger operations. Every write goes through here so the invariants hold:

- amounts are positive integer paise; direction gives the sign
- balances are derived from posted entries (never stored)
- every create / edit / void / reverse writes an audit event
- transfers are two linked legs that always move together
- refunds reference an expense and can never exceed it in total
- idempotency keys make retries safe (no duplicate posting)
"""
import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, FinancialAccount, Transaction, User
from app.schemas.transaction import RefundCreate, TransactionCreate, TransactionUpdate, TransferCreate

KIND_DIRECTION = {
    "income": "credit",
    "expense": "debit",
    "savings_contribution": "debit",
    "loan_repayment": "debit",
    "investment": "debit",
}

_SNAPSHOT_FIELDS = (
    "account_id", "amount_paise", "currency", "direction", "kind", "status", "description",
    "merchant", "category", "notes", "occurred_at", "local_date", "timezone", "source",
    "needs_review", "transfer_group_id", "refund_of_id", "reverses_id",
)


def not_found(what: str = "Not found") -> HTTPException:
    # Same response whether the row doesn't exist or belongs to someone else.
    return HTTPException(status.HTTP_404_NOT_FOUND, what)


def conflict(msg: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, msg)


def local_date_for(when: datetime, tz: str) -> date:
    return when.astimezone(ZoneInfo(tz)).date()


def _jsonable(v):
    if isinstance(v, (uuid.UUID,)):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def snapshot(tx: Transaction) -> dict:
    return {f: _jsonable(getattr(tx, f)) for f in _SNAPSHOT_FIELDS}


def audit(db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID,
          action: str, before: dict | None, after: dict | None) -> None:
    db.add(AuditEvent(user_id=user_id, actor_user_id=user_id, entity_type=entity_type,
                      entity_id=entity_id, action=action, before=before, after=after))


# --------------------------------------------------------------------------- accounts

async def get_account(db: AsyncSession, user_id: uuid.UUID, account_id: uuid.UUID) -> FinancialAccount:
    acc = await db.scalar(
        select(FinancialAccount).where(FinancialAccount.id == account_id, FinancialAccount.user_id == user_id)
    )
    if acc is None:
        raise not_found("Account not found")
    return acc


_signed = case((Transaction.direction == "credit", Transaction.amount_paise), else_=-Transaction.amount_paise)


async def account_nets(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, dict[str, int]]:
    """Net movement per account, split by status (posted / pending)."""
    rows = await db.execute(
        select(Transaction.account_id, Transaction.status, func.coalesce(func.sum(_signed), 0))
        .where(Transaction.user_id == user_id, Transaction.status.in_(("posted", "pending")))
        .group_by(Transaction.account_id, Transaction.status)
    )
    out: dict[uuid.UUID, dict[str, int]] = defaultdict(lambda: {"posted": 0, "pending": 0})
    for account_id, st, total in rows:
        out[account_id][st] = int(total)
    return out


def account_view(acc: FinancialAccount, nets: dict[uuid.UUID, dict[str, int]]) -> dict:
    n = nets.get(acc.id, {"posted": 0, "pending": 0})
    return {
        "id": acc.id,
        "name": acc.name,
        "account_type": acc.account_type,
        "currency": acc.currency,
        "opening_balance_paise": acc.opening_balance_paise,
        "balance_paise": acc.opening_balance_paise + n["posted"],
        "pending_paise": n["pending"],
        "is_archived": acc.is_archived,
    }


# --------------------------------------------------------------------------- helpers

def _when(user: User, occurred_at: datetime | None, tz: str | None) -> tuple[datetime, date, str]:
    zone = tz or user.timezone or "Asia/Kolkata"
    when = (occurred_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return when, local_date_for(when, zone), zone


async def _existing_by_key(db: AsyncSession, user_id: uuid.UUID, key: str | None) -> Transaction | None:
    if not key:
        return None
    return await db.scalar(
        select(Transaction).where(Transaction.user_id == user_id, Transaction.idempotency_key == key)
    )


def _same_request(tx: Transaction, account_id: uuid.UUID, amount: int, kind: str) -> bool:
    return tx.account_id == account_id and tx.amount_paise == amount and tx.kind == kind


async def _commit_or_replay(db: AsyncSession, user_id: uuid.UUID, key: str | None) -> Transaction | None:
    """Commit; if a concurrent request already used the idempotency key, return that row."""
    try:
        await db.commit()
        return None
    except IntegrityError:
        await db.rollback()
        existing = await _existing_by_key(db, user_id, key)
        if existing is None:
            raise
        return existing


async def _flush_or_replay(db: AsyncSession, user_id: uuid.UUID, key: str | None) -> Transaction | None:
    """Flush the insert; if a simultaneous retry with the same idempotency key won the race, the unique
    constraint fires here (not at commit), so roll back and return the row that was saved."""
    try:
        await db.flush()
        return None
    except IntegrityError:
        await db.rollback()
        existing = await _existing_by_key(db, user_id, key)
        if existing is None:
            raise
        return existing


async def _get_tx(db: AsyncSession, user_id: uuid.UUID, tx_id: uuid.UUID, lock: bool = False) -> Transaction:
    q = select(Transaction).where(Transaction.id == tx_id, Transaction.user_id == user_id)
    if lock:
        q = q.with_for_update()  # serialises concurrent refunds/edits on PostgreSQL
    tx = await db.scalar(q)
    if tx is None:
        raise not_found("Transaction not found")
    return tx


async def _refunded_total(db: AsyncSession, original_id: uuid.UUID) -> int:
    return int(await db.scalar(
        select(func.coalesce(func.sum(Transaction.amount_paise), 0)).where(
            Transaction.refund_of_id == original_id, Transaction.status != "void"
        )
    ) or 0)


async def _is_reversed(db: AsyncSession, tx_id: uuid.UUID) -> bool:
    return bool(await db.scalar(
        select(func.count()).select_from(Transaction).where(
            Transaction.reverses_id == tx_id, Transaction.status != "void"
        )
    ))


# Public names for other services (group expense mirrors).
is_reversed = _is_reversed
refunded_total = _refunded_total


# --------------------------------------------------------------------------- create

async def create_transaction(db: AsyncSession, user: User, data: TransactionCreate) -> tuple[Transaction, bool]:
    """Returns (transaction, replayed)."""
    existing = await _existing_by_key(db, user.id, data.idempotency_key)
    if existing:
        if not _same_request(existing, data.account_id, data.amount_paise, data.kind):
            raise conflict("Idempotency key was already used for a different transaction")
        return existing, True

    acc = await get_account(db, user.id, data.account_id)
    if acc.is_archived:
        raise conflict("Account is archived")
    when, local, zone = _when(user, data.occurred_at, data.timezone)
    tx = Transaction(
        user_id=user.id, account_id=acc.id, amount_paise=data.amount_paise, currency=acc.currency,
        direction=data.direction or KIND_DIRECTION[data.kind], kind=data.kind, status=data.status,
        description=data.description.strip(), merchant=data.merchant, category=data.category,
        notes=data.notes, occurred_at=when, local_date=local, timezone=zone, source=data.source,
        needs_review=data.needs_review or data.source == "ai_suggested",
        idempotency_key=data.idempotency_key,
    )
    db.add(tx)
    replay = await _flush_or_replay(db, user.id, data.idempotency_key)
    if replay is None:
        audit(db, user.id, "transaction", tx.id, "create", None, snapshot(tx))
        replay = await _commit_or_replay(db, user.id, data.idempotency_key)
    if replay:
        if not _same_request(replay, data.account_id, data.amount_paise, data.kind):
            raise conflict("Idempotency key was already used for a different transaction")
        return replay, True
    await db.refresh(tx)
    return tx, False


async def create_transfer(db: AsyncSession, user: User, data: TransferCreate) -> tuple[Transaction, Transaction, bool]:
    key_out = f"{data.idempotency_key}:out" if data.idempotency_key else None
    key_in = f"{data.idempotency_key}:in" if data.idempotency_key else None
    existing = await _existing_by_key(db, user.id, key_out)
    if existing:
        partner = await db.scalar(select(Transaction).where(
            Transaction.user_id == user.id, Transaction.idempotency_key == key_in))
        if partner is None or not _same_request(existing, data.from_account_id, data.amount_paise, "transfer"):
            raise conflict("Idempotency key was already used for a different transfer")
        return existing, partner, True

    src = await get_account(db, user.id, data.from_account_id)
    dst = await get_account(db, user.id, data.to_account_id)
    if src.is_archived or dst.is_archived:
        raise conflict("Account is archived")
    if src.currency != dst.currency:
        raise HTTPException(422, "Transfers between different currencies are not supported yet")
    when, local, zone = _when(user, data.occurred_at, data.timezone)
    group = uuid.uuid4()
    common = dict(user_id=user.id, amount_paise=data.amount_paise, currency=src.currency, kind="transfer",
                  status="posted", description=data.description.strip(), occurred_at=when,
                  local_date=local, timezone=zone, source="manual", transfer_group_id=group)
    out_leg = Transaction(account_id=src.id, direction="debit", idempotency_key=key_out, **common)
    in_leg = Transaction(account_id=dst.id, direction="credit", idempotency_key=key_in, **common)
    db.add_all([out_leg, in_leg])
    replay = await _flush_or_replay(db, user.id, key_out)
    if replay is None:
        audit(db, user.id, "transaction", out_leg.id, "create", None, snapshot(out_leg))
        audit(db, user.id, "transaction", in_leg.id, "create", None, snapshot(in_leg))
        replay = await _commit_or_replay(db, user.id, key_out)
    if replay:
        partner = await _existing_by_key(db, user.id, key_in)
        return replay, partner, True
    await db.refresh(out_leg)
    await db.refresh(in_leg)
    return out_leg, in_leg, False


async def create_refund(
    db: AsyncSession, user: User, original_id: uuid.UUID, data: RefundCreate
) -> tuple[Transaction, bool]:
    existing = await _existing_by_key(db, user.id, data.idempotency_key)
    if existing:
        if existing.refund_of_id != original_id or existing.amount_paise != data.amount_paise:
            raise conflict("Idempotency key was already used for a different refund")
        return existing, True

    original = await _get_tx(db, user.id, original_id, lock=True)
    if original.kind != "expense" or original.status != "posted":
        raise conflict("Only posted expenses can be refunded")
    if await _is_reversed(db, original.id):
        raise conflict("This expense was reversed; it can't also be refunded")
    already = await _refunded_total(db, original.id)
    if already + data.amount_paise > original.amount_paise:
        raise conflict(
            f"Refunds would exceed the original amount (original {original.amount_paise}, "
            f"already refunded {already}, requested {data.amount_paise} paise)"
        )
    when, local, zone = _when(user, data.occurred_at, data.timezone or original.timezone)
    tx = Transaction(
        user_id=user.id, account_id=original.account_id, amount_paise=data.amount_paise,
        currency=original.currency, direction="credit", kind="refund", status="posted",
        description=(data.description or f"Refund: {original.description}")[:500],
        merchant=original.merchant, category=original.category, occurred_at=when, local_date=local,
        timezone=zone, source="manual", refund_of_id=original.id, idempotency_key=data.idempotency_key,
    )
    db.add(tx)
    replay = await _flush_or_replay(db, user.id, data.idempotency_key)
    if replay is None:
        # Defence in depth: re-check the cap after writing, inside this transaction. The row lock above
        # serialises refunds on PostgreSQL; this also holds where locks aren't available (SQLite).
        if await _refunded_total(db, original.id) > original.amount_paise:
            await db.rollback()
            raise conflict("Refunds would exceed the original amount (another refund was just recorded)")
        audit(db, user.id, "transaction", tx.id, "create", None, snapshot(tx))
        replay = await _commit_or_replay(db, user.id, data.idempotency_key)
    if replay:
        if replay.refund_of_id != original_id or replay.amount_paise != data.amount_paise:
            raise conflict("Idempotency key was already used for a different refund")
        return replay, True
    await db.refresh(tx)
    return tx, False


async def reverse_transaction(db: AsyncSession, user: User, tx_id: uuid.UUID, reason: str) -> Transaction:
    """Record a real-world reversal (e.g. a failed UPI debit returned). Both entries stay in history."""
    original = await _get_tx(db, user.id, tx_id, lock=True)
    if original.status != "posted":
        raise conflict("Only posted entries can be reversed")
    if original.kind in ("reversal", "transfer"):
        raise conflict("Reversals and transfer legs can't be reversed; void the transfer instead")
    if await _is_reversed(db, original.id):
        raise conflict("Already reversed")
    if original.kind == "expense" and await _refunded_total(db, original.id) > 0:
        raise conflict("This expense has refunds; reverse or void those first")
    tx = Transaction(
        user_id=user.id, account_id=original.account_id, amount_paise=original.amount_paise,
        currency=original.currency, direction="credit" if original.direction == "debit" else "debit",
        kind="reversal", status="posted", description=f"Reversal: {original.description}"[:500],
        notes=reason, category=original.category, occurred_at=datetime.now(timezone.utc),
        local_date=local_date_for(datetime.now(timezone.utc), original.timezone),
        timezone=original.timezone, source="manual", reverses_id=original.id,
    )
    db.add(tx)
    await db.flush()
    audit(db, user.id, "transaction", tx.id, "create", None, snapshot(tx))
    audit(db, user.id, "transaction", original.id, "reversed", None, {"reversal_id": str(tx.id), "reason": reason})
    await db.commit()
    await db.refresh(tx)
    return tx


# --------------------------------------------------------------------------- edit / void

async def update_transaction(db: AsyncSession, user: User, tx_id: uuid.UUID, data: TransactionUpdate) -> Transaction:
    tx = await _get_tx(db, user.id, tx_id, lock=True)
    if tx.status == "void":
        raise conflict("Voided entries can't be edited")
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return tx
    if tx.kind in ("transfer", "reversal") and {"amount_paise", "status"} & changes.keys():
        raise conflict("Transfer legs and reversals can't change amount or status; void and re-create instead")
    if "amount_paise" in changes and tx.kind == "refund":
        others = await _refunded_total(db, tx.refund_of_id) - tx.amount_paise
        original = await _get_tx(db, user.id, tx.refund_of_id, lock=True)
        if others + changes["amount_paise"] > original.amount_paise:
            raise conflict("Refunds would exceed the original amount")
    if "amount_paise" in changes and tx.kind == "expense":
        if changes["amount_paise"] < await _refunded_total(db, tx.id):
            raise conflict("Amount can't be lower than what has already been refunded")
    if {"amount_paise", "status"} & changes.keys() and await _is_reversed(db, tx.id):
        raise conflict("Reversed entries can't change amount or status")

    before = snapshot(tx)
    for field in ("amount_paise", "description", "merchant", "category", "notes", "status", "needs_review"):
        if field in changes:
            setattr(tx, field, changes[field])
    if "occurred_at" in changes or "timezone" in changes:
        zone = changes.get("timezone") or tx.timezone
        when = (changes.get("occurred_at") or tx.occurred_at).astimezone(timezone.utc)
        tx.occurred_at, tx.timezone, tx.local_date = when, zone, local_date_for(when, zone)
    audit(db, user.id, "transaction", tx.id, "update", before, snapshot(tx))
    await db.commit()
    await db.refresh(tx)
    return tx


async def void_transaction(db: AsyncSession, user: User, tx_id: uuid.UUID) -> list[Transaction]:
    """'Delete' = void. The row and its history remain; it stops counting everywhere."""
    tx = await _get_tx(db, user.id, tx_id, lock=True)
    if tx.status == "void":
        return [tx]
    if await _is_reversed(db, tx.id):
        raise conflict("Void the reversal first")
    if tx.kind == "expense" and await _refunded_total(db, tx.id) > 0:
        raise conflict("Void its refunds first")
    legs = [tx]
    if tx.transfer_group_id:
        legs = list(await db.scalars(select(Transaction).where(
            Transaction.user_id == user.id, Transaction.transfer_group_id == tx.transfer_group_id)))
    for leg in legs:
        before = snapshot(leg)
        leg.status = "void"
        audit(db, user.id, "transaction", leg.id, "void", before, snapshot(leg))
    await db.commit()
    return legs


# --------------------------------------------------------------------------- queries

async def list_transactions(db: AsyncSession, user_id: uuid.UUID, *, account_id=None, kind=None, category=None,
                            status_=None, from_date=None, to_date=None, needs_review=None, q=None,
                            include_void=False, limit=50, offset=0) -> tuple[list[Transaction], int | None]:
    stmt = select(Transaction).where(Transaction.user_id == user_id)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if kind:
        stmt = stmt.where(Transaction.kind == kind)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if status_:
        stmt = stmt.where(Transaction.status == status_)
    elif not include_void:
        stmt = stmt.where(Transaction.status != "void")
    if from_date:
        stmt = stmt.where(Transaction.local_date >= from_date)
    if to_date:
        stmt = stmt.where(Transaction.local_date <= to_date)
    if needs_review is not None:
        stmt = stmt.where(Transaction.needs_review.is_(needs_review))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            func.lower(Transaction.description).like(like)
            | func.lower(func.coalesce(Transaction.merchant, "")).like(like)
        )
    stmt = stmt.order_by(Transaction.occurred_at.desc(), Transaction.id.desc()).offset(offset).limit(limit + 1)
    rows = list(await db.scalars(stmt))
    next_offset = offset + limit if len(rows) > limit else None
    return rows[:limit], next_offset


async def get_history(db: AsyncSession, user_id: uuid.UUID, tx_id: uuid.UUID) -> list[AuditEvent]:
    await _get_tx(db, user_id, tx_id)
    return list(await db.scalars(select(AuditEvent).where(
        AuditEvent.user_id == user_id, AuditEvent.entity_type == "transaction", AuditEvent.entity_id == tx_id
    ).order_by(AuditEvent.created_at)))
