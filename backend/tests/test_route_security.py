"""Every API route requires authentication unless deliberately public; no route leaks another
account's data by id; sensitive fields never appear in responses."""
import re
import uuid

from app.main import app
from tests.conftest import PASSWORD, add_tx, auth, cash_account, register

PUBLIC = {
    ("POST", "/api/v1/auth/register"), ("POST", "/api/v1/auth/login"), ("POST", "/api/v1/auth/refresh"),
    ("GET", "/health"),
}


def _routes():
    # The OpenAPI schema lists every mounted route (included routers are resolved lazily).
    for path, ops in app.openapi()["paths"].items():
        for m in ops:
            if m.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                yield m.upper(), path


async def test_every_non_public_route_requires_auth(client):
    checked = 0
    for method, path in _routes():
        if (method, path) in PUBLIC or path.startswith(("/docs", "/openapi", "/redoc")):
            continue
        url = re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)
        url = url.replace("/occurrences/" + url.split("/occurrences/")[-1].split("/")[0],
                          "/occurrences/2026-01-01") if "/occurrences/" in url else url
        r = await client.request(method, url, json={})
        assert r.status_code == 401, f"{method} {path} returned {r.status_code} without a token"
        bad = await client.request(method, url, json={}, headers={"Authorization": "Bearer not-a-jwt"})
        assert bad.status_code == 401, f"{method} {path} accepted a bad token ({bad.status_code})"
        checked += 1
    assert checked >= 60  # the sweep really covered the API


async def test_ids_from_another_account_never_resolve(client):
    a = await register(client, "a@example.com")
    b = await register(client, "b@example.com")
    acc = await cash_account(client, a)
    tx = await add_tx(client, a, acc, 1234, description="A private")
    bud = (await client.post("/api/v1/budgets", headers=auth(a), json={
        "name": "A food", "amount_paise": 5000, "period": "monthly"})).json()
    goal = (await client.post("/api/v1/goals", headers=auth(a), json={"name": "A goal", "target_paise": 9000})).json()
    bill = (await client.post("/api/v1/recurring", headers=auth(a), json={
        "name": "A rent", "amount_paise": 100, "start_date": "2026-11-01"})).json()
    grp = (await client.post("/api/v1/groups", headers=auth(a), json={"name": "A group", "members": []})).json()
    probes = [
        ("GET", f"/api/v1/transactions/{tx['id']}"), ("PATCH", f"/api/v1/transactions/{tx['id']}"),
        ("DELETE", f"/api/v1/transactions/{tx['id']}"), ("GET", f"/api/v1/transactions/{tx['id']}/history"),
        ("POST", f"/api/v1/transactions/{tx['id']}/refunds"), ("POST", f"/api/v1/transactions/{tx['id']}/reverse"),
        ("PATCH", f"/api/v1/accounts/{acc}"), ("PATCH", f"/api/v1/budgets/{bud.get('id')}"),
("PATCH", f"/api/v1/goals/{goal.get('id')}"),
        ("POST", f"/api/v1/goals/{goal.get('id')}/contributions"), ("PATCH", f"/api/v1/recurring/{bill['id']}"),
        ("POST", f"/api/v1/recurring/{bill['id']}/occurrences/2026-11-01/pay"),
        ("GET", f"/api/v1/groups/{grp['id']}"), ("POST", f"/api/v1/groups/{grp['id']}/expenses"),
        ("POST", f"/api/v1/families/share/{tx['id']}"),
    ]
    bodies = {"PATCH": {"description": "x", "name": "x", "amount_paise": 1},
              "POST": {"amount_paise": 1, "reason": "x", "description": "x", "family_id": None}}
    for method, url in probes:
        r = await client.request(method, url, headers=auth(b), json=bodies.get(method))
        assert r.status_code in (404, 422), f"{method} {url} → {r.status_code} for another account"
        assert "A private" not in r.text and "A rent" not in r.text
    # B's own listings contain nothing of A's.
    for path in ("/api/v1/transactions", "/api/v1/accounts", "/api/v1/budgets", "/api/v1/goals",
                 "/api/v1/recurring", "/api/v1/groups", "/api/v1/families"):
        body = (await client.get(path, headers=auth(b))).text
        assert "A private" not in body and "A food" not in body and "A group" not in body, path
    # A's data is untouched.
    assert (await client.get(f"/api/v1/transactions/{tx['id']}", headers=auth(a))).json()["amount_paise"] == 1234


