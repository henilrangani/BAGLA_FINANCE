"""Share-based group accounting (DECISIONS D12): exact paise invariants for every linked member.

Invariants checked after every step, for each linked member M:
  I1  sum of group nets == 0
  I2  M's "Group:" account balance == M's net in the group
  I3  M's spending in the group == sum of M's shares over posted expenses (never the full amount paid)
  I4  M's funding account moved by exactly -(paid by M) - (paid back by M) + (paid back to M)
  I5  syncing again changes nothing (idempotent)
"""
import asyncio
import random
import uuid

from sqlalchemy import select

from app.core.database import get_db
from app.models import AuditEvent, SplitExpense, Transaction
from tests.conftest import add_tx, auth, cash_account, register

API = "/api/v1"


async def setup(client, names=("Asha", "Ravi", "Meera"), extra=("Dev",)):
    hs = {n: await register(client, f"{n.lower()}@example.com", full_name=n) for n in names}
    g = (await client.post(f"{API}/groups", headers=auth(hs[names[0]]), json={
        "name": "Trip", "members": [{"display_name": n} for n in names[1:] + tuple(extra)]})).json()
    m = {x["display_name"]: x["id"] for x in g["members"]}
    for n in names[1:]:
        tok = (await client.post(f"{API}/groups/{g['id']}/members/{m[n]}/invite",
                                 headers=auth(hs[names[0]]))).json()["token"]
        r = await client.post(f"{API}/groups/claim", headers=auth(hs[n]), json={"token": tok})
        assert r.status_code == 200
    accs = {n: await cash_account(client, h) for n, h in hs.items()}
    for n, h in hs.items():
        r = await client.post(f"{API}/groups/{g['id']}/ledger", headers=auth(h), json={"funding_account_id": accs[n]})
        assert r.status_code == 200, r.text
    return hs, g["id"], m, accs


async def detail(client, h, gid):
    return (await client.get(f"{API}/groups/{gid}", headers=auth(h))).json()


async def mine(client, h):
    items = (await client.get(f"{API}/transactions?status=posted&limit=200", headers=auth(h))).json()["items"]
    raw = (await client.get(f"{API}/accounts", headers=auth(h))).json()
    accs = {a["account_type"]: a["balance_paise"] for a in raw}
    spend = sum(t["amount_paise"] for t in items if t["kind"] == "expense") - \
        sum(t["amount_paise"] for t in items if t["kind"] == "refund")
    return {"spend": spend, "group": accs.get("group", 0), "cash": accs.get("cash", 0), "n": len(items)}


async def check(client, hs, gid, m, cash_before=None):
    for h in hs.values():
        assert (await client.post(f"{API}/groups/{gid}/ledger/sync", headers=auth(h))).status_code == 200
    d = await detail(client, next(iter(hs.values())), gid)
    nets = {x["display_name"]: x["net_paise"] for x in d["members"]}
    assert sum(nets.values()) == 0, nets  # I1
    posted = [e for e in d["expenses"] if e["status"] == "posted"]
    recorded = [s for s in d["settlements"] if s["status"] == "recorded"]
    for name, h in hs.items():
        me = m[name]
        b = await mine(client, h)
        assert b["group"] == nets[name], (name, b, nets)  # I2
        my_shares = sum(s["share_paise"] for e in posted for s in e["shares"] if s["member_id"] == me)
        assert b["spend"] == my_shares, (name, b, my_shares)  # I3
        if cash_before is not None:
            paid = sum(e["amount_paise"] for e in posted if e["paid_by_member_id"] == me)
            sent = sum(s["amount_paise"] for s in recorded if s["from_member_id"] == me)
            recv = sum(s["amount_paise"] for s in recorded if s["to_member_id"] == me)
            assert b["cash"] - cash_before[name] == -paid - sent + recv, name  # I4
        again = (await client.post(f"{API}/groups/{gid}/ledger/sync", headers=auth(h))).json()["sync"]
        assert again["created"] == 0 and again["voided"] == 0 and again["conflicts"] == []  # I5
        assert (await mine(client, h))["n"] == b["n"]
    return nets


