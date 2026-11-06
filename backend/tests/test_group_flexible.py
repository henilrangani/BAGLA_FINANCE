"""Flexible groups: types/labels, percentage and shares splits, exact paise rounding, member identity."""
import random

import pytest

from app.api.v1.routes.splits import allocate_weighted
from tests.conftest import auth, register

API = "/api/v1"


async def make_group(client, h, names=("Ravi", "Meera", "Kabir"), **extra):
    r = await client.post(f"{API}/groups", headers=auth(h), json={
        "name": "Flat 12", "members": [{"display_name": n} for n in names], **extra})
    assert r.status_code == 201, r.text
    return r.json()


def by_name(g):
    return {m["display_name"]: m["id"] for m in g["members"]}


def shares_of(g, exp_index=0):
    return {s["member_id"]: s["share_paise"] for s in g["expenses"][exp_index]["shares"]}


# ---------------------------------------------------------------- allocation maths

def test_weighted_allocation_sums_exactly_and_is_fair():
    rng = random.Random(20261106)  # noqa: S311 - reproducible test data, not security
    for _ in range(2000):
        n = rng.randint(1, 20)
        weights = [rng.randint(1, 10_000) for _ in range(n)]
        total = rng.randint(1, 10_000_000)
        out = allocate_weighted(total, weights)
        assert sum(out) == total
        big_w = sum(weights)
        for share, w in zip(out, weights, strict=True):
            exact_num = total * w  # share must be floor or ceil of total*w/W
            assert share * big_w <= exact_num + big_w and share * big_w >= exact_num - big_w


@pytest.mark.parametrize("total,weights,expected", [
    (10_000, [1, 1, 1], [3334, 3333, 3333]),          # ₹100 three ways: the extra paisa goes first
    (1, [1, 1], [1, 0]),                               # a single paisa can't be halved
    # 50/30/20% of ₹999.99: remainders .5/.7/.8, so the 30% and 20% shares get the 2 leftover paise
    (99_999, [5000, 3000, 2000], [49999, 30000, 20000]),
    (10_001, [2, 1, 1], [5001, 2500, 2500]),           # shares 2:1:1
    (100, [3333, 3333, 3334], [33, 33, 34]),           # percentages 33.33/33.33/33.34
])
def test_weighted_allocation_known_cases(total, weights, expected):
    assert allocate_weighted(total, weights) == expected


def test_weighted_allocation_rejects_bad_weights():
    for bad in ([], [0, 1], [-1, 2]):
        with pytest.raises(ValueError):
            allocate_weighted(100, bad)


# ---------------------------------------------------------------- API: split methods

async def test_percentage_split_is_exact_and_recorded(client):
    h = await register(client)
    g = await make_group(client, h)
    m = by_name(g)
    me = g["my_member_id"]
    r = await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "Rent", "amount_paise": 99_999, "paid_by_member_id": me, "split": "percentage",
        "weights": [{"member_id": me, "weight": 5000}, {"member_id": m["Ravi"], "weight": 3000},
                    {"member_id": m["Meera"], "weight": 2000}]})  # Kabir didn't take part
    assert r.status_code == 201, r.text
    g = r.json()
    sh = shares_of(g)
    assert sh == {me: 49999, m["Ravi"]: 30000, m["Meera"]: 20000}
    assert sum(sh.values()) == 99_999 and m["Kabir"] not in sh
    assert g["expenses"][0]["split_method"] == "percentage"
    assert sum(x["net_paise"] for x in g["members"]) == 0
    net = {x["id"]: x["net_paise"] for x in g["members"]}
    assert net[me] == 99_999 - 49999 and net[m["Kabir"]] == 0


async def test_percentages_must_total_100(client):
    h = await register(client)
    g = await make_group(client, h)
    me = g["my_member_id"]
    r = await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "x", "amount_paise": 1000, "paid_by_member_id": me, "split": "percentage",
        "weights": [{"member_id": me, "weight": 6000}, {"member_id": by_name(g)["Ravi"], "weight": 3000}]})
    assert r.status_code == 422
    assert "100%" in r.text


