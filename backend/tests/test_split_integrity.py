"""Group expense void/edit integrity: settlements kept, balances exact, personal ledger in step."""
import asyncio
import uuid

from tests.conftest import auth, cash_account, register

API = "/api/v1"


async def setup(client):
    asha = await register(client, "asha@example.com", full_name="Asha")
    ravi = await register(client, "ravi@example.com", full_name="Ravi")
    g = (await client.post(f"{API}/groups", headers=auth(asha), json={
        "name": "Goa", "members": [{"display_name": "Ravi"}, {"display_name": "Meera"}]})).json()
    m = {x["display_name"]: x["id"] for x in g["members"]}
    tok = (await client.post(f"{API}/groups/{g['id']}/members/{m['Ravi']}/invite", headers=auth(asha))).json()["token"]
    assert (await client.post(f"{API}/groups/claim", headers=auth(ravi), json={"token": tok})).status_code == 200
    return asha, ravi, g["id"], m


def nets(d):
    return {x["display_name"]: x["net_paise"] for x in d["members"]}


async def personal(client, h, status=None):
    q = f"?status={status}" if status else ""
    return (await client.get(f"{API}/transactions{q}", headers=auth(h))).json()["items"]


async def test_void_after_settlement_needs_confirmation_and_keeps_history(client):
    asha, ravi, gid, m = await setup(client)
    acc = await cash_account(client, asha)
    d = (await client.post(f"{API}/groups/{gid}/expenses", headers=auth(asha), json={
        "description": "Dinner", "amount_paise": 10000, "paid_by_member_id": m["Asha"],
        "personal_account_id": acc, "idempotency_key": "exp-dinner-1"})).json()
    eid = d["expenses"][0]["id"]
    assert d["expenses"][0]["has_personal_entry"] is True
    mine = await personal(client, asha)
    assert [(t["description"], t["amount_paise"]) for t in mine] == [("Group: Dinner", 10000)]
    # Retrying the same expense never creates a second personal entry.
    await client.post(f"{API}/groups/{gid}/expenses", headers=auth(asha), json={
        "description": "Dinner", "amount_paise": 10000, "paid_by_member_id": m["Asha"],
        "personal_account_id": acc, "idempotency_key": "exp-dinner-1"})
    assert len(await personal(client, asha)) == 1

    # Ravi pays back his share.
    await client.post(f"{API}/groups/{gid}/settlements", headers=auth(ravi), json={
        "from_member_id": m["Ravi"], "to_member_id": m["Asha"], "amount_paise": 3333, "idempotency_key": "settle-r-1"})

    pv = (await client.get(f"{API}/groups/{gid}/expenses/{eid}/void-preview", headers=auth(asha))).json()
    assert pv["can_void"] and pv["personal_entry"] == "will_void" and pv["recorded_settlements"] == 1
    flips = {f["member_id"]: (f["before_paise"], f["after_paise"]) for f in pv["balance_flips"]}
    assert flips == {m["Asha"]: (3333, -3333), m["Ravi"]: (0, 3333)}
    assert sum(b["after_paise"] for b in pv["balances"]) == 0
    assert pv["suggested_after"] == [{"from_member_id": m["Asha"], "to_member_id": m["Ravi"], "amount_paise": 3333}]

    # Without confirmation nothing changes.
    r = await client.delete(f"{API}/groups/{gid}/expenses/{eid}", headers=auth(asha))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "balance_change_needs_confirmation"
    d = (await client.get(f"{API}/groups/{gid}", headers=auth(asha))).json()
    assert d["expenses"][0]["status"] == "posted" and (await personal(client, asha))[0]["status"] == "posted"

    # Confirmed: expense void, settlement kept, balances exact and zero-sum, personal entry voided.
    d = (await client.delete(f"{API}/groups/{gid}/expenses/{eid}?confirm_balance_change=true",
                             headers=auth(asha))).json()
    assert d["expenses"][0]["status"] == "void"
    assert [s["status"] for s in d["settlements"]] == ["recorded"]
    assert nets(d) == {"Asha": -3333, "Ravi": 3333, "Meera": 0} and sum(nets(d).values()) == 0
    assert d["suggested_settlements"] == [{"from_member_id": m["Asha"], "to_member_id": m["Ravi"],
                                           "amount_paise": 3333}]
    assert await personal(client, asha, "posted") == []
    assert len(await personal(client, asha, "void")) == 1

    # Repeating the void is a no-op (no second reversal, nothing new in the ledger).
    again = await client.delete(f"{API}/groups/{gid}/expenses/{eid}?confirm_balance_change=true", headers=auth(asha))
    assert again.status_code == 200 and nets(again.json()) == nets(d)
    assert len(await personal(client, asha, "void")) == 1 and await personal(client, asha, "posted") == []


