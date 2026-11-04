from datetime import date

from tests.conftest import PASSWORD, add_tx, auth, cash_account, new_account, register

API = "/api/v1"


async def test_users_cannot_see_or_touch_each_others_data(client):
    a = await register(client, "a@example.com")
    b = await register(client, "b@example.com")
    a_acc = await new_account(client, a, opening=100_000)
    a_tx = await add_tx(client, a, a_acc, 5_000)
    b_acc = await cash_account(client, b)

    # Reads
    assert (await client.get(f"{API}/accounts/{a_acc}", headers=auth(b))).status_code == 404
    assert (await client.get(f"{API}/transactions/{a_tx['id']}", headers=auth(b))).status_code == 404
    assert (await client.get(f"{API}/transactions/{a_tx['id']}/history", headers=auth(b))).status_code == 404
    assert (await client.get(f"{API}/transactions", headers=auth(b))).json()["items"] == []
    assert a_acc not in [x["id"] for x in (await client.get(f"{API}/accounts", headers=auth(b))).json()]
    # Writes
    assert (await client.post(f"{API}/transactions", headers=auth(b), json={
        "account_id": a_acc, "amount_paise": 1, "kind": "expense", "description": "x"})).status_code == 404
    assert (await client.patch(f"{API}/transactions/{a_tx['id']}", headers=auth(b),
                               json={"amount_paise": 1})).status_code == 404
    assert (await client.delete(f"{API}/transactions/{a_tx['id']}", headers=auth(b))).status_code == 404
    assert (await client.post(f"{API}/transactions/{a_tx['id']}/refunds", headers=auth(b),
                              json={"amount_paise": 1})).status_code == 404
    assert (await client.post(f"{API}/transactions/{a_tx['id']}/reverse", headers=auth(b),
                              json={"reason": "x"})).status_code == 404
    assert (await client.post(f"{API}/transactions/transfers", headers=auth(b), json={
        "from_account_id": a_acc, "to_account_id": b_acc, "amount_paise": 1})).status_code == 404
    assert (await client.patch(f"{API}/accounts/{a_acc}", headers=auth(b), json={"name": "pwned"})).status_code == 404
    # A's data unchanged
    assert (await client.get(f"{API}/accounts/{a_acc}", headers=auth(a))).json()["balance_paise"] == 95_000
    rb = (await client.get(f"{API}/reports/summary", headers=auth(b))).json()
    assert rb["expense_paise"] == 0


async def test_budget_and_goal_isolation(client):
    a = await register(client, "a@example.com")
    b = await register(client, "b@example.com")
    bud = (await client.post(f"{API}/budgets", headers=auth(a), json={"name": "Food", "amount_paise": 100})).json()
    goal = (await client.post(f"{API}/goals", headers=auth(a), json={"name": "Trip", "target_paise": 100})).json()
    assert (await client.patch(f"{API}/budgets/{bud['id']}", headers=auth(b), json={"name": "x"})).status_code == 404
    assert (await client.post(f"{API}/goals/{goal['id']}/contributions", headers=auth(b),
                              json={"amount_paise": 1})).status_code == 404
    assert (await client.get(f"{API}/budgets", headers=auth(b))).json() == []
    assert (await client.get(f"{API}/goals", headers=auth(b))).json() == []


async def test_budget_spent_is_derived_per_category(client):
    h = await register(client)
    acc = await cash_account(client, h)
    food = (await client.post(f"{API}/budgets", headers=auth(h), json={
        "name": "Food", "category": "Food", "amount_paise": 10_000, "alert_threshold_pct": 80})).json()
    overall = (await client.post(f"{API}/budgets", headers=auth(h), json={
        "name": "All", "amount_paise": 50_000})).json()
    assert food["spent_paise"] == 0
    e = await add_tx(client, h, acc, 8_500, category="Food")
    await add_tx(client, h, acc, 3_000, category="Transport")
    await add_tx(client, h, acc, 2_000, kind="income", category="Food")  # income never counts as spend
    bl = {b["name"]: b for b in (await client.get(f"{API}/budgets", headers=auth(h))).json()}
    assert bl["Food"]["spent_paise"] == 8_500 and bl["Food"]["alert"] == "near_limit"
    assert bl["All"]["spent_paise"] == 11_500
    await client.post(f"{API}/transactions/{e['id']}/refunds", headers=auth(h), json={"amount_paise": 500})
    t = await add_tx(client, h, acc, 5_000, category="Food")
    bl = {b["name"]: b for b in (await client.get(f"{API}/budgets", headers=auth(h))).json()}
    assert bl["Food"]["spent_paise"] == 13_000 and bl["Food"]["alert"] == "over_limit"
    assert bl["Food"]["remaining_paise"] == -3_000
    await client.delete(f"{API}/transactions/{t['id']}", headers=auth(h))
    bl = {b["name"]: b for b in (await client.get(f"{API}/budgets", headers=auth(h))).json()}
    assert bl["Food"]["spent_paise"] == 8_000
    assert overall["period"] == "monthly"


