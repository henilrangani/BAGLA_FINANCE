from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.models import AuthSession, User
from tests.conftest import PASSWORD, auth, register


async def test_register_login_me(client):
    h = await register(client)
    me = await client.get("/api/v1/users/me", headers=auth(h))
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "asha@example.com"
    assert "password_hash" not in body
    r = await client.post("/api/v1/auth/login", json={"email": "ASHA@example.com", "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["refresh_token"]


async def test_new_user_gets_a_cash_wallet(client):
    h = await register(client)
    accounts = (await client.get("/api/v1/accounts", headers=auth(h))).json()
    assert [a["account_type"] for a in accounts] == ["cash"]
    assert accounts[0]["balance_paise"] == 0


async def test_duplicate_email_and_weak_password(client):
    await register(client)
    r = await client.post("/api/v1/auth/register", json={"email": "asha@example.com", "password": PASSWORD,
                                                          "full_name": "X"})
    assert r.status_code == 409
    r = await client.post("/api/v1/auth/register", json={"email": "b@example.com", "password": "short",
                                                          "full_name": "X"})
    assert r.status_code == 422


async def test_password_is_hashed_with_argon2(client):
    await register(client)
    async for db in get_db():
        user = await db.scalar(select(User))
        assert user.password_hash.startswith("$argon2")
        assert PASSWORD not in user.password_hash


async def test_wrong_password_and_unknown_email_look_identical(client):
    await register(client)
    a = await client.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": "wrong-password-123"})
    b = await client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong-password-123"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


async def test_lockout_after_repeated_failures(client):
    await register(client)
    for _ in range(5):
        r = await client.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": "nope-nope-nope"})
        assert r.status_code == 401
    r = await client.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": PASSWORD})
    assert r.status_code == 429  # locked even with the right password


async def test_ip_rate_limit_on_auth(client):
    for i in range(20):
        await client.post("/api/v1/auth/login", json={"email": f"x{i}@example.com", "password": "whatever-123"})
    r = await client.post("/api/v1/auth/login", json={"email": "y@example.com", "password": "whatever-123"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


async def test_refresh_rotates_and_reuse_revokes_everything(client):
    h = await register(client)
    old = h["_refresh"]
    r1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old})
    assert r1.status_code == 200
    new = r1.json()
    assert new["refresh_token"] != old
    # Replaying the rotated-out token = theft signal: all sessions die.
    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old})
    assert r2.status_code == 401
    r3 = await client.post("/api/v1/auth/refresh", json={"refresh_token": new["refresh_token"]})
    assert r3.status_code == 401
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {new['access_token']}"})
    assert me.status_code == 401


async def test_logout_invalidates_access_token_immediately(client):
    h = await register(client)
    assert (await client.post("/api/v1/auth/logout", headers=auth(h))).status_code == 204
    assert (await client.get("/api/v1/users/me", headers=auth(h))).status_code == 401
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": h["_refresh"]})
    assert r.status_code == 401


async def test_change_password_revokes_other_sessions(client):
    h1 = await register(client)
    r = await client.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": PASSWORD})
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = await client.post("/api/v1/auth/change-password", headers=auth(h1),
                          json={"current_password": PASSWORD, "new_password": "a brand new long passphrase"})
    assert r.status_code == 204
    assert (await client.get("/api/v1/users/me", headers=h2)).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=auth(h1))).status_code == 200
    r = await client.post("/api/v1/auth/login", json={"email": "asha@example.com", "password": PASSWORD})
    assert r.status_code == 401


async def test_tokens_are_validated(client):
    await register(client)
    assert (await client.get("/api/v1/users/me")).status_code == 401
    assert (await client.get("/api/v1/users/me", headers={"Authorization": "Bearer garbage"})).status_code == 401
    s = get_settings()
    forged = jwt.encode({"sub": "x", "sid": "y", "type": "access",
                         "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, "a" * 40, algorithm="HS256")
    assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {forged}"})).status_code == 401
    async for db in get_db():
        user = await db.scalar(select(User))
        sess = await db.scalar(select(AuthSession))
    expired = jwt.encode({"sub": str(user.id), "sid": str(sess.id), "type": "access",
                          "exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, s.jwt_secret, algorithm="HS256")
    assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {expired}"})).status_code == 401
    wrong_type = jwt.encode({"sub": str(user.id), "sid": str(sess.id), "type": "refresh",
                             "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, s.jwt_secret, algorithm="HS256")
    assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {wrong_type}"})).status_code == 401


def test_weak_jwt_secret_is_rejected():
    with pytest.raises(ValueError):
        Settings(jwt_secret="change-me")
    with pytest.raises(ValueError):
        Settings(jwt_secret="short")


async def test_security_headers_and_body_limit(client):
    r = await client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"
    big = "x" * 1_100_000
    r = await client.post("/api/v1/auth/login", content=big, headers={"content-type": "application/json"})
    assert r.status_code == 413


async def test_cors_only_allows_configured_origins(client):
    ok = await client.options("/api/v1/users/me", headers={"Origin": "http://localhost:3000",
                                                            "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = await client.options("/api/v1/users/me", headers={"Origin": "https://evil.example",
                                                             "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers
