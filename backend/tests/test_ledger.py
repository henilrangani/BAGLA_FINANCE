from tests.conftest import add_tx, auth, cash_account, new_account, register

API = "/api/v1"


async def balance(client, h, account_id) -> int:
    return (await client.get(f"{API}/accounts/{account_id}", headers=auth(h))).json()["balance_paise"]


async def test_money_must_be_integer_paise(client):
    h = await register(client)
    acc = await cash_account(client, h)
    for bad in (12.5, "1250", True, 0, -100, 10**13):
        r = await client.post(f"{API}/transactions", headers=auth(h), json={
            "account_id": acc, "amount_paise": bad, "kind": "expense", "description": "x"})
        assert r.status_code == 422, (bad, r.text)


async def test_balance_is_opening_plus_posted_entries(client):
    h = await register(client)
    acc = await new_account(client, h, opening=1_000_000)  # ₹10,000
    await add_tx(client, h, acc, 25_000)                    # ₹250 expense
    await add_tx(client, h, acc, 5_000_000, kind="income")  # ₹50,000 income
    await add_tx(client, h, acc, 99, status="pending")      # pending: not in balance
    r = (await client.get(f"{API}/accounts/{acc}", headers=auth(h))).json()
    assert r["balance_paise"] == 1_000_000 - 25_000 + 5_000_000
    assert r["pending_paise"] == -99


