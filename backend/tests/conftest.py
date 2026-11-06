"""Test setup. Uses SQLite by default; set TEST_DATABASE_URL to a PostgreSQL URL
(postgresql+asyncpg://...) to run the same suite against PostgreSQL."""
import os
import secrets
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="bagla-test-"))
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite+aiosqlite:///{(_tmp / 'test.db').as_posix()}")
os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)  # synthetic, per test run
os.environ["ENVIRONMENT"] = "test"

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.api import deps  # noqa: E402
from app.core.database import get_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

PASSWORD = "correct horse battery staple"


@pytest.fixture(autouse=True)
async def fresh_db():
    engine = get_engine()
    if engine.url.get_backend_name() == "sqlite":
        # Fresh file per test (DROP TABLE trips over self-referencing FKs in SQLite).
        await engine.dispose()
        db_file = Path(engine.url.database)
        db_file.unlink(missing_ok=True)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    else:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    deps.auth_limiter.hits.clear()
    deps.refresh_limiter.hits.clear()
    yield
    # pytest-asyncio gives every test its own event loop and closes it afterwards.
    # Pooled asyncpg connections belong to the loop that opened them, so the pool
    # must be emptied on this loop before it closes; otherwise the next test gets
    # a connection bound to a dead loop ("Event loop is closed"). Production
    # (uvicorn) runs a single loop, so this only concerns the test harness.
    await engine.dispose()


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def register(client: httpx.AsyncClient, email: str = "asha@example.com", **extra) -> dict:
    r = await client.post("/api/v1/auth/register", json={
        "email": email, "password": PASSWORD, "full_name": "Asha Test", **extra})
    assert r.status_code == 201, r.text
    tokens = r.json()
    return {"Authorization": f"Bearer {tokens['access_token']}", "_refresh": tokens["refresh_token"]}


def auth(h: dict) -> dict:
    return {"Authorization": h["Authorization"]}


async def cash_account(client, h) -> str:
    r = await client.get("/api/v1/accounts", headers=auth(h))
    return next(a["id"] for a in r.json() if a["account_type"] == "cash")


async def new_account(client, h, name="HDFC Savings", account_type="bank", opening=0) -> str:
    r = await client.post("/api/v1/accounts", headers=auth(h), json={
        "name": name, "account_type": account_type, "opening_balance_paise": opening})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def add_tx(client, h, account_id, amount, kind="expense", **extra) -> dict:
    r = await client.post("/api/v1/transactions", headers=auth(h), json={
        "account_id": account_id, "amount_paise": amount, "kind": kind,
        "description": extra.pop("description", f"{kind} {amount}"), **extra})
    assert r.status_code in (200, 201), r.text
    return r.json()
