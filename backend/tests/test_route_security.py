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
