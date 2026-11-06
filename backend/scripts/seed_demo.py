"""Create one synthetic demo account with sample data, through the public API.

Everything goes through the normal endpoints, so every validation, ledger rule and audit event
applies. All names, amounts and e-mail addresses are invented; no real person, bank or UPI ID
is used. The password is random, printed once to your console, and never stored.

Usage (release stack):
    docker compose -f compose.release.yaml --env-file .env.release exec api python scripts/seed_demo.py
Options:
    --api http://127.0.0.1:8000   API base URL (default: the API inside its container)
    --email demo-<random>@example.com   (example.com is reserved for documentation)
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta


def call(base: str, method: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} failed: HTTP {e.code} {e.read().decode(errors='replace')[:300]}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--api", default="http://127.0.0.1:8000")
    p.add_argument("--email", default=f"demo-{secrets.token_hex(4)}@example.com")
    a = p.parse_args()
    base = a.api.rstrip("/") + "/api/v1"
    password = secrets.token_urlsafe(15)

    tok = call(base, "POST", "/auth/register",
               {"email": a.email, "password": password, "full_name": "Demo User"})["access_token"]

    def post(path: str, body: dict) -> dict:
        return call(base, "POST", path, body, tok)

    today = date.today()
    bank = post("/accounts", {"name": "Demo Savings Account", "account_type": "bank", "opening_balance_paise": 50_000_00})
    cash = post("/accounts", {"name": "Pocket Cash", "account_type": "cash", "opening_balance_paise": 2_000_00})

    def tx(acct: dict, kind: str, paise: int, desc: str, cat: str, n: int) -> None:
        post("/transactions", {"account_id": acct["id"], "kind": kind, "amount_paise": paise, "description": desc,
                               "category": cat, "idempotency_key": f"seed:{a.email}:{n}"})

    rows = [(bank, "income", 85_000_00, "Salary (sample)", "Salary"),
            (bank, "expense", 18_000_00, "House rent (sample)", "Housing"),
            (bank, "expense", 1_249_50, "Electricity bill (sample)", "Utilities"),
            (cash, "expense", 340_00, "Vegetables (sample)", "Groceries"),
            (bank, "expense", 2_150_00, "Supermarket (sample)", "Groceries"),
            (cash, "expense", 120_00, "Auto rickshaw (sample)", "Transport")]
    for i, r in enumerate(rows):
        tx(*r, i)
    post("/transactions/transfers", {"from_account_id": bank["id"], "to_account_id": cash["id"],
                                     "amount_paise": 3_000_00, "description": "ATM withdrawal (sample)",
                                     "idempotency_key": f"seed:{a.email}:transfer"})

    post("/budgets", {"name": "Groceries", "category": "Groceries", "amount_paise": 8_000_00})
    post("/budgets", {"name": "Transport", "category": "Transport", "amount_paise": 2_500_00})
    goal = post("/goals", {"name": "Emergency fund", "target_paise": 1_00_000_00,
                           "deadline": (today + timedelta(days=365)).isoformat()})
    post(f"/goals/{goal['id']}/contributions", {"amount_paise": 5_000_00})
    post("/recurring", {"name": "Mobile recharge (sample)", "amount_paise": 299_00, "frequency": "monthly",
                        "start_date": (today + timedelta(days=2)).isoformat(), "category": "Utilities",
                        "account_id": bank["id"]})

    g = post("/groups", {"name": "Weekend trip (demo)", "members": [{"display_name": "Asha (demo)"},
                                                                     {"display_name": "Ravi (demo)"}]})
    me = next(m for m in g["members"] if m["is_me"])
    asha = next(m for m in g["members"] if m["display_name"] == "Asha (demo)")
    post(f"/groups/{g['id']}/expenses", {"description": "Hotel (sample)", "amount_paise": 6_000_00,
                                         "paid_by_member_id": me["id"]})
    post(f"/groups/{g['id']}/settlements", {"from_member_id": asha["id"], "to_member_id": me["id"],
                                            "amount_paise": 1_000_00, "method": "cash",
                                            "idempotency_key": f"seed:{a.email}:settle"})

    accts = call(base, "GET", "/accounts", None, tok)
    print("Demo account created (synthetic data only).")
    print(f"  E-mail:   {a.email}")
    print(f"  Password: {password}   <- shown once, not stored anywhere")
    for x in accts:
        print(f"  {x['name']}: Rs {x['balance_paise'] / 100:,.2f}")


if __name__ == "__main__":
    main()
