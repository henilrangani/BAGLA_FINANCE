"""Share-based group accounting in a member's personal ledger (DECISIONS D12).

Each member who opts in gets a "Group: <name>" account (type "group") in *their own* ledger:
- I paid an expense       → transfer  funding → group account   (full amount; not spending)
- my share of any expense → expense   from the group account    (exactly my share, in paise)
- I paid someone back     → transfer  funding → group account
- someone paid me back    → transfer  group account → funding
So my spending equals exactly my shares, and the group account balance always equals my
net balance in the group (positive = others owe me).

Entries are derived from the group's posted expenses and recorded settlements and kept in
step by `sync`, which only ever writes the caller's own ledger. Every entry has an
idempotency key `gl:<group>:<entity>:<role>:<amount>#<n>`; when something changes, the old
entry is voided (kept in history) and a new one created. Nothing is hard-deleted.
"""
import uuid
from datetime import datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinancialAccount, SplitExpense, SplitGroup, SplitMember, SplitSettlement, SplitShare, Transaction
from app.models.groups import SplitLedgerLink
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransferCreate
from app.services import ledger
from app.services.ledger import audit, conflict


def _prefix(group_id: uuid.UUID) -> str:
    return f"gl:{group_id}:"


def _base(key: str) -> str:
    for suffix in (":out", ":in"):
        if key.endswith(suffix):
            key = key[: -len(suffix)]
    return key.split("#")[0]


def _when(d, user: User) -> datetime:
    zone = user.timezone or "Asia/Kolkata"
    return datetime.combine(d, time(12), tzinfo=ZoneInfo(zone))


async def get_link(db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID) -> SplitLedgerLink | None:
    return await db.scalar(select(SplitLedgerLink).where(SplitLedgerLink.group_id == group_id,
                                                          SplitLedgerLink.user_id == user_id))


async def link(db: AsyncSession, user: User, g: SplitGroup, me: SplitMember,
               funding_account_id: uuid.UUID) -> SplitLedgerLink:
    """Opt in. Creates the group account; replaces any legacy full-amount entries (voided, audited)."""
    funding = await ledger.get_account(db, user.id, funding_account_id)
    if funding.is_archived or funding.account_type == "group":
        raise conflict("Choose an active bank, cash or wallet account to pay from")
    existing = await get_link(db, g.id, user.id)
    if existing:
        if existing.funding_account_id != funding.id:
            existing.funding_account_id = funding.id
            await db.commit()
        return existing
    acc = FinancialAccount(user_id=user.id, name=f"Group: {g.name}"[:120], account_type="group",
                           currency=g.currency)
    db.add(acc)
    await db.flush()
    lk = SplitLedgerLink(group_id=g.id, user_id=user.id, member_id=me.id, group_account_id=acc.id,
                         funding_account_id=funding.id)
    db.add(lk)
    audit(db, user.id, "split_group", g.id, "ledger_linked", None, {"account_id": str(acc.id)})
    await db.commit()
    # Legacy (batch-2) mirrors recorded the full amount as spending; the share-based entries replace them.
    legacy = list(await db.scalars(select(SplitExpense).where(
        SplitExpense.group_id == g.id, SplitExpense.personal_transaction_id.is_not(None))))
    for e in legacy:
        tx = await db.get(Transaction, e.personal_transaction_id)
        if tx and tx.user_id == user.id and tx.status != "void":
            try:
                await ledger.void_transaction(db, user, tx.id)
                audit(db, user.id, "transaction", tx.id, "replaced_by_group_ledger", None,
                      {"split_expense_id": str(e.id)})
                await db.commit()
            except Exception:  # noqa: BLE001 - refunded/reversed legacy entry: leave it, report via sync
                await db.rollback()
    return lk


