"""Browser sessions: refresh token only in an HttpOnly cookie, CSRF-protected refresh/logout."""
import asyncio
from http.cookies import SimpleCookie

from tests.conftest import PASSWORD
from tests.test_auth import age_rotations

API = "/api/v1/auth"
WEB = {"X-Bagla-Client": "web"}
CSRF = {**WEB, "X-Bagla-CSRF": "1", "Origin": "http://127.0.0.1:3000"}


def rt_cookie(response) -> dict:
    raw = [v for k, v in response.headers.multi_items() if k.lower() == "set-cookie"]
    c = SimpleCookie()
    for r in raw:
        c.load(r)
    m = c.get("bagla_rt")
    return {"value": m.value, **{k: m[k] for k in ("httponly", "secure", "samesite", "path", "max-age")}} if m else {}


async def web_register(client, email="web@example.com"):
    r = await client.post(f"{API}/register", headers=WEB, json={"email": email, "password": PASSWORD,
                                                                "full_name": "Web User"})
    assert r.status_code == 201, r.text
    return r


async def test_web_login_sets_httponly_cookie_and_hides_token(client):
    r = await web_register(client)
    body = r.json()
    assert body["refresh_token"] is None and body["access_token"]
    c = rt_cookie(r)
    assert c["value"] and c["httponly"] and c["secure"] and c["samesite"].lower() == "lax"
    assert c["path"] == "/api/v1/auth" and int(c["max-age"]) == 30 * 86400
    # Login replaces any cookie with a brand-new session (no fixation).
    r2 = await client.post(f"{API}/login", headers=WEB, json={"email": "web@example.com", "password": PASSWORD})
    assert r2.json()["refresh_token"] is None and rt_cookie(r2)["value"] != c["value"]
    # Non-web clients keep body tokens and get no cookie.
    r3 = await client.post(f"{API}/login", json={"email": "web@example.com", "password": PASSWORD})
    assert r3.json()["refresh_token"] and rt_cookie(r3) == {}


async def test_cookie_refresh_requires_csrf_header_and_allowed_origin(client):
    c = rt_cookie(await web_register(client))["value"]
    jar = {"bagla_rt": c}
    assert (await client.post(f"{API}/refresh", headers=WEB, cookies=jar)).status_code == 403
    bad = {**CSRF, "Origin": "https://evil.example"}
    assert (await client.post(f"{API}/refresh", headers=bad, cookies=jar)).status_code == 403
    ok = await client.post(f"{API}/refresh", headers=CSRF, cookies=jar)
    assert ok.status_code == 200 and ok.json()["refresh_token"] is None
    new = rt_cookie(ok)["value"]
    assert new and new != c
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {ok.json()['access_token']}"})
    assert me.status_code == 200
    # No cookie at all → 401, not a crash.
    assert (await client.post(f"{API}/refresh", headers=CSRF)).status_code == 401


async def test_concurrent_refresh_in_grace_window_keeps_the_session(client):
    c = rt_cookie(await web_register(client))["value"]
    jar = {"bagla_rt": c}
    r1, r2 = await asyncio.gather(client.post(f"{API}/refresh", headers=CSRF, cookies=jar),
                                  client.post(f"{API}/refresh", headers=CSRF, cookies=jar))
    assert r1.status_code == r2.status_code == 200
    cookies = [rt_cookie(r)["value"] for r in (r1, r2) if rt_cookie(r)]
    assert len(cookies) == 1  # only one rotation happened; the other just got an access token
    for r in (r1, r2):
        me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
        assert me.status_code == 200
    ok = await client.post(f"{API}/refresh", headers=CSRF, cookies={"bagla_rt": cookies[0]})
    assert ok.status_code == 200
    # Replaying the original cookie after the window: theft signal, everything revoked, cookie cleared.
    await age_rotations(120)
    stolen = await client.post(f"{API}/refresh", headers=CSRF, cookies=jar)
    assert stolen.status_code == 401 and rt_cookie(stolen)["value"] == ""
    latest = rt_cookie(ok)["value"]
    assert (await client.post(f"{API}/refresh", headers=CSRF, cookies={"bagla_rt": latest})).status_code == 401


async def test_web_logout_clears_cookie_and_revokes(client):
    r = await web_register(client)
    c, at = rt_cookie(r)["value"], r.json()["access_token"]
    auth = {"Authorization": f"Bearer {at}"}
    # Logout from the web client also needs the CSRF header.
    assert (await client.post(f"{API}/logout", headers={**WEB, **auth})).status_code == 403
    out = await client.post(f"{API}/logout", headers={**CSRF, **auth})
    assert out.status_code == 204 and rt_cookie(out)["value"] == "" and int(rt_cookie(out)["max-age"]) == 0
    assert (await client.post(f"{API}/refresh", headers=CSRF, cookies={"bagla_rt": c})).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=auth)).status_code == 401