async def test_shares_split_and_amount_edit_keeps_proportions(client):
    h = await register(client)
    g = await make_group(client, h)
    m = by_name(g)
    me = g["my_member_id"]
    g = (await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "Dinner", "amount_paise": 10_001, "paid_by_member_id": me, "split": "shares",
        "weights": [{"member_id": me, "weight": 2}, {"member_id": m["Ravi"], "weight": 1},
                    {"member_id": m["Meera"], "weight": 1}]})).json()
    assert shares_of(g) == {me: 5001, m["Ravi"]: 2500, m["Meera"]: 2500}
    eid = g["expenses"][0]["id"]
    g = (await client.patch(f"{API}/groups/{g['id']}/expenses/{eid}", headers=auth(h),
                            json={"amount_paise": 20_000})).json()
    assert shares_of(g) == {me: 10000, m["Ravi"]: 5000, m["Meera"]: 5000}  # still 2:1:1, not equal
    assert sum(x["net_paise"] for x in g["members"]) == 0


async def test_exact_split_amount_edit_keeps_ratio_and_equal_edit_stays_equal(client):
    h = await register(client)
    g = await make_group(client, h, names=("Ravi",))
    m = by_name(g)
    me = g["my_member_id"]
    g = (await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "Cab", "amount_paise": 300, "paid_by_member_id": me, "split": "exact",
        "shares": [{"member_id": me, "share_paise": 200}, {"member_id": m["Ravi"], "share_paise": 100}]})).json()
    eid = g["expenses"][0]["id"]
    g = (await client.patch(f"{API}/groups/{g['id']}/expenses/{eid}", headers=auth(h),
                            json={"amount_paise": 600})).json()
    assert shares_of(g) == {me: 400, m["Ravi"]: 200}
    g = (await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "Tea", "amount_paise": 101, "paid_by_member_id": me})).json()
    tea = next(e for e in g["expenses"] if e["description"] == "Tea")
    assert tea["split_method"] == "equal" and sorted(s["share_paise"] for s in tea["shares"]) == [50, 51]


async def test_weights_must_name_active_members_once(client):
    h = await register(client)
    g = await make_group(client, h)
    me = g["my_member_id"]
    dup = [{"member_id": me, "weight": 1}, {"member_id": me, "weight": 1}]
    r = await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "x", "amount_paise": 100, "paid_by_member_id": me, "split": "shares", "weights": dup})
    assert r.status_code == 422
    other = await register(client, "o@example.com", full_name="Other")
    og = await make_group(client, other, names=("Z",))
    r = await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "x", "amount_paise": 100, "paid_by_member_id": me, "split": "shares",
        "weights": [{"member_id": og["my_member_id"], "weight": 1}]})
    assert r.status_code == 422
    r = await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "x", "amount_paise": 100, "paid_by_member_id": me, "split": "shares",
        "weights": [{"member_id": me, "weight": 0}]})
    assert r.status_code == 422


# ---------------------------------------------------------------- types, labels, members

async def test_group_type_and_custom_label(client):
    h = await register(client)
    g = await make_group(client, h, group_type="custom", group_label="  Cricket club ")
    assert (g["group_type"], g["group_label"]) == ("custom", "Cricket club")
    g = (await client.patch(f"{API}/groups/{g['id']}", headers=auth(h), json={"group_type": "trip"})).json()
    assert (g["group_type"], g["group_label"]) == ("trip", None)  # a preset type has no custom label
    g = (await client.patch(f"{API}/groups/{g['id']}", headers=auth(h),
                            json={"name": None, "cover_emoji": "🏏", "description": "Weekend games"})).json()
    assert g["name"] == "Flat 12" and g["cover_emoji"] == "🏏" and g["description"] == "Weekend games"
    bad = await client.post(f"{API}/groups", headers=auth(h), json={"name": "x", "group_type": "casino"})
    assert bad.status_code == 422
    listed = (await client.get(f"{API}/groups", headers=auth(h))).json()
    assert listed[0]["group_type"] == "trip"