async def test_responses_never_contain_secrets(client):
    h = await register(client, "c@example.com")
    for path in ("/api/v1/users/me", "/api/v1/users/me/export"):
        r = await client.get(path, headers=auth(h))
        assert r.status_code == 200
        text = r.text.lower()
        for secret_field in ("password_hash", "refresh_token_hash", "invite_token_hash", "token_hash", "argon2"):
            assert secret_field not in text, (path, secret_field)
        assert PASSWORD not in r.text


async def test_export_covers_recurring_groups_family_and_reminders(client):
    h = await register(client, "exp@example.com", full_name="Exp User")
    acc = await cash_account(client, h)
    await client.post("/api/v1/recurring", headers=auth(h), json={
        "name": "Wifi", "amount_paise": 59900, "start_date": "2026-11-01"})
    g = (await client.post("/api/v1/groups", headers=auth(h), json={
        "name": "Trip", "members": [{"display_name": "Friend"}]})).json()
    await client.post(f"/api/v1/groups/{g['id']}/expenses", headers=auth(h), json={
        "description": "Cab", "amount_paise": 1000, "paid_by_member_id": g["my_member_id"], "personal_account_id": acc})
    fam = (await client.post("/api/v1/families", headers=auth(h), json={"name": "Home"})).json()
    goal = (await client.post(f"/api/v1/families/{fam['id']}/goals", headers=auth(h),
                              json={"name": "TV", "target_paise": 100000})).json()
    await client.post(f"/api/v1/families/{fam['id']}/goals/{goal['id']}/contributions", headers=auth(h),
                      json={"amount_paise": 2500})
    await client.patch("/api/v1/notifications/preferences", headers=auth(h), json={"bill_reminders": False})
    ex = (await client.get("/api/v1/users/me/export", headers=auth(h))).json()
    assert [b["name"] for b in ex["recurring_bills"]] == ["Wifi"]
    grp = ex["groups"][0]
    assert grp["group"]["name"] == "Trip" and grp["expenses_i_paid_or_share"][0]["my_share_paise"] == 500
    assert len(ex["group_ledger_links"]) == 1
    assert ex["families"][0]["my_goal_contributions"][0]["amount_paise"] == 2500
    assert ex["notification_preferences"]["bill_reminders"] is False
    assert "password_hash" not in str(ex)


async def test_account_deletion_with_group_ledger_family_and_reminders(client):
    from tests.conftest import PASSWORD
    a = await register(client, "del-a@example.com", full_name="Del A")
    b = await register(client, "del-b@example.com", full_name="Del B")
    acc = await cash_account(client, a)
    g = (await client.post("/api/v1/groups", headers=auth(a), json={
        "name": "Trip", "members": [{"display_name": "B"}]})).json()
    bid = next(m["id"] for m in g["members"] if m["display_name"] == "B")
    tok = (await client.post(f"/api/v1/groups/{g['id']}/members/{bid}/invite", headers=auth(a))).json()["token"]
    await client.post("/api/v1/groups/claim", headers=auth(b), json={"token": tok})
    await client.post(f"/api/v1/groups/{g['id']}/expenses", headers=auth(a), json={
        "description": "Cab", "amount_paise": 1000, "paid_by_member_id": g["my_member_id"], "personal_account_id": acc})
    fam = (await client.post("/api/v1/families", headers=auth(a), json={"name": "Home"})).json()
    goal = (await client.post(f"/api/v1/families/{fam['id']}/goals", headers=auth(a),
                              json={"name": "TV", "target_paise": 100000})).json()
    await client.post(f"/api/v1/families/{fam['id']}/goals/{goal['id']}/contributions", headers=auth(a),
                      json={"amount_paise": 2500})
    await client.patch("/api/v1/notifications/preferences", headers=auth(a), json={"email_enabled": True})
    r = await client.request("DELETE", "/api/v1/users/me", headers=auth(a),
                             json={"password": PASSWORD, "confirm": "DELETE MY ACCOUNT"})
    assert r.status_code == 204, r.text
    # The other member keeps the group and its history.
    d = (await client.get(f"/api/v1/groups/{g['id']}", headers=auth(b))).json()
    assert d["expenses"][0]["amount_paise"] == 1000 and d["my_role"] == "admin"
    assert (await client.get("/api/v1/users/me", headers=auth(a))).status_code == 401
