from datetime import date, timedelta

from app.api.v1.routes.splits import allocate_equal, suggest
from app.services.schedule import is_scheduled, next_on_or_after, occurrences
from tests.conftest import PASSWORD, auth, cash_account, register

API = "/api/v1"


async def group(client, h, members=("Ravi", "Meera")):
    r = await client.post(f"{API}/groups", headers=auth(h), json={
        "name": "Goa trip", "members": [{"display_name": n} for n in members]})
    assert r.status_code == 201, r.text
    return r.json()


def ids(g):
    return {m["display_name"]: m["id"] for m in g["members"]}


def test_equal_allocation_and_suggestions():
    assert allocate_equal(10000, 3) == [3334, 3333, 3333]
    assert allocate_equal(10001, 5) == [2001, 2000, 2000, 2000, 2000]
    assert sum(allocate_equal(999_999_99, 7)) == 999_999_99
    s = suggest({"a": 6666, "b": -3333, "c": -3333})
    assert sum(x["amount_paise"] for x in s) == 6666 and all(x["to_member_id"] == "a" for x in s)


async def test_group_expense_split_balances_and_settlement(client):
    h = await register(client, "asha@example.com", full_name="Asha")
    g = await group(client, h)
    m = ids(g)
    me = g["my_member_id"]
    # ₹100 split three ways: 33.34 + 33.33 + 33.33, sums exactly.
    g = (await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "Dinner", "amount_paise": 10000, "paid_by_member_id": me})).json()
    shares = sorted(s["share_paise"] for s in g["expenses"][0]["shares"])
    assert shares == [3333, 3333, 3334] and sum(shares) == 10000
    net = {x["display_name"]: x["net_paise"] for x in g["members"]}
    assert sum(net.values()) == 0 and net["Ravi"] == -3333
    # Exact split must add up.
    bad = await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "Cab", "amount_paise": 1000, "paid_by_member_id": me, "split": "exact",
        "shares": [{"member_id": m["Ravi"], "share_paise": 600}, {"member_id": me, "share_paise": 300}]})
    assert bad.status_code == 422
    # Settlement capped at what is owed; idempotent retry; void restores balance.
    over = await client.post(f"{API}/groups/{g['id']}/settlements", headers=auth(h), json={
        "from_member_id": m["Ravi"], "to_member_id": me, "amount_paise": 5000})
    assert over.status_code == 409
    body = {"from_member_id": m["Ravi"], "to_member_id": me, "amount_paise": 3333, "idempotency_key": "settle-ravi-1"}
    g1 = (await client.post(f"{API}/groups/{g['id']}/settlements", headers=auth(h), json=body)).json()
    g2 = (await client.post(f"{API}/groups/{g['id']}/settlements", headers=auth(h), json=body)).json()
    assert len([s for s in g2["settlements"] if s["status"] == "recorded"]) == 1
    assert {x["display_name"]: x["net_paise"] for x in g1["members"]}["Ravi"] == 0
    sid = g2["settlements"][0]["id"]
    g3 = (await client.delete(f"{API}/groups/{g['id']}/settlements/{sid}", headers=auth(h))).json()
    assert {x["display_name"]: x["net_paise"] for x in g3["members"]}["Ravi"] == -3333
    # Edit re-splits exactly; void removes from balances but keeps history.
    eid = g3["expenses"][0]["id"]
    g4 = (await client.patch(f"{API}/groups/{g['id']}/expenses/{eid}", headers=auth(h),
                             json={"amount_paise": 10001})).json()
    assert sum(s["share_paise"] for s in g4["expenses"][0]["shares"]) == 10001
    g5 = (await client.delete(f"{API}/groups/{g['id']}/expenses/{eid}", headers=auth(h))).json()
    assert g5["expenses"][0]["status"] == "void" and all(x["net_paise"] == 0 for x in g5["members"])
    # Group spending never leaks into the personal ledger.
    assert (await client.get(f"{API}/transactions", headers=auth(h))).json()["items"] == []