async def test_void_without_settlements_needs_no_confirmation(client):
    asha, _ravi, gid, m = await setup(client)
    d = (await client.post(f"{API}/groups/{gid}/expenses", headers=auth(asha), json={
        "description": "Cab", "amount_paise": 1001, "paid_by_member_id": m["Asha"]})).json()
    eid = d["expenses"][0]["id"]
    pv = (await client.get(f"{API}/groups/{gid}/expenses/{eid}/void-preview", headers=auth(asha))).json()
    assert pv["balance_flips"] == [] and pv["personal_entry"] is None
    d = (await client.delete(f"{API}/groups/{gid}/expenses/{eid}", headers=auth(asha))).json()
    assert all(v == 0 for v in nets(d).values())


async def test_concurrent_voids_apply_once(client):
    asha, _ravi, gid, m = await setup(client)
    acc = await cash_account(client, asha)
    d = (await client.post(f"{API}/groups/{gid}/expenses", headers=auth(asha), json={
        "description": "Hotel", "amount_paise": 90000, "paid_by_member_id": m["Asha"],
        "personal_account_id": acc})).json()
    eid = d["expenses"][0]["id"]
    r1, r2 = await asyncio.gather(
        client.delete(f"{API}/groups/{gid}/expenses/{eid}", headers=auth(asha)),
        client.delete(f"{API}/groups/{gid}/expenses/{eid}", headers=auth(asha)))
    # One wins; the other either sees it already void (200) or is refused (409). Never applied twice.
    codes = sorted([r1.status_code, r2.status_code])
    assert codes in ([200, 200], [200, 409]), codes
    d = (await client.get(f"{API}/groups/{gid}", headers=auth(asha))).json()
    assert d["expenses"][0]["status"] == "void" and all(v == 0 for v in nets(d).values())
    assert len(await personal(client, asha, "void")) == 1 and await personal(client, asha, "posted") == []


async def test_concurrent_settlements_cannot_overpay(client):
    asha, ravi, gid, m = await setup(client)
    await client.post(f"{API}/groups/{gid}/expenses", headers=auth(asha), json={
        "description": "Dinner", "amount_paise": 9000, "paid_by_member_id": m["Asha"]})
    body = {"from_member_id": m["Ravi"], "to_member_id": m["Asha"], "amount_paise": 3000}
    rs = await asyncio.gather(*[client.post(f"{API}/groups/{gid}/settlements", headers=auth(ravi),
                                            json={**body, "idempotency_key": f"settle-con-{i}"}) for i in range(3)])
    assert sorted(r.status_code for r in rs) == [201, 409, 409]
    d = (await client.get(f"{API}/groups/{gid}", headers=auth(asha))).json()
    assert nets(d)["Ravi"] == 0 and sum(nets(d).values()) == 0


async def test_permissions_and_other_peoples_ledgers(client):
    asha, ravi, gid, m = await setup(client)
    ravi_acc = await cash_account(client, ravi)
    asha_acc = await cash_account(client, asha)
    # Can't mirror into someone else's account, or for someone else's payment.
    r = await client.post(f"{API}/groups/{gid}/expenses", headers=auth(ravi), json={
        "description": "x", "amount_paise": 300, "paid_by_member_id": m["Ravi"], "personal_account_id": asha_acc})
    assert r.status_code == 404
    r = await client.post(f"{API}/groups/{gid}/expenses", headers=auth(ravi), json={
        "description": "x", "amount_paise": 300, "paid_by_member_id": m["Asha"], "personal_account_id": ravi_acc})
    assert r.status_code == 422
    # Ravi pays for snacks and mirrors it into his ledger.
    d = (await client.post(f"{API}/groups/{gid}/expenses", headers=auth(ravi), json={
        "description": "Snacks", "amount_paise": 600, "paid_by_member_id": m["Ravi"],
        "personal_account_id": ravi_acc})).json()
    eid = d["expenses"][0]["id"]
    # Asha's expense can't be voided by Ravi (member, not creator).
    a = (await client.post(f"{API}/groups/{gid}/expenses", headers=auth(asha), json={
        "description": "Fuel", "amount_paise": 900, "paid_by_member_id": m["Asha"]})).json()
    fuel = next(e["id"] for e in a["expenses"] if e["description"] == "Fuel")
    assert (await client.delete(f"{API}/groups/{gid}/expenses/{fuel}", headers=auth(ravi))).status_code == 403
    # Admin Asha voids Ravi's expense: Ravi's own ledger entry is flagged, not changed.
    pv = (await client.get(f"{API}/groups/{gid}/expenses/{eid}/void-preview", headers=auth(asha))).json()
    assert pv["personal_entry"] == "will_flag_for_payer"
    r = await client.delete(f"{API}/groups/{gid}/expenses/{eid}?confirm_balance_change=true", headers=auth(asha))
    assert r.status_code == 200, r.text
    tx = (await personal(client, ravi))[0]
    assert tx["status"] == "posted" and tx["needs_review"] is True and tx["amount_paise"] == 600
    assert await personal(client, asha) == []
    # Outsiders can't preview.
    eve = await register(client, "eve@example.com")
    assert (await client.get(f"{API}/groups/{gid}/expenses/{fuel}/void-preview",
                             headers=auth(eve))).status_code == 404


