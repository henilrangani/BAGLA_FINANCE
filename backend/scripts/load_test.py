"""Small, safe load test for a *test* deployment (never production data).

Simulates N synthetic users, each doing a realistic mix concurrently: create expenses with
idempotency keys (including deliberate retries), list transactions, read reports, and one
group expense + settlement. Reports latency percentiles, error counts, and verifies the
ledger afterwards: every user's posted total must equal exactly what they created (no lost or
duplicated writes under concurrency).

Usage: python scripts/load_test.py http://127.0.0.1:8000 --users 25 --ops 20
"""
import argparse
import asyncio
import secrets
import statistics
import time

import httpx


async def user_flow(client: httpx.AsyncClient, ops: int, lat: dict, errors: list) -> tuple[int, int]:
    email = f"load-{secrets.token_hex(6)}@example.com"
    pw = "Load-" + secrets.token_hex(10) + "-Aa1!"

    async def call(name, method, url, **kw):
        t = time.perf_counter()
        r = await client.request(method, url, **kw)
        lat.setdefault(name, []).append((time.perf_counter() - t) * 1000)
        if r.status_code >= 500 or r.status_code in (401, 403):
            errors.append(f"{name} {r.status_code}")
        return r

    r = await call("register", "POST", "/api/v1/auth/register",
                   json={"email": email, "password": pw, "full_name": "Load User"})
    r = await call("login", "POST", "/api/v1/auth/login", json={"email": email, "password": pw})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # Dashboard load: accounts, monthly summary and recent entries.
    acc = (await call("dashboard_accounts", "GET", "/api/v1/accounts", headers=h)).json()[0]["id"]
    await call("dashboard_summary", "GET", "/api/v1/reports/summary", headers=h)
    await call("dashboard_recent", "GET", "/api/v1/transactions?limit=10", headers=h)
    expected = 0
    for i in range(ops):
        amount = 100 + i * 7
        key = f"load-{email}-{i}"
        body = {"account_id": acc, "amount_paise": amount, "kind": "expense", "description": f"Load {i}"}
        await call("tx_create", "POST", "/api/v1/transactions", headers={**h, "Idempotency-Key": key}, json=body)
        if i % 5 == 0:  # retry storm: the same request again must not double-post
            await call("tx_retry", "POST", "/api/v1/transactions", headers={**h, "Idempotency-Key": key}, json=body)
        expected += amount
        if i % 4 == 0:
            await call("tx_list", "GET", "/api/v1/transactions?limit=50", headers=h)
        if i % 10 == 0:
            await call("analytics", "GET", "/api/v1/reports/summary", headers=h)
            await call("analytics_networth", "GET", "/api/v1/reports/net-worth", headers=h)
    g = (await call("group_create", "POST", "/api/v1/groups", headers=h,
                    json={"name": "Load group", "members": [{"display_name": "Friend"}]})).json()
    friend = next(m["id"] for m in g["members"] if m["display_name"] == "Friend")
    await call("group_expense", "POST", f"/api/v1/groups/{g['id']}/expenses", headers=h,
               json={"description": "Dinner", "amount_paise": 10001, "paid_by_member_id": g["my_member_id"]})
    await call("settlement", "POST", f"/api/v1/groups/{g['id']}/settlements", headers=h,
               json={"from_member_id": friend, "to_member_id": g["my_member_id"], "amount_paise": 5000})
    items = (await call("tx_verify", "GET", "/api/v1/transactions?status=posted&limit=200", headers=h)).json()["items"]
    return expected, sum(t["amount_paise"] for t in items if t["kind"] == "expense")


async def main(base: str, users: int, ops: int) -> None:
    lat: dict[str, list[float]] = {}
    errors: list[str] = []
    limits = httpx.Limits(max_connections=users * 2)
    async with httpx.AsyncClient(base_url=base, timeout=30, limits=limits) as client:
        t0 = time.perf_counter()
        results = await asyncio.gather(*[user_flow(client, ops, lat, errors) for _ in range(users)],
                                       return_exceptions=True)
        wall = time.perf_counter() - t0
    crashed = [r for r in results if isinstance(r, Exception)]
    mismatched = [r for r in results if not isinstance(r, Exception) and r[0] != r[1]]
    total = sum(len(v) for v in lat.values())
    def pct(v: list[float], q: float) -> float:
        return v[min(len(v) - 1, max(0, int(round(len(v) * q)) - 1))]

    every = sorted(x for v in lat.values() for x in v)
    print(f"users={users} ops/user={ops} requests={total} wall={wall:.1f}s throughput={total / wall:.1f} req/s")
    print(f"  ALL           n={total:4d} p50={statistics.median(every):7.1f}ms p95={pct(every, .95):7.1f}ms "
          f"p99={pct(every, .99):7.1f}ms max={every[-1]:7.1f}ms")
    for name, v in sorted(lat.items()):
        v.sort()
        print(f"  {name:18s} n={len(v):4d} p50={statistics.median(v):7.1f}ms p95={pct(v, .95):7.1f}ms "
              f"p99={pct(v, .99):7.1f}ms max={v[-1]:7.1f}ms")
    print(f"errors={len(errors)} ({100 * len(errors) / max(1, total):.2f}%) crashed_flows={len(crashed)} "
          f"ledger_mismatches={len(mismatched)}")
    if errors[:5]:
        print("  first errors:", errors[:5])
    if crashed[:2]:
        print("  first crash:", repr(crashed[0])[:300])
    raise SystemExit(1 if errors or crashed or mismatched else 0)


if __name__ == "__main__":  # pragma: no cover
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--users", type=int, default=25)
    ap.add_argument("--ops", type=int, default=20)
    a = ap.parse_args()
    asyncio.run(main(a.base, a.users, a.ops))