async def expense(client, h, gid, **body):
    r = await client.post(f"{API}/groups/{gid}/expenses", headers=auth(h), json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_equal_unequal_splits_partial_settlements_refund_void_edit(client):
    hs, gid, m, _ = await setup(client)
    cash0 = {n: (await mine(client, h))["cash"] for n, h in hs.items()}
    # ₹100.01 equal among 4 (one has no account): 2501 + 2500 + 2500 + 2500.
    await expense(client, hs["Asha"], gid, description="Dinner", amount_paise=10001, paid_by_member_id=m["Asha"])
    # Exact, unequal: Ravi pays ₹999.99 for three people.
    await expense(client, hs["Ravi"], gid, description="Hotel", amount_paise=99999, paid_by_member_id=m["Ravi"],
                  split="exact", shares=[{"member_id": m["Asha"], "share_paise": 33333},
                                         {"member_id": m["Ravi"], "share_paise": 50000},
                                         {"member_id": m["Meera"], "share_paise": 16666}])
    # Someone without an account (Dev) paid; Meera is a non-payer with only shares.
    await expense(client, hs["Asha"], gid, description="Cab", amount_paise=777, paid_by_member_id=m["Dev"],
                  participant_ids=[m["Asha"], m["Meera"], m["Dev"]])
    nets = await check(client, hs, gid, m, cash0)
    assert nets["Asha"] == 10001 - 2501 - 33333 - 259  # Cab: 259 + 259 + 259 = 777

    # Partial settlement Meera → Ravi (part of what she owes), then an overpayment is refused.
    owed = -nets["Meera"]
    r = await client.post(f"{API}/groups/{gid}/settlements", headers=auth(hs["Meera"]), json={
        "from_member_id": m["Meera"], "to_member_id": m["Ravi"], "amount_paise": 5000,
        "idempotency_key": "meera-part-1"})
    assert r.status_code == 201
    over = await client.post(f"{API}/groups/{gid}/settlements", headers=auth(hs["Meera"]), json={
        "from_member_id": m["Meera"], "to_member_id": m["Ravi"], "amount_paise": owed})  # more than remaining
    assert over.status_code == 409
    await check(client, hs, gid, m, cash0)

    # Refund: the hotel refunds ₹99.99 → recorded as an edit of the group expense (re-split equally).
    hotel = next(e for e in (await detail(client, hs["Ravi"], gid))["expenses"] if e["description"] == "Hotel")
    r = await client.patch(f"{API}/groups/{gid}/expenses/{hotel['id']}", headers=auth(hs["Ravi"]),
                           json={"amount_paise": 90000})
    edited = next(e for e in r.json()["expenses"] if e["id"] == hotel["id"])
    assert r.status_code == 200 and sum(s["share_paise"] for s in edited["shares"]) == 90000
    await check(client, hs, gid, m, cash0)

    # Void the dinner (confirm if balances flip); payments stay; everyone still reconciles.
    dinner = next(e for e in (await detail(client, hs["Asha"], gid))["expenses"] if e["description"] == "Dinner")
    r = await client.delete(f"{API}/groups/{gid}/expenses/{dinner['id']}?confirm_balance_change=true",
                            headers=auth(hs["Asha"]))
    assert r.status_code == 200
    await check(client, hs, gid, m, cash0)

    # Undo the partial payment (it never happened) → balances return.
    st = next(s for s in (await detail(client, hs["Meera"], gid))["settlements"] if s["status"] == "recorded")
    r = await client.delete(f"{API}/groups/{gid}/settlements/{st['id']}", headers=auth(hs["Meera"]))
    assert r.status_code == 200
    await check(client, hs, gid, m, cash0)


async def test_fully_settled_group_reconciles_to_zero(client):
    hs, gid, m, _ = await setup(client, extra=())
    cash0 = {n: (await mine(client, h))["cash"] for n, h in hs.items()}
    await expense(client, hs["Asha"], gid, description="Rent", amount_paise=3000001, paid_by_member_id=m["Asha"])
    nets = await check(client, hs, gid, m, cash0)
    for n in ("Ravi", "Meera"):
        r = await client.post(f"{API}/groups/{gid}/settlements", headers=auth(hs[n]), json={
            "from_member_id": m[n], "to_member_id": m["Asha"], "amount_paise": -nets[n]})
        assert r.status_code == 201
    nets = await check(client, hs, gid, m, cash0)
    assert set(nets.values()) == {0}
    for h in hs.values():
        b = await mine(client, h)
        assert b["group"] == 0  # nothing owed either way
    # Everyone's spending is exactly a third of the rent, to the paisa, and adds up to the bill.
    spends = [(await mine(client, h))["spend"] for h in hs.values()]
    assert sorted(spends) == [1000000, 1000000, 1000001] and sum(spends) == 3000001


async def test_concurrent_settlements_post_one_ledger_entry(client):
    hs, gid, m, _ = await setup(client, extra=())
    await expense(client, hs["Asha"], gid, description="Fuel", amount_paise=9000, paid_by_member_id=m["Asha"])
    body = {"from_member_id": m["Ravi"], "to_member_id": m["Asha"], "amount_paise": 3000}
    rs = await asyncio.gather(*[client.post(f"{API}/groups/{gid}/settlements", headers=auth(hs["Ravi"]),
                                            json={**body, "idempotency_key": f"par-{i}-settle"}) for i in range(4)])
    assert sorted(r.status_code for r in rs) == [201, 409, 409, 409]
    await check(client, hs, gid, m)
    ravi_tx = (await client.get(f"{API}/transactions?status=posted&limit=200",
                                headers=auth(hs["Ravi"]))).json()["items"]
    assert sum(1 for t in ravi_tx if t["kind"] == "transfer" and t["direction"] == "debit"
               and t["description"].startswith("Paid back")) == 1


async def test_legacy_full_amount_entry_is_replaced_with_audit(client):
    asha = await register(client, "asha@example.com", full_name="Asha")
    g = (await client.post(f"{API}/groups", headers=auth(asha), json={
        "name": "Old", "members": [{"display_name": "Ravi"}]})).json()
    me = g["my_member_id"]
    acc = await cash_account(client, asha)
    d = await expense(client, asha, g["id"], description="Dinner", amount_paise=10000, paid_by_member_id=me)
    # Simulate a batch-2 entry: the full amount recorded as personal spending and linked.
    legacy = await add_tx(client, asha, acc, 10000, description="Group: Dinner")
    async for db in get_db():
        e = await db.get(SplitExpense, uuid.UUID(d["expenses"][0]["id"]))
        e.personal_transaction_id = uuid.UUID(legacy["id"])
        await db.commit()
    r = await client.post(f"{API}/groups/{g['id']}/ledger", headers=auth(asha), json={"funding_account_id": acc})
    assert r.status_code == 200
    b = await mine(client, asha)
    assert b["spend"] == 5000 and b["group"] == 5000  # share only; the legacy full-amount entry no longer counts
    lt = (await client.get(f"{API}/transactions/{legacy['id']}", headers=auth(asha))).json()
    assert lt["status"] == "void"  # kept in history, not deleted
    async for db in get_db():
        ev = await db.scalar(select(AuditEvent).where(AuditEvent.entity_id == uuid.UUID(legacy["id"]),
                                                      AuditEvent.action == "replaced_by_group_ledger"))
        assert ev is not None
        assert await db.scalar(select(Transaction).where(Transaction.id == uuid.UUID(legacy["id"]))) is not None


async def test_removed_member_sync_is_refused_and_writes_nothing(client):
    hs, gid, m, _ = await setup(client, extra=())
    await expense(client, hs["Asha"], gid, description="Tea", amount_paise=300, paid_by_member_id=m["Asha"])
    await check(client, hs, gid, m)
    # Meera settles and leaves; afterwards she can't sync (no access) and her books are unchanged.
    await client.post(f"{API}/groups/{gid}/settlements", headers=auth(hs["Meera"]), json={
        "from_member_id": m["Meera"], "to_member_id": m["Asha"], "amount_paise": 100})
    await client.post(f"{API}/groups/{gid}/ledger/sync", headers=auth(hs["Meera"]))
    before = await mine(client, hs["Meera"])
    r = await client.delete(f"{API}/groups/{gid}/members/{m['Meera']}", headers=auth(hs["Meera"]))
    assert r.status_code == 200
    assert (await client.post(f"{API}/groups/{gid}/ledger/sync", headers=auth(hs["Meera"]))).status_code == 404
    assert await mine(client, hs["Meera"]) == before


async def test_randomized_sequence_keeps_every_invariant(client):
    rng = random.Random(20261106)  # noqa: S311 - deterministic test data, not security
    hs, gid, m, _ = await setup(client)
    names = list(hs)
    members = [m[n] for n in names] + [m["Dev"]]
    cash0 = {n: (await mine(client, h))["cash"] for n, h in hs.items()}
    for step in range(14):
        actor = rng.choice(names)
        h = hs[actor]
        d = await detail(client, h, gid)
        live = [e for e in d["expenses"] if e["status"] == "posted"]
        op = rng.choice(["equal", "exact", "settle", "edit", "void"] if live else ["equal", "exact"])
        if op == "equal":
            parts = rng.sample(members, rng.randint(1, len(members)))
            await expense(client, h, gid, description=f"E{step}", amount_paise=rng.randint(1, 250_000),
                          paid_by_member_id=rng.choice(members), participant_ids=parts)
        elif op == "exact":
            parts = rng.sample(members, rng.randint(1, len(members)))
            shares = [rng.randint(0, 50_000) for _ in parts]
            if sum(shares) == 0:
                shares[0] = 1
            await expense(client, h, gid, description=f"X{step}", amount_paise=sum(shares),
                          paid_by_member_id=rng.choice(members), split="exact",
                          shares=[{"member_id": p, "share_paise": s} for p, s in zip(parts, shares, strict=True)])
        elif op == "settle" and d["suggested_settlements"]:
            s = rng.choice(d["suggested_settlements"])
            amt = rng.randint(1, s["amount_paise"])
            await client.post(f"{API}/groups/{gid}/settlements", headers=auth(h), json={**s, "amount_paise": amt})
        elif op == "edit":
            e = rng.choice(live)
            await client.patch(f"{API}/groups/{gid}/expenses/{e['id']}", headers=auth(hs[names[0]]),
                               json={"amount_paise": rng.randint(1, 250_000)})
        elif op == "void":
            e = rng.choice(live)
            await client.delete(f"{API}/groups/{gid}/expenses/{e['id']}?confirm_balance_change=true",
                                headers=auth(hs[names[0]]))
        await check(client, hs, gid, m, cash0)
