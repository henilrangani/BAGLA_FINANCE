"""Investor demo data: SYNTHETIC ONLY, created through the public API (every validation and ledger rule applies).

Creates two demo accounts (Priya and Raj Sharma, *@example.com, a reserved domain), about four months of income,
spending, transfers, a refund, budgets, goals, recurring bills, a flatmates group with mixed split methods and a
part-payment, and a family space with a shared budget, a shared goal, contributions and a few deliberately
shared entries (everything else stays private).

Usage: python scripts/seed_investor_demo.py --api http://127.0.0.1:8100 --password <demo password>
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
rng = random.Random(20261107)  # noqa: S311 - reproducible synthetic data, not security


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/") + "/api/v1"
        self.token: str | None = None

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None,
                                     method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 - local demo API URL from the operator
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path} failed: HTTP {e.code} {e.read().decode(errors='replace')[:300]}")

    def post(self, path: str, body: dict) -> dict:
        return self.call("POST", path, body)


def at(d: date, hh: int = 12, mm: int = 0) -> str:
    return datetime.combine(d, time(hh, mm), IST).isoformat()


def month_start(d: date, back: int) -> date:
    y, m = d.year, d.month - back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:8100")
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    today = datetime.now(IST).date()

    priya, raj = Api(a.api), Api(a.api)
    priya.token = priya.post("/auth/register", {"email": "priya.demo@example.com", "password": a.password,
                                                "full_name": "Priya Sharma"})["access_token"]
    raj.token = raj.post("/auth/register", {"email": "raj.demo@example.com", "password": a.password,
                                            "full_name": "Raj Sharma"})["access_token"]

    # Accounts (synthetic; opening balances are the demo starting point, not real money).
    bank = priya.post("/accounts", {"name": "Savings Account (demo)", "account_type": "bank", "opening_balance_paise": 85_000_00})
    card = priya.post("/accounts", {"name": "Credit Card (demo)", "account_type": "credit_card", "opening_balance_paise": 0})
    cash = priya.call("GET", "/accounts")
    cash = next(x for x in cash if x["account_type"] == "cash")

    n = 0
    shareable: list[str] = []

    def tx(acct: dict, kind: str, paise: int, desc: str, cat: str, d: date, merchant: str | None = None) -> dict:
        nonlocal n
        n += 1
        if d > today:
            return {}
        return priya.post("/transactions", {"account_id": acct["id"], "kind": kind, "amount_paise": paise,
                                            "description": desc, "merchant": merchant or desc, "category": cat,
                                            "occurred_at": at(d, rng.randint(8, 21), rng.choice([0, 15, 30, 45])),
                                            "idempotency_key": f"demo-priya-{n:04d}"})

    shopping_tx = None
    for back in range(3, -1, -1):  # three full months and the current one
        m0 = month_start(today, back)
        tx(bank, "income", 72_000_00, "Salary", "Salary", m0, "Acme Technologies (demo)")
        tx(bank, "expense", 18_000_00, "House rent", "Rent", m0 + timedelta(days=2), "Landlord (demo)")
        tx(bank, "expense", rng.randint(1_400, 1_900) * 100 + rng.randint(0, 99), "Electricity bill", "Electricity",
           m0 + timedelta(days=6), "State Electricity Board (demo)")
        tx(bank, "expense", 799_00, "Broadband", "Internet", m0 + timedelta(days=7), "Fibre Net (demo)")
        tx(card, "expense", 299_00, "Mobile recharge", "Bills", m0 + timedelta(days=9), "Mobile Operator (demo)")
        tx(card, "expense", 649_00, "Streaming subscription", "Subscriptions", m0 + timedelta(days=11), "Streaming Co (demo)")
        if m0 + timedelta(days=4) <= today:
            priya.post("/transactions/transfers", {"from_account_id": bank["id"], "to_account_id": cash["id"],
                                                   "amount_paise": 5_000_00, "description": "ATM withdrawal",
                                                   "occurred_at": at(m0 + timedelta(days=4), 18),
                                                   "idempotency_key": f"demo-atm-{m0.isoformat()}"})
        for i in range(6):
            d = m0 + timedelta(days=rng.randint(0, 27))
            t = tx(bank if i % 2 else card, "expense", rng.randint(900, 2_800) * 100 + rng.choice([0, 50, 25]),
                   "Groceries", "Groceries", d, rng.choice(["Kirana Store (demo)", "SuperMart (demo)", "Fresh Veg Market (demo)"]))
            if t and back <= 1 and i < 2:
                shareable.append(t["id"])
        for _ in range(7):
            tx(card, "expense", rng.randint(180, 650) * 100, "Food delivery", "Food", m0 + timedelta(days=rng.randint(0, 27)),
               rng.choice(["Food App (demo)", "Biryani House (demo)", "Cafe Corner (demo)"]))
        for _ in range(8):
            tx(cash, "expense", rng.randint(40, 260) * 100, "Auto / metro", "Transport", m0 + timedelta(days=rng.randint(0, 27)),
               rng.choice(["Auto rickshaw", "Metro card top-up", "Cab (demo)"]))
        tx(cash, "expense", rng.randint(150, 600) * 100, "Pharmacy", "Healthcare", m0 + timedelta(days=rng.randint(5, 25)),
           "Pharmacy (demo)")
        t = tx(card, "expense", rng.choice([1_999_00, 2_499_00, 3_299_00]), "Clothes", "Shopping",
               m0 + timedelta(days=rng.randint(10, 20)), "Fashion Store (demo)")
        if back == 1 and t:
            shopping_tx = t
    if shopping_tx:  # a partial refund, linked to its original purchase
        priya.post(f"/transactions/{shopping_tx['id']}/refunds", {"amount_paise": 500_00, "description": "Refund: returned one item",
                                                               "idempotency_key": "demo-refund-0001"})

    # Budgets, goals, recurring bills.
    for name, cat, limit in [("Groceries", "Groceries", 9_000_00), ("Food delivery", "Food", 4_000_00),
                             ("Transport", "Transport", 3_000_00), ("Shopping", "Shopping", 3_000_00)]:
        priya.post("/budgets", {"name": name, "category": cat, "amount_paise": limit})
    ef = priya.post("/goals", {"name": "Emergency fund", "target_paise": 2_00_000_00,
                               "deadline": (today + timedelta(days=300)).isoformat()})
    for back in (3, 2, 1):
        priya.post(f"/goals/{ef['id']}/contributions", {"amount_paise": 15_000_00,
                                                        "contributed_on": (month_start(today, back) + timedelta(days=3)).isoformat()})
    trip = priya.post("/goals", {"name": "Goa trip", "target_paise": 40_000_00, "deadline": (today + timedelta(days=120)).isoformat()})
    priya.post(f"/goals/{trip['id']}/contributions", {"amount_paise": 8_000_00})
    for name, amt, cat, day in [("House rent", 18_000_00, "Rent", 3), ("Broadband", 799_00, "Internet", 8),
                                ("Mobile recharge", 299_00, "Bills", 10), ("Streaming subscription", 649_00, "Subscriptions", 12)]:
        start = month_start(today, -1) + timedelta(days=day - 1)
        priya.post("/recurring", {"name": name, "amount_paise": amt, "frequency": "monthly", "start_date": start.isoformat(),
                                  "category": cat, "account_id": bank["id"], "remind_days_before": 3})

    # Flatmates group: mixed split methods, a part-payment.
    g = priya.post("/groups", {"name": "Flat 302 (demo)", "group_type": "flatmates", "cover_emoji": "🛋️",
                               "description": "Shared flat bills", "members": [{"display_name": "Rahul (demo)"},
                                                                               {"display_name": "Ankit (demo)"},
                                                                               {"display_name": "Sneha (demo)"}]})
    m = {x["display_name"]: x["id"] for x in g["members"]}
    me = g["my_member_id"]
    gid = g["id"]
    d1 = month_start(today, 0)
    priya.post(f"/groups/{gid}/expenses", {"description": "Electricity bill", "amount_paise": 3_240_00, "paid_by_member_id": me,
                                           "category": "Electricity", "expense_date": d1.isoformat()})
    priya.post(f"/groups/{gid}/expenses", {"description": "Monthly groceries", "amount_paise": 2_501_00, "paid_by_member_id": m["Rahul (demo)"],
                                           "split": "shares", "category": "Groceries", "expense_date": d1.isoformat(),
                                           "weights": [{"member_id": me, "weight": 2}, {"member_id": m["Rahul (demo)"], "weight": 2},
                                                       {"member_id": m["Ankit (demo)"], "weight": 1}]})
    priya.post(f"/groups/{gid}/expenses", {"description": "House party", "amount_paise": 4_000_00, "paid_by_member_id": me,
                                           "split": "percentage", "category": "Food", "expense_date": d1.isoformat(),
                                           "weights": [{"member_id": me, "weight": 4000}, {"member_id": m["Ankit (demo)"], "weight": 3000},
                                                       {"member_id": m["Sneha (demo)"], "weight": 3000}]})
    priya.post(f"/groups/{gid}/expenses", {"description": "Wi-Fi", "amount_paise": 999_00, "paid_by_member_id": m["Sneha (demo)"],
                                           "category": "Internet", "expense_date": d1.isoformat()})
    priya.post(f"/groups/{gid}/settlements", {"from_member_id": m["Ankit (demo)"], "to_member_id": me, "amount_paise": 1_000_00,
                                              "method": "upi", "note": "Part-payment", "idempotency_key": "demo-settle-0001"})

    # Family: shared budget and goal; only chosen entries are shared, the rest stay private.
    fam = priya.post("/families", {"name": "Sharma Family (demo)"})
    fid = fam["id"]
    tok = priya.post(f"/families/{fid}/invites", {"role": "adult"})["token"]
    raj.post("/families/invites/accept", {"token": tok})
    priya.post(f"/families/{fid}/budgets", {"name": "Household groceries", "category": "Groceries", "limit_paise": 15_000_00})
    fg = priya.post(f"/families/{fid}/goals", {"name": "New refrigerator", "target_paise": 45_000_00,
                                              "target_date": (today + timedelta(days=90)).isoformat()})
    priya.post(f"/families/{fid}/goals/{fg['id']}/contributions", {"amount_paise": 10_000_00, "note": "Priya",
                                                                  "idempotency_key": "demo-famgoal-priya"})
    raj.post(f"/families/{fid}/goals/{fg['id']}/contributions", {"amount_paise": 7_500_00, "note": "Raj",
                                                                "idempotency_key": "demo-famgoal-raj"})
    for tid in shareable[:3]:
        priya.post(f"/families/share/{tid}", {"family_id": fid})
    raj_cash = next(x for x in raj.call("GET", "/accounts") if x["account_type"] == "cash")
    rt = raj.post("/transactions", {"account_id": raj_cash["id"], "kind": "expense", "amount_paise": 2_150_00,
                                    "description": "Vegetables and fruit", "category": "Groceries", "idempotency_key": "demo-raj-0001"})
    raj.post(f"/families/share/{rt['id']}", {"family_id": fid})
    raj.post("/transactions", {"account_id": raj_cash["id"], "kind": "expense", "amount_paise": 899_00,
                               "description": "Personal: book (private)", "category": "Shopping", "idempotency_key": "demo-raj-0002"})

    accts = priya.call("GET", "/accounts")
    print("Investor demo data created (synthetic only).")
    print("  Accounts:", ", ".join(f"{x['name']} Rs {x['balance_paise'] / 100:,.2f}" for x in accts))
    print(f"  Entries created for Priya: {n} (future-dated ones skipped); family shared entries: {len(shareable[:3]) + 1}")


if __name__ == "__main__":
    main()