async def test_many_members_and_member_states(client):
    h = await register(client)
    names = [f"Member {i}" for i in range(1, 20)]  # 19 + me = 20
    g = await make_group(client, h, names=names)
    assert len(g["members"]) == 20
    m = by_name(g)
    assert all(not x["linked"] and not x["invited"] for x in g["members"] if not x["is_me"])
    await client.post(f"{API}/groups/{g['id']}/members/{m['Member 1']}/invite", headers=auth(h))
    g = (await client.get(f"{API}/groups/{g['id']}", headers=auth(h))).json()
    st = {x["display_name"]: (x["linked"], x["invited"]) for x in g["members"]}
    assert st["Member 1"] == (False, True) and st["Member 2"] == (False, False)


async def test_renaming_a_member_keeps_identity_and_history(client):
    asha = await register(client, "asha@example.com", full_name="Asha")
    ravi = await register(client, "ravi@example.com", full_name="Ravi")
    g = await make_group(client, asha, names=("Ravi",))
    m = by_name(g)
    tok = (await client.post(f"{API}/groups/{g['id']}/members/{m['Ravi']}/invite", headers=auth(asha))).json()["token"]
    assert (await client.post(f"{API}/groups/claim", headers=auth(ravi), json={"token": tok})).status_code == 200
    g = (await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(asha), json={
        "description": "Hotel", "amount_paise": 1000, "paid_by_member_id": g["my_member_id"]})).json()
    g = (await client.patch(f"{API}/groups/{g['id']}/members/{m['Ravi']}", headers=auth(asha),
                            json={"display_name": "Ravi K."})).json()
    renamed = next(x for x in g["members"] if x["id"] == m["Ravi"])
    assert renamed["display_name"] == "Ravi K." and renamed["linked"] is True
    assert shares_of(g)[m["Ravi"]] == 500 and renamed["net_paise"] == -500  # history follows the seat
    me = (await client.get(f"{API}/users/me", headers=auth(ravi))).json()
    assert me["full_name"] == "Ravi"  # the account itself is untouched
    rg = (await client.get(f"{API}/groups/{g['id']}", headers=auth(ravi))).json()
    assert rg["my_member_id"] == m["Ravi"]


async def test_removing_a_member_needs_settlement_and_keeps_history(client):
    h = await register(client)
    g = await make_group(client, h, names=("Ravi", "Meera"))
    m = by_name(g)
    me = g["my_member_id"]
    g = (await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "Snacks", "amount_paise": 900, "paid_by_member_id": me})).json()
    assert (await client.delete(f"{API}/groups/{g['id']}/members/{m['Ravi']}", headers=auth(h))).status_code == 409
    await client.post(f"{API}/groups/{g['id']}/settlements", headers=auth(h), json={
        "from_member_id": m["Ravi"], "to_member_id": me, "amount_paise": 300, "method": "cash"})
    assert (await client.delete(f"{API}/groups/{g['id']}/members/{m['Ravi']}", headers=auth(h))).status_code == 200
    g = (await client.get(f"{API}/groups/{g['id']}", headers=auth(h))).json()
    ravi = next(x for x in g["members"] if x["id"] == m["Ravi"])
    assert ravi["status"] == "removed"
    assert shares_of(g)[m["Ravi"]] == 300 and len(g["settlements"]) == 1  # history kept
    assert sum(x["net_paise"] for x in g["members"]) == 0


# ---------------------------------------------------------------- founder's worked examples, group sizes, races

async def _expense(client, h, g, **body):
    r = await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={"description": "x", **body})
    assert r.status_code == 201, r.text
    return r.json()