async def _desired(db: AsyncSession, g: SplitGroup, me_id: uuid.UUID, lk: SplitLedgerLink) -> dict[str, dict]:
    out: dict[str, dict] = {}
    exps = {e.id: e for e in await db.scalars(select(SplitExpense).where(
        SplitExpense.group_id == g.id, SplitExpense.status == "posted"))}
    shares: dict[uuid.UUID, int] = {}
    if exps:
        for s in await db.scalars(select(SplitShare).where(SplitShare.expense_id.in_(list(exps)),
                                                           SplitShare.member_id == me_id)):
            shares[s.expense_id] = s.share_paise
    for e in exps.values():
        if e.paid_by_member_id == me_id:
            out[f"{_prefix(g.id)}{e.id}:paid:{e.amount_paise}"] = {
                "type": "transfer", "src": lk.funding_account_id, "dst": lk.group_account_id,
                "amount": e.amount_paise, "text": f"Paid for group: {e.description}", "date": e.expense_date}
        if shares.get(e.id, 0) > 0:
            out[f"{_prefix(g.id)}{e.id}:share:{shares[e.id]}"] = {
                "type": "expense", "src": lk.group_account_id, "amount": shares[e.id],
                "text": f"My share: {e.description}", "category": e.category, "date": e.expense_date}
    for st in await db.scalars(select(SplitSettlement).where(SplitSettlement.group_id == g.id,
                                                             SplitSettlement.status == "recorded")):
        if st.from_member_id == me_id:
            out[f"{_prefix(g.id)}{st.id}:sent:{st.amount_paise}"] = {
                "type": "transfer", "src": lk.funding_account_id, "dst": lk.group_account_id,
                "amount": st.amount_paise, "text": f"Paid back in {g.name}", "date": st.created_at.date()}
        elif st.to_member_id == me_id:
            out[f"{_prefix(g.id)}{st.id}:recv:{st.amount_paise}"] = {
                "type": "transfer", "src": lk.group_account_id, "dst": lk.funding_account_id,
                "amount": st.amount_paise, "text": f"Paid back to me in {g.name}", "date": st.created_at.date()}
    return out


async def sync(db: AsyncSession, user: User, g: SplitGroup, lk: SplitLedgerLink) -> dict:
    """Bring the caller's own ledger in step with the group. Idempotent; safe to call any time."""
    me = await db.get(SplitMember, lk.member_id)
    if me is None or me.user_id != user.id or me.status != "active":
        return {"created": 0, "voided": 0, "conflicts": ["You're no longer a member of this group"]}
    desired = await _desired(db, g, me.id, lk)
    rows = list(await db.scalars(select(Transaction).where(
        Transaction.user_id == user.id, Transaction.idempotency_key.like(f"{_prefix(g.id)}%"))))
    posted: dict[str, Transaction] = {}
    counts: dict[str, int] = {}
    for t in rows:
        b = _base(t.idempotency_key)
        counts[b] = counts.get(b, 0) + 1
        if t.status == "posted" and (t.kind != "transfer" or t.direction == "debit"):
            posted[b] = t
    report = {"created": 0, "voided": 0, "conflicts": []}
    for b, t in posted.items():
        if b not in desired:
            try:
                await ledger.void_transaction(db, user, t.id)
                report["voided"] += 1
            except Exception as e:  # noqa: BLE001 - e.g. the user refunded it in their ledger
                await db.rollback()
                report["conflicts"].append(f"{t.description}: {getattr(e, 'detail', e)}")
    for b, d in desired.items():
        if b in posted:
            continue
        key = f"{b}#{counts.get(b, 0) // (2 if d['type'] == 'transfer' else 1)}"
        when = _when(d["date"], user)
        if d["type"] == "transfer":
            await ledger.create_transfer(db, user, TransferCreate(
                from_account_id=d["src"], to_account_id=d["dst"], amount_paise=d["amount"],
                description=d["text"][:500], occurred_at=when, timezone=user.timezone or "Asia/Kolkata",
                idempotency_key=key))
        else:
            await ledger.create_transaction(db, user, TransactionCreate(
                account_id=d["src"], amount_paise=d["amount"], kind="expense", description=d["text"][:500],
                category=d.get("category"), occurred_at=when, timezone=user.timezone or "Asia/Kolkata",
                idempotency_key=key))
        report["created"] += 1
    return report


async def blocker(db: AsyncSession, user_id: uuid.UUID, group_id: uuid.UUID, entity_id: uuid.UUID) -> str | None:
    """Refuse a change up front if the caller's own linked entries for it were refunded/reversed."""
    rows = await db.scalars(select(Transaction).where(
        Transaction.user_id == user_id, Transaction.status == "posted",
        Transaction.idempotency_key.like(f"{_prefix(group_id)}{entity_id}:%")))
    for t in rows:
        if await ledger.is_reversed(db, t.id) or await ledger.refunded_total(db, t.id) > 0:
            return "Your own transactions have a refund or reversal on this expense; undo that first"
    return None


async def status(db: AsyncSession, user_id: uuid.UUID, g: SplitGroup, net_paise: int) -> dict:
    lk = await get_link(db, g.id, user_id)
    if lk is None:
        return {"linked": False}
    nets = await ledger.account_nets(db, user_id)
    bal = nets.get(lk.group_account_id, {"posted": 0})["posted"]
    return {"linked": True, "account_id": lk.group_account_id, "funding_account_id": lk.funding_account_id,
            "balance_paise": bal, "in_sync": bal == net_paise}