async def test_edit_amount_updates_mirror_and_refund_blocks_void(client):
    asha, _ravi, gid, m = await setup(client)
    acc = await cash_account(client, asha)
    d = (await client.post(f"{API}/groups/{gid}/expenses", headers=auth(asha), json={
        "description": "Tickets", "amount_paise": 30000, "paid_by_member_id": m["Asha"],
        "personal_account_id": acc})).json()
    eid = d["expenses"][0]["id"]
    d = (await client.patch(f"{API}/groups/{gid}/expenses/{eid}", headers=auth(asha),
                            json={"amount_paise": 30001})).json()
    assert sum(s["share_paise"] for s in d["expenses"][0]["shares"]) == 30001
    tx = (await personal(client, asha))[0]
    assert tx["amount_paise"] == 30001
    # A refund on the personal entry blocks the void (and the edit) instead of leaving them out of step.
    r = await client.post(f"{API}/transactions/{tx['id']}/refunds", headers=auth(asha), json={"amount_paise": 1000})
    assert r.status_code == 201, r.text
    r = await client.delete(f"{API}/groups/{gid}/expenses/{eid}", headers=auth(asha))
    assert r.status_code == 409 and "refund" in r.text
    r = await client.patch(f"{API}/groups/{gid}/expenses/{eid}", headers=auth(asha), json={"amount_paise": 20000})
    assert r.status_code == 409
    d = (await client.get(f"{API}/groups/{gid}", headers=auth(asha))).json()
    assert d["expenses"][0]["status"] == "posted" and d["expenses"][0]["amount_paise"] == 30001


async def test_invite_codes_expire_and_replace_each_other(client):
    from datetime import date, timedelta

    from sqlalchemy import update

    from app.core.database import get_db
    from app.models import SplitMember

    asha = await register(client, "asha@example.com", full_name="Asha")
    ravi = await register(client, "ravi@example.com", full_name="Ravi")
    g = (await client.post(f"{API}/groups", headers=auth(asha), json={
        "name": "Flat", "members": [{"display_name": "Ravi"}]})).json()
    rid = next(m["id"] for m in g["members"] if m["display_name"] == "Ravi")
    url = f"{API}/groups/{g['id']}/members/{rid}/invite"
    old = (await client.post(url, headers=auth(asha))).json()["token"]
    new = (await client.post(url, headers=auth(asha))).json()["token"]
    # A newer code cancels the older one.
    assert (await client.post(f"{API}/groups/claim", headers=auth(ravi), json={"token": old})).status_code == 400
    # Expired codes are refused.
    async for db in get_db():
        await db.execute(update(SplitMember).where(SplitMember.id == uuid.UUID(rid))
                         .values(invite_expires_at=date.today() - timedelta(days=2)))
        await db.commit()
    assert (await client.post(f"{API}/groups/claim", headers=auth(ravi), json={"token": new})).status_code == 400
    assert (await client.get(f"{API}/groups/{g['id']}", headers=auth(ravi))).status_code == 404
    # Members can't issue codes; a fresh admin code works once.
    fresh = (await client.post(url, headers=auth(asha))).json()["token"]
    assert (await client.post(f"{API}/groups/claim", headers=auth(ravi), json={"token": fresh})).status_code == 200
    d = (await client.get(f"{API}/groups/{g['id']}", headers=auth(ravi))).json()
    assert d["my_role"] == "member" and next(m for m in d["members"] if m["is_me"])["linked"] is True
    meera = (await client.post(f"{API}/groups/{g['id']}/members", headers=auth(asha),
                               json={"display_name": "Meera"})).json()
    mid = next(m["id"] for m in meera["members"] if m["display_name"] == "Meera")
    assert (await client.post(f"{API}/groups/{g['id']}/members/{mid}/invite",
                              headers=auth(ravi))).status_code == 403
    # Linked seats can't be re-invited (no seat takeover).
    assert (await client.post(url, headers=auth(asha))).status_code == 404
    # Removing Ravi revokes his access; he can't read the group afterwards.
    assert (await client.delete(f"{API}/groups/{g['id']}/members/{rid}", headers=auth(asha))).status_code == 200
    assert (await client.get(f"{API}/groups/{g['id']}", headers=auth(ravi))).status_code == 404
    assert (await client.get(f"{API}/groups", headers=auth(ravi))).json() == []