async def test_worked_examples_allocate_exactly(client):
    h = await register(client)
    g = await make_group(client, h, names=("Ravi", "Meera"))
    m = by_name(g)
    me = g["my_member_id"]
    # Rs 100 among 3 people.
    g = await _expense(client, h, g, amount_paise=10_000, paid_by_member_id=me)
    assert sorted(s["share_paise"] for s in g["expenses"][0]["shares"]) == [3333, 3333, 3334]
    # Rs 1,000 split 50/30/20.
    g = await _expense(client, h, g, amount_paise=100_000, paid_by_member_id=me, split="percentage",
                       weights=[{"member_id": me, "weight": 5000}, {"member_id": m["Ravi"], "weight": 3000},
                                {"member_id": m["Meera"], "weight": 2000}])
    assert {s["member_id"]: s["share_paise"] for s in g["expenses"][0]["shares"]} == {
        me: 50_000, m["Ravi"]: 30_000, m["Meera"]: 20_000}
    # Rs 1,500 with Meera excluded.
    g = await _expense(client, h, g, amount_paise=150_000, paid_by_member_id=m["Ravi"],
                       participant_ids=[me, m["Ravi"]])
    assert {s["member_id"]: s["share_paise"] for s in g["expenses"][0]["shares"]} == {me: 75_000, m["Ravi"]: 75_000}
    # Rs 2,501 with custom shares 2:2:1 (odd paise: 1000.40 + 1000.40 + 500.20 = 2501.00).
    g = await _expense(client, h, g, amount_paise=250_100, paid_by_member_id=me, split="shares",
                       weights=[{"member_id": me, "weight": 2}, {"member_id": m["Ravi"], "weight": 2},
                                {"member_id": m["Meera"], "weight": 1}])
    sh = {s["member_id"]: s["share_paise"] for s in g["expenses"][0]["shares"]}
    assert sh == {me: 100_040, m["Ravi"]: 100_040, m["Meera"]: 50_020} and sum(sh.values()) == 250_100
    for e in g["expenses"]:
        assert sum(s["share_paise"] for s in e["shares"]) == e["amount_paise"]
    assert sum(x["net_paise"] for x in g["members"]) == 0


@pytest.mark.parametrize("others", [1, 3, 5, 9, 49])  # 2, 4, 6, 10 and 50 (the maximum) people
async def test_group_sizes_split_exactly(client, others):
    h = await register(client)
    g = await make_group(client, h, names=[f"P{i}" for i in range(others)])
    assert len(g["members"]) == others + 1
    g = await _expense(client, h, g, amount_paise=100_001, paid_by_member_id=g["my_member_id"])
    shares = [s["share_paise"] for s in g["expenses"][0]["shares"]]
    assert sum(shares) == 100_001 and max(shares) - min(shares) <= 1
    assert sum(x["net_paise"] for x in g["members"]) == 0
    if others == 49:
        r = await client.post(f"{API}/groups/{g['id']}/members", headers=auth(h), json={"display_name": "One too many"})
        assert r.status_code == 409


async def test_simultaneous_full_paybacks_record_only_once(client):
    import asyncio
    h = await register(client)
    g = await make_group(client, h, names=("Ravi",))
    m = by_name(g)
    me = g["my_member_id"]
    g = await _expense(client, h, g, amount_paise=1000, paid_by_member_id=me)  # Ravi owes 500
    body = {"from_member_id": m["Ravi"], "to_member_id": me, "amount_paise": 500, "method": "cash"}
    url = f"{API}/groups/{g['id']}/settlements"
    r1, r2 = await asyncio.gather(
        client.post(url, headers=auth(h), json={**body, "idempotency_key": "pay-a-123"}),
        client.post(url, headers=auth(h), json={**body, "idempotency_key": "pay-b-456"}))
    assert sorted([r1.status_code, r2.status_code]) == [201, 409]  # the second would over-settle
    g = (await client.get(f"{API}/groups/{g['id']}", headers=auth(h))).json()
    assert [s["amount_paise"] for s in g["settlements"] if s["status"] == "recorded"] == [500]
    assert all(x["net_paise"] == 0 for x in g["members"])
    # A retried request with the same key is recorded once, not twice.
    again = await client.post(f"{API}/groups/{g['id']}/settlements", headers=auth(h),
                              json={**body, "amount_paise": 500, "idempotency_key": "pay-a-123"})
    assert again.status_code in (200, 201)
    g = (await client.get(f"{API}/groups/{g['id']}", headers=auth(h))).json()
    assert len([s for s in g["settlements"] if s["status"] == "recorded"]) == 1
