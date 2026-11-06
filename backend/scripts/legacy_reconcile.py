"""Read-only reconciliation report for a legacy (revision 0001) Bagla database.

Never writes: every query runs inside `SET TRANSACTION READ ONLY`, and the script refuses a
database that isn't at revision 0001. Run it against a *restored copy* of the legacy dump
(see LEGACY_DATA_PROCEDURE.md), not against the original.

For each legacy account it shows both possible meanings of the stored `balance_paise`:
- as an OPENING balance  → current = stored + net of its transactions
- as a RUNNING balance   → opening = stored − net of its transactions
It never chooses between them. A person must confirm the opening balance (e.g. from a bank
statement) before anything is imported.

Usage:
    python scripts/legacy_reconcile.py postgresql+asyncpg://USER:PASS@HOST:PORT/DB > report.json
"""
import asyncio
import hashlib
import json
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def mask(email: str) -> str:
    """Stable, non-reversible label so reports can be shared without personal data."""
    local, _, domain = (email or "").partition("@")
    return f"user-{hashlib.sha256(email.encode()).hexdigest()[:8]}@{domain or '?'}"


async def report(url: str) -> dict:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SET TRANSACTION READ ONLY"))
            rev = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one()
            if rev != "0001_initial_schema":
                raise SystemExit(f"Refusing: expected legacy revision 0001_initial_schema, found {rev}")
            users = {r.id: r for r in (await conn.execute(text(
                "SELECT id, email, created_at FROM users ORDER BY created_at"))).all()}
            accounts = (await conn.execute(text(
                "SELECT id, user_id, name, account_type, balance_paise, currency FROM financial_accounts"))).all()
            txs = (await conn.execute(text(
                "SELECT id, user_id, account_id, amount_paise, direction, deleted, source, created_at "
                "FROM transactions"))).all()
            await conn.rollback()
    finally:
        await engine.dispose()

    def net(rows):
        return sum(t.amount_paise if t.direction == "credit" else -t.amount_paise for t in rows)

    out = {"legacy_revision": rev, "users": len(users), "accounts": [], "unassigned_transactions": [],
           "issues": []}
    for a in accounts:
        live = [t for t in txs if t.account_id == a.id and not t.deleted]
        n = net(live)
        out["accounts"].append({
            "account_id": str(a.id), "owner": mask(users[a.user_id].email) if a.user_id in users else "missing-user",
            "type": a.account_type, "currency": a.currency, "stored_balance_paise": a.balance_paise,
            "transactions": len(live), "net_of_transactions_paise": n,
            "if_stored_is_opening": {"opening_paise": a.balance_paise, "current_paise": a.balance_paise + n},
            "if_stored_is_running": {"opening_paise": a.balance_paise - n, "current_paise": a.balance_paise},
            "difference_between_readings_paise": n,
            "needs_confirmation": n != 0,
        })
    for uid in {t.user_id for t in txs if t.account_id is None}:
        rows = [t for t in txs if t.user_id == uid and t.account_id is None and not t.deleted]
        out["unassigned_transactions"].append({"owner": mask(users[uid].email) if uid in users else "missing-user",
                                               "count": len(rows), "net_paise": net(rows)})
    deleted = sum(1 for t in txs if t.deleted)
    if deleted:
        out["issues"].append(f"{deleted} transaction(s) flagged deleted: excluded from nets, keep for audit")
    if any(t.direction not in ("debit", "credit") for t in txs):
        out["issues"].append("unknown transaction directions present")
    if any(t.amount_paise <= 0 for t in txs):
        out["issues"].append("non-positive amounts present")
    return out


if __name__ == "__main__":  # pragma: no cover
    print(json.dumps(asyncio.run(report(sys.argv[1])), indent=2, default=str))