async def test_group_access_roles_and_seat_claim(client):
    asha = await register(client, "asha@example.com", full_name="Asha")
    ravi = await register(client, "ravi@example.com", full_name="Ravi")
    g = await group(client, asha)
    m = ids(g)
    # Outsider sees nothing and can't write.
    assert (await client.get(f"{API}/groups/{g['id']}", headers=auth(ravi))).status_code == 404
    assert (await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(ravi), json={
        "description": "x", "amount_paise": 100, "paid_by_member_id": m["Ravi"]})).status_code == 404
    assert (await client.get(f"{API}/groups", headers=auth(ravi))).json() == []
    # Admin issues a one-time code; Ravi claims his seat.
    tok = (await client.post(f"{API}/groups/{g['id']}/members/{m['Ravi']}/invite", headers=auth(asha))).json()["token"]
    assert (await client.post(f"{API}/groups/claim", headers=auth(ravi), json={"token": tok})).status_code == 200
    assert (await client.post(f"{API}/groups/claim", headers=auth(ravi), json={"token": tok})).status_code == 400
    rg = (await client.get(f"{API}/groups/{g['id']}", headers=auth(ravi))).json()
    assert rg["my_role"] == "member" and rg["my_member_id"] == m["Ravi"]
    # Members add expenses but can't manage the group or void others' entries.
    rg = (await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(ravi), json={
        "description": "Snacks", "amount_paise": 300, "paid_by_member_id": m["Ravi"]})).json()
    assert (await client.patch(f"{API}/groups/{g['id']}", headers=auth(ravi), json={"name": "x"})).status_code == 403
    r = await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(asha), json={
        "description": "Hotel", "amount_paise": 900, "paid_by_member_id": rg["my_member_id"]})
    eid = r.json()["expenses"][0]["id"]
    assert (await client.delete(f"{API}/groups/{g['id']}/expenses/{eid}", headers=auth(ravi))).status_code == 403
    # Bad UPI IDs are refused (prevents pay-link injection).
    assert (await client.patch(f"{API}/groups/{g['id']}/members/{m['Ravi']}", headers=auth(ravi),
                               json={"upi_id": "x@bank&am=99999"})).status_code == 422
    assert (await client.patch(f"{API}/groups/{g['id']}/members/{m['Ravi']}", headers=auth(ravi),
                               json={"upi_id": "ravi@okaxis"})).status_code == 200
    # Can't remove a member with an unsettled balance; last admin can't leave.
    assert (await client.delete(f"{API}/groups/{g['id']}/members/{m['Ravi']}", headers=auth(asha))).status_code == 409


async def test_account_deletion_keeps_group_for_others(client):
    asha = await register(client, "asha@example.com", full_name="Asha")
    ravi = await register(client, "ravi@example.com", full_name="Ravi")
    g = await group(client, asha)
    tok = (await client.post(f"{API}/groups/{g['id']}/members/{ids(g)['Ravi']}/invite",
                             headers=auth(asha))).json()["token"]
    await client.post(f"{API}/groups/claim", headers=auth(ravi), json={"token": tok})
    await client.post(f"{API}/groups/{g['id']}/expenses", headers=auth(asha), json={
        "description": "Dinner", "amount_paise": 600, "paid_by_member_id": g["my_member_id"]})
    r = await client.request("DELETE", f"{API}/users/me", headers=auth(asha),
                             json={"password": PASSWORD, "confirm": "DELETE MY ACCOUNT"})
    assert r.status_code == 204
    rg = (await client.get(f"{API}/groups/{g['id']}", headers=auth(ravi))).json()
    assert rg["my_role"] == "admin" and len(rg["expenses"]) == 1  # history and balances intact