async def test_goal_contributions_and_withdrawals(client):
    h = await register(client)
    g = (await client.post(f"{API}/goals", headers=auth(h), json={"name": "Laptop", "target_paise": 60_000_00})).json()
    r = await client.post(f"{API}/goals/{g['id']}/contributions", headers=auth(h), json={"amount_paise": 15_000_00})
    assert r.json()["saved_paise"] == 15_000_00 and r.json()["progress_pct"] == 25
    r = await client.post(f"{API}/goals/{g['id']}/contributions", headers=auth(h),
                          json={"amount_paise": 20_000_00, "direction": "withdrawal"})
    assert r.status_code == 409
    r = await client.post(f"{API}/goals/{g['id']}/contributions", headers=auth(h),
                          json={"amount_paise": 5_000_00, "direction": "withdrawal"})
    assert r.json()["saved_paise"] == 10_000_00
    hist = (await client.get(f"{API}/goals/{g['id']}/contributions", headers=auth(h))).json()
    assert [c["direction"] for c in hist] == ["deposit", "withdrawal"]


def test_period_bounds():
    from app.services.reports import period_bounds
    assert period_bounds("weekly", date(2026, 11, 4)) == (date(2026, 11, 2), date(2026, 11, 8))
    assert period_bounds("monthly", date(2026, 2, 10)) == (date(2026, 2, 1), date(2026, 2, 28))
    assert period_bounds("monthly", date(2028, 2, 10)) == (date(2028, 2, 1), date(2028, 2, 29))
    assert period_bounds("monthly", date(2026, 12, 31)) == (date(2026, 12, 1), date(2026, 12, 31))
    assert period_bounds("yearly", date(2026, 6, 1)) == (date(2026, 1, 1), date(2026, 12, 31))


async def test_budget_rollover(client):
    from sqlalchemy import select

    from app.core.database import get_db
    from app.models import Budget
    from app.services.planning import budget_view

    h = await register(client)
    acc = await cash_account(client, h)
    await client.post(f"{API}/budgets", headers=auth(h), json={
        "name": "Food", "category": "Food", "amount_paise": 10_000, "rollover": True, "start_date": "2026-10-01"})
    await add_tx(client, h, acc, 4_000, category="Food", occurred_at="2026-10-15T12:00:00+05:30")
    await add_tx(client, h, acc, 1_000, category="Food", occurred_at="2026-11-02T12:00:00+05:30")
    async for db in get_db():
        b = await db.scalar(select(Budget))
        v = await budget_view(db, b, "Asia/Kolkata", today=date(2026, 11, 4))
    assert v["rollover_paise"] == 6_000 and v["available_paise"] == 16_000 and v["spent_paise"] == 1_000


async def test_export_and_account_deletion(client):
    h = await register(client)
    acc = await cash_account(client, h)
    await add_tx(client, h, acc, 1_234)
    exp = (await client.get(f"{API}/users/me/export", headers=auth(h))).json()
    assert exp["transactions"][0]["amount_paise"] == 1_234
    assert "password_hash" not in str(exp) and "refresh_token" not in str(exp)
    r = await client.request("DELETE", f"{API}/users/me", headers=auth(h),
                             json={"password": "wrong-password-x", "confirm": "DELETE MY ACCOUNT"})
    assert r.status_code == 400
    r = await client.request("DELETE", f"{API}/users/me", headers=auth(h),
                             json={"password": PASSWORD, "confirm": "DELETE MY ACCOUNT"})
    assert r.status_code == 204
    assert (await client.get(f"{API}/users/me", headers=auth(h))).status_code == 401
    r = await client.post(f"{API}/auth/login", json={"email": "asha@example.com", "password": PASSWORD})
    assert r.status_code == 401
