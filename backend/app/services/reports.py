"""Reports derived from the ledger. Reporting rules:

- only status='posted' entries count; pending and void never do
- transfers, adjustments and reversals are never income or expense
- an entry that has been reversed drops out of income/expense (its reversal
  cancels it in the balance)
- net spend = expenses - refunds
- savings contributions, loan repayments and investments are reported as
  their own outflow buckets, not as spending
"""
import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinancialAccount, Transaction
from app.services.ledger import account_nets, account_view

OUTFLOW_BUCKETS = ("savings_contribution", "loan_repayment", "investment")


async def _reversed_ids(db: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    rows = await db.scalars(select(Transaction.reverses_id).where(
        Transaction.user_id == user_id, Transaction.reverses_id.is_not(None), Transaction.status != "void"))
    return set(rows)


async def reportable(db: AsyncSession, user_id: uuid.UUID, from_date: date, to_date: date,
                     account_id: uuid.UUID | None = None) -> list[Transaction]:
    stmt = select(Transaction).where(
        Transaction.user_id == user_id, Transaction.status == "posted",
        Transaction.local_date >= from_date, Transaction.local_date <= to_date,
        Transaction.kind.not_in(("transfer", "adjustment", "reversal")),
    )
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    rows = list(await db.scalars(stmt))
    reversed_ = await _reversed_ids(db, user_id)
    return [t for t in rows if t.id not in reversed_]


def net_spend(rows: list[Transaction], category: str | None = None) -> int:
    total = 0
    for t in rows:
        if category is not None and t.category != category:
            continue
        if t.kind == "expense":
            total += t.amount_paise
        elif t.kind == "refund":
            total -= t.amount_paise
    return total


async def summary(db: AsyncSession, user_id: uuid.UUID, from_date: date, to_date: date) -> dict:
    rows = await reportable(db, user_id, from_date, to_date)
    accounts = {a.id: a for a in await db.scalars(select(FinancialAccount).where(FinancialAccount.user_id == user_id))}

    income = sum(t.amount_paise for t in rows if t.kind == "income")
    expense = sum(t.amount_paise for t in rows if t.kind == "expense")
    refunds = sum(t.amount_paise for t in rows if t.kind == "refund")
    buckets = {k: sum(t.amount_paise for t in rows if t.kind == k) for k in OUTFLOW_BUCKETS}

    by_category: dict[str, int] = defaultdict(int)
    by_day: dict[str, int] = defaultdict(int)
    cash = digital = 0
    by_account: dict[uuid.UUID, dict[str, int]] = defaultdict(lambda: {"income_paise": 0, "net_spend_paise": 0})
    for t in rows:
        sign = 1 if t.kind == "expense" else -1 if t.kind == "refund" else 0
        if sign:
            amt = sign * t.amount_paise
            by_category[t.category or "Uncategorised"] += amt
            by_day[t.local_date.isoformat()] += amt
            by_account[t.account_id]["net_spend_paise"] += amt
            if accounts.get(t.account_id) and accounts[t.account_id].account_type == "cash":
                cash += amt
            else:
                digital += amt
        elif t.kind == "income":
            by_account[t.account_id]["income_paise"] += t.amount_paise

    transfers = sum(1 for t in await db.scalars(select(Transaction).where(
        Transaction.user_id == user_id, Transaction.kind == "transfer", Transaction.status == "posted",
        Transaction.direction == "debit", Transaction.local_date >= from_date, Transaction.local_date <= to_date)))

    return {
        "from_date": from_date,
        "to_date": to_date,
        "income_paise": income,
        "expense_paise": expense,
        "refunds_paise": refunds,
        "net_spend_paise": expense - refunds,
        "net_savings_paise": income - (expense - refunds) - sum(buckets.values()),
        "outflows_paise": buckets,
        "transfer_count": transfers,
        "cash_spend_paise": cash,
        "digital_spend_paise": digital,
        "by_category": [
            {"category": k, "net_spend_paise": v} for k, v in sorted(by_category.items(), key=lambda x: -x[1])
        ],
        "by_day": [{"date": k, "net_spend_paise": v} for k, v in sorted(by_day.items())],
        "by_account": [
            {"account_id": aid, "name": accounts[aid].name if aid in accounts else None, **v}
            for aid, v in by_account.items()
        ],
    }


async def net_worth(db: AsyncSession, user_id: uuid.UUID) -> dict:
    nets = await account_nets(db, user_id)
    views = [account_view(a, nets) for a in await db.scalars(select(FinancialAccount).where(
        FinancialAccount.user_id == user_id, FinancialAccount.is_archived.is_(False)))]
    by_currency: dict[str, dict[str, int]] = defaultdict(lambda: {"assets_paise": 0, "liabilities_paise": 0})
    for v in views:
        bucket = by_currency[v["currency"]]
        if v["balance_paise"] >= 0:
            bucket["assets_paise"] += v["balance_paise"]
        else:
            bucket["liabilities_paise"] += -v["balance_paise"]
    return {
        "by_currency": [
            {"currency": c, **b, "net_worth_paise": b["assets_paise"] - b["liabilities_paise"]}
            for c, b in sorted(by_currency.items())
        ],
        "accounts": views,
    }


async def reconciliation(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Integrity check: recompute every balance from raw entries and verify ledger invariants."""
    txs = list(await db.scalars(select(Transaction).where(Transaction.user_id == user_id)))
    accounts = list(await db.scalars(select(FinancialAccount).where(FinancialAccount.user_id == user_id)))
    issues: list[str] = []

    per_account = []
    for a in accounts:
        posted = [t for t in txs if t.account_id == a.id and t.status == "posted"]
        credits = sum(t.amount_paise for t in posted if t.direction == "credit")
        debits = sum(t.amount_paise for t in posted if t.direction == "debit")
        per_account.append({
            "account_id": a.id, "name": a.name, "currency": a.currency,
            "opening_balance_paise": a.opening_balance_paise, "credits_paise": credits,
            "debits_paise": debits, "balance_paise": a.opening_balance_paise + credits - debits,
        })

    groups: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for t in txs:
        if t.transfer_group_id:
            groups[t.transfer_group_id].append(t)
    for gid, legs in groups.items():
        live = [t for t in legs if t.status != "void"]
        if live and (len(live) != 2 or {t.direction for t in live} != {"debit", "credit"}
                     or len({t.amount_paise for t in live}) != 1):
            issues.append(f"transfer {gid} is unbalanced")

    by_id = {t.id: t for t in txs}
    refunded: dict[uuid.UUID, int] = defaultdict(int)
    for t in txs:
        if t.kind == "refund" and t.status != "void":
            refunded[t.refund_of_id] += t.amount_paise
    for oid, total in refunded.items():
        o = by_id.get(oid)
        if o is None or total > o.amount_paise:
            issues.append(f"refunds on {oid} exceed the original")

    return {"accounts": per_account, "issues": issues, "ok": not issues}


def period_bounds(period: str, today: date) -> tuple[date, date]:
    if period == "daily":
        return today, today
    if period == "weekly":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    if period == "monthly":
        start = today.replace(day=1)
        nxt = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        return start, nxt - timedelta(days=1)
    start = today.replace(month=1, day=1)
    return start, today.replace(month=12, day=31)