def test_schedule_maths():
    assert occurrences(date(2026, 1, 31), "monthly", date(2026, 4, 30)) == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)]
    assert occurrences(date(2024, 2, 29), "yearly", date(2028, 3, 1)) == [
        date(2024, 2, 29), date(2025, 2, 28), date(2026, 2, 28), date(2027, 2, 28), date(2028, 2, 29)]
    assert occurrences(date(2026, 11, 1), "weekly", date(2026, 11, 20)) == [
        date(2026, 11, 1), date(2026, 11, 8), date(2026, 11, 15)]
    assert occurrences(date(2026, 1, 15), "quarterly", date(2026, 12, 31), end=date(2026, 8, 1)) == [
        date(2026, 1, 15), date(2026, 4, 15), date(2026, 7, 15)]
    assert is_scheduled(date(2026, 1, 31), "monthly", date(2026, 2, 28))
    assert not is_scheduled(date(2026, 1, 31), "monthly", date(2026, 2, 27))
    assert next_on_or_after(date(2026, 1, 10), "monthly", date(2026, 3, 11)) == date(2026, 4, 10)


async def test_recurring_bill_lifecycle_and_no_duplicate_posting(client):
    h = await register(client)
    acc = await cash_account(client, h)
    start = date.today() - timedelta(days=65)
    r = await client.post(f"{API}/recurring", headers=auth(h), json={
        "name": "Internet", "amount_paise": 79900, "frequency": "monthly", "start_date": start.isoformat(),
        "account_id": acc, "category": "cat-internet"})
    assert r.status_code == 201
    bill = r.json()
    overdue = bill["overdue_dates"]
    assert len(overdue) >= 2  # missed months still show up as due
    first = overdue[0]
    p1 = await client.post(f"{API}/recurring/{bill['id']}/occurrences/{first}/pay", headers=auth(h))
    p2 = await client.post(f"{API}/recurring/{bill['id']}/occurrences/{first}/pay", headers=auth(h))
    assert p1.status_code == p2.status_code == 200
    tx = (await client.get(f"{API}/transactions", headers=auth(h))).json()["items"]
    assert len(tx) == 1 and tx[0]["amount_paise"] == 79900  # retry never double-posts
    assert first not in p2.json()["overdue_dates"]
    # Skip, off-schedule dates, pause/resume, cancel.
    assert (await client.post(f"{API}/recurring/{bill['id']}/occurrences/{overdue[1]}/skip",
                              headers=auth(h))).status_code == 200
    off = (date.fromisoformat(first) + timedelta(days=1)).isoformat()
    assert (await client.post(f"{API}/recurring/{bill['id']}/occurrences/{off}/pay",
                              headers=auth(h))).status_code == 422
    paused = (await client.patch(f"{API}/recurring/{bill['id']}", headers=auth(h), json={"status": "paused"})).json()
    assert paused["overdue_dates"] == [] and paused["next_due_date"] is None
    assert (await client.post(f"{API}/recurring/{bill['id']}/occurrences/{first}/pay",
                              headers=auth(h))).status_code == 409
    await client.patch(f"{API}/recurring/{bill['id']}", headers=auth(h), json={"status": "active"})
    due = (await client.get(f"{API}/recurring/due?within_days=40", headers=auth(h))).json()
    assert all(d["bill_id"] == bill["id"] for d in due) and any(not d["overdue"] for d in due)
    await client.patch(f"{API}/recurring/{bill['id']}", headers=auth(h), json={"status": "cancelled"})
    assert (await client.get(f"{API}/recurring", headers=auth(h))).json() == []
    assert (await client.patch(f"{API}/recurring/{bill['id']}", headers=auth(h),
                               json={"name": "x"})).status_code == 409


async def test_recurring_isolation(client):
    a = await register(client, "a@example.com")
    b = await register(client, "b@example.com")
    bill = (await client.post(f"{API}/recurring", headers=auth(a), json={
        "name": "Rent", "amount_paise": 1_500_000, "start_date": date.today().isoformat()})).json()
    assert (await client.get(f"{API}/recurring", headers=auth(b))).json() == []
    assert (await client.patch(f"{API}/recurring/{bill['id']}", headers=auth(b), json={"name": "x"})).status_code == 404
    assert (await client.post(f"{API}/recurring/{bill['id']}/occurrences/{date.today().isoformat()}/pay",
                              headers=auth(b))).status_code == 404