async def test_transfer_moves_money_but_is_not_income_or_expense(client):
    h = await register(client)
    bank = await new_account(client, h, opening=100_000)
    cash = await cash_account(client, h)
    r = await client.post(f"{API}/transactions/transfers", headers=auth(h), json={
        "from_account_id": bank, "to_account_id": cash, "amount_paise": 40_000, "description": "ATM"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["debit"]["transfer_group_id"] == body["credit"]["transfer_group_id"]
    assert await balance(client, h, bank) == 60_000
    assert await balance(client, h, cash) == 40_000
    s = (await client.get(f"{API}/reports/summary", headers=auth(h))).json()
    assert s["income_paise"] == 0 and s["expense_paise"] == 0 and s["transfer_count"] == 1
    # Voiding one leg voids both.
    v = await client.delete(f"{API}/transactions/{body['credit']['id']}", headers=auth(h))
    assert {t["status"] for t in v.json()} == {"void"} and len(v.json()) == 2
    assert await balance(client, h, bank) == 100_000
    assert await balance(client, h, cash) == 0


async def test_refunds_link_to_original_and_cannot_exceed_it(client):
    h = await register(client)
    acc = await cash_account(client, h)
    exp = await add_tx(client, h, acc, 10_000, category="Shopping")
    r = await client.post(f"{API}/transactions/{exp['id']}/refunds", headers=auth(h), json={"amount_paise": 4_000})
    assert r.status_code == 201
    refund = r.json()
    assert refund["refund_of_id"] == exp["id"] and refund["kind"] == "refund" and refund["category"] == "Shopping"
    r = await client.post(f"{API}/transactions/{exp['id']}/refunds", headers=auth(h), json={"amount_paise": 6_001})
    assert r.status_code == 409
    r = await client.post(f"{API}/transactions/{exp['id']}/refunds", headers=auth(h), json={"amount_paise": 6_000})
    assert r.status_code == 201
    s = (await client.get(f"{API}/reports/summary", headers=auth(h))).json()
    assert s["expense_paise"] == 10_000 and s["refunds_paise"] == 10_000 and s["net_spend_paise"] == 0
    # Can't refund income, can't void an expense that still has refunds, can't shrink below refunded.
    inc = await add_tx(client, h, acc, 500, kind="income")
    assert (await client.post(f"{API}/transactions/{inc['id']}/refunds", headers=auth(h),
                              json={"amount_paise": 1})).status_code == 409
    assert (await client.delete(f"{API}/transactions/{exp['id']}", headers=auth(h))).status_code == 409
    assert (await client.patch(f"{API}/transactions/{exp['id']}", headers=auth(h),
                               json={"amount_paise": 9_999})).status_code == 409


async def test_reversal_is_audited_and_cancels_in_reports(client):
    h = await register(client)
    acc = await new_account(client, h, opening=50_000)
    exp = await add_tx(client, h, acc, 20_000, description="UPI to shop (failed)")
    r = await client.post(f"{API}/transactions/{exp['id']}/reverse", headers=auth(h), json={"reason": "bank reversed"})
    assert r.status_code == 201
    assert r.json()["reverses_id"] == exp["id"] and r.json()["direction"] == "credit"
    assert await balance(client, h, acc) == 50_000
    s = (await client.get(f"{API}/reports/summary", headers=auth(h))).json()
    assert s["expense_paise"] == 0
    assert (await client.post(f"{API}/transactions/{exp['id']}/reverse", headers=auth(h),
                              json={"reason": "again"})).status_code == 409
    hist = (await client.get(f"{API}/transactions/{exp['id']}/history", headers=auth(h))).json()
    assert [e["action"] for e in hist] == ["create", "reversed"]


async def test_edit_and_void_keep_history(client):
    h = await register(client)
    acc = await cash_account(client, h)
    tx = await add_tx(client, h, acc, 1_000, description="chai")
    r = await client.patch(f"{API}/transactions/{tx['id']}", headers=auth(h), json={"amount_paise": 1_500})
    assert r.status_code == 200 and r.json()["amount_paise"] == 1_500
    await client.delete(f"{API}/transactions/{tx['id']}", headers=auth(h))
    # Still retrievable, marked void, excluded from list by default and from balance.
    one = (await client.get(f"{API}/transactions/{tx['id']}", headers=auth(h))).json()
    assert one["status"] == "void"
    listed = (await client.get(f"{API}/transactions", headers=auth(h))).json()["items"]
    assert listed == []
    assert await balance(client, h, acc) == 0
    hist = (await client.get(f"{API}/transactions/{tx['id']}/history", headers=auth(h))).json()
    assert [e["action"] for e in hist] == ["create", "update", "void"]
    assert hist[1]["before"]["amount_paise"] == 1_000 and hist[1]["after"]["amount_paise"] == 1_500
    assert (await client.patch(f"{API}/transactions/{tx['id']}", headers=auth(h),
                               json={"description": "x"})).status_code == 409


async def test_idempotency_prevents_duplicate_posting(client):
    h = await register(client)
    acc = await cash_account(client, h)
    headers = {**auth(h), "Idempotency-Key": "retry-key-0001"}
    body = {"account_id": acc, "amount_paise": 7_500, "kind": "expense", "description": "lunch"}
    r1 = await client.post(f"{API}/transactions", headers=headers, json=body)
    r2 = await client.post(f"{API}/transactions", headers=headers, json=body)
    assert r1.status_code == 201 and r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    assert await balance(client, h, acc) == -7_500
    r3 = await client.post(f"{API}/transactions", headers=headers, json={**body, "amount_paise": 1})
    assert r3.status_code == 409
    # Transfers too.
    bank = await new_account(client, h)
    th = {**auth(h), "Idempotency-Key": "transfer-key-01"}
    tb = {"from_account_id": bank, "to_account_id": acc, "amount_paise": 100}
    t1 = await client.post(f"{API}/transactions/transfers", headers=th, json=tb)
    t2 = await client.post(f"{API}/transactions/transfers", headers=th, json=tb)
    assert t1.status_code == 201 and t2.status_code == 200
    assert t1.json()["transfer_group_id"] == t2.json()["transfer_group_id"]


async def test_local_date_uses_user_time_zone(client):
    h = await register(client)
    acc = await cash_account(client, h)
    # 20:00 UTC on 4 Nov is 01:30 IST on 5 Nov.
    tx = await add_tx(client, h, acc, 100, occurred_at="2026-11-04T20:00:00Z")
    assert tx["local_date"] == "2026-11-05" and tx["timezone"] == "Asia/Kolkata"
    tx2 = await add_tx(client, h, acc, 100, occurred_at="2026-11-04T20:00:00Z", timezone="America/New_York")
    assert tx2["local_date"] == "2026-11-04"
    r = await client.post(f"{API}/transactions", headers=auth(h), json={
        "account_id": acc, "amount_paise": 1, "kind": "expense", "description": "x",
        "occurred_at": "2026-11-04T20:00:00"})
    assert r.status_code == 422  # naive timestamps rejected


async def test_adjustment_needs_direction_and_ai_entries_need_review(client):
    h = await register(client)
    acc = await cash_account(client, h)
    r = await client.post(f"{API}/transactions", headers=auth(h), json={
        "account_id": acc, "amount_paise": 100, "kind": "adjustment", "description": "count"})
    assert r.status_code == 422
    adj = await add_tx(client, h, acc, 100, kind="adjustment", direction="credit")
    assert adj["direction"] == "credit"
    ai = await add_tx(client, h, acc, 100, source="ai_suggested")
    assert ai["needs_review"] is True
    s = (await client.get(f"{API}/reports/summary", headers=auth(h))).json()
    assert s["income_paise"] == 0  # adjustments are not income


async def test_filters_search_and_pagination(client):
    h = await register(client)
    acc = await cash_account(client, h)
    for i in range(5):
        await add_tx(client, h, acc, 100 + i, description=f"Swiggy order {i}", category="Food")
    await add_tx(client, h, acc, 999, description="Metro card", category="Transport")
    page = (await client.get(f"{API}/transactions?limit=2", headers=auth(h))).json()
    assert len(page["items"]) == 2 and page["next_offset"] == 2
    food = (await client.get(f"{API}/transactions?category=Food&limit=50", headers=auth(h))).json()
    assert len(food["items"]) == 5
    q = (await client.get(f"{API}/transactions?q=metro", headers=auth(h))).json()
    assert [t["amount_paise"] for t in q["items"]] == [999]


async def test_reports_and_reconciliation_agree(client):
    h = await register(client)
    bank = await new_account(client, h, opening=200_000)
    cash = await cash_account(client, h)
    await add_tx(client, h, bank, 3_000_000, kind="income", category="Salary")
    e1 = await add_tx(client, h, bank, 45_050, category="Groceries")
    await add_tx(client, h, cash, 2_000, category="Food")
    await add_tx(client, h, bank, 500_000, kind="savings_contribution")
    await client.post(f"{API}/transactions/{e1['id']}/refunds", headers=auth(h), json={"amount_paise": 5_050})
    await client.post(f"{API}/transactions/transfers", headers=auth(h), json={
        "from_account_id": bank, "to_account_id": cash, "amount_paise": 10_000})
    s = (await client.get(f"{API}/reports/summary", headers=auth(h))).json()
    assert s["income_paise"] == 3_000_000
    assert s["net_spend_paise"] == 45_050 + 2_000 - 5_050
    assert s["cash_spend_paise"] == 2_000 and s["digital_spend_paise"] == 40_000
    assert s["outflows_paise"]["savings_contribution"] == 500_000
    assert s["net_savings_paise"] == 3_000_000 - 42_000 - 500_000
    cats = {c["category"]: c["net_spend_paise"] for c in s["by_category"]}
    assert cats == {"Groceries": 40_000, "Food": 2_000}
    rec = (await client.get(f"{API}/reports/reconciliation", headers=auth(h))).json()
    assert rec["ok"] is True
    nw = (await client.get(f"{API}/reports/net-worth", headers=auth(h))).json()
    accounts = {a["id"]: a["balance_paise"] for a in nw["accounts"]}
    for a in rec["accounts"]:
        assert accounts[a["account_id"]] == a["balance_paise"]
    assert nw["by_currency"][0]["net_worth_paise"] == sum(accounts.values())


async def test_credit_card_debt_is_a_liability(client):
    h = await register(client)
    await new_account(client, h, name="Card", account_type="credit_card", opening=-250_000)
    nw = (await client.get(f"{API}/reports/net-worth", headers=auth(h))).json()
    inr = nw["by_currency"][0]
    assert inr["liabilities_paise"] == 250_000 and inr["net_worth_paise"] == -250_000


async def test_archived_account_rejects_new_entries(client):
    h = await register(client)
    acc = await new_account(client, h)
    await client.patch(f"{API}/accounts/{acc}", headers=auth(h), json={"is_archived": True})
    r = await client.post(f"{API}/transactions", headers=auth(h), json={
        "account_id": acc, "amount_paise": 1, "kind": "expense", "description": "x"})
    assert r.status_code == 409


async def test_simultaneous_retries_post_once_and_refunds_never_exceed_the_original(client):
    import asyncio
    h = await register(client)
    acc = await cash_account(client, h)
    headers = {**auth(h), "Idempotency-Key": "race-key-000001"}
    body = {"account_id": acc, "amount_paise": 10_000, "kind": "expense", "description": "dinner"}
    results = await asyncio.gather(*[client.post(f"{API}/transactions", headers=headers, json=body) for _ in range(4)])
    assert all(r.status_code in (200, 201) for r in results), [r.text for r in results]
    assert len({r.json()["id"] for r in results}) == 1  # one entry, however many retries arrive together
    assert await balance(client, h, acc) == -10_000
    tx_id = results[0].json()["id"]
    # Two refunds of Rs 60 each against a Rs 100 expense, at the same moment: at most one succeeds.
    r1, r2 = await asyncio.gather(
        client.post(f"{API}/transactions/{tx_id}/refunds", headers=auth(h), json={"amount_paise": 6_000}),
        client.post(f"{API}/transactions/{tx_id}/refunds", headers=auth(h), json={"amount_paise": 6_000}))
    assert sorted([r1.status_code, r2.status_code]) in ([201, 409], [201, 422])
    assert await balance(client, h, acc) == -10_000 + 6_000
