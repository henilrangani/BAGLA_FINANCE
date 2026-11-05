"""Family Space: shared budgets/goals, contributions, roles, isolation, privacy, activity."""
from datetime import date

from tests.conftest import add_tx, auth, cash_account, register
from tests.test_family_and_business import family_with

API = "/api/v1"
MONTH = date.today().strftime("%Y-%m")


async def share(client, h, tx_id, fid):
    r = await client.post(f"{API}/families/share/{tx_id}", headers=auth(h), json={"family_id": fid})
    assert r.status_code == 200, r.text


async def test_summary_counts_only_shared_entries_and_budgets(client):
    mom = await register(client, "mom@example.com", full_name="Mom")
    dad = await register(client, "dad@example.com", full_name="Dad")
    fid = await family_with(client, mom, (dad, "adult"))
    m_acc, d_acc = await cash_account(client, mom), await cash_account(client, dad)
    groceries = await add_tx(client, mom, m_acc, 120_050, category="Groceries", description="BigBasket")
    await add_tx(client, mom, m_acc, 99_999, category="Shopping", description="private gift")  # never shared
    power = await add_tx(client, dad, d_acc, 210_000, category="Utilities", description="Electricity")
    await add_tx(client, dad, d_acc, 5_000, category="Personal", description="dad private")
    await share(client, mom, groceries["id"], fid)
    await share(client, dad, power["id"], fid)
    # Budgets: one for groceries, one for everything shared.
    for body in ({"name": "Groceries", "category": "Groceries", "limit_paise": 100_000},
                 {"name": "Household", "limit_paise": 500_000}):
        assert (await client.post(f"{API}/families/{fid}/budgets", headers=auth(dad), json=body)).status_code == 201

    s = (await client.get(f"{API}/families/{fid}/summary?month={MONTH}", headers=auth(mom))).json()
    assert s["shared_spend_paise"] == 330_050  # exact paise, private entries excluded
    assert {x["member"]: x["spend_paise"] for x in s["by_member"]} == {"Mom": 120_050, "Dad": 210_000}
    b = {x["name"]: x for x in s["budgets"]}
    assert b["Groceries"]["spent_paise"] == 120_050 and b["Groceries"]["over"] is True
    assert b["Groceries"]["remaining_paise"] == -20_050
    assert b["Household"]["spent_paise"] == 330_050 and b["Household"]["over"] is False
    text = str(s)
    assert "private gift" not in text and "dad private" not in text and "99999" not in text
    assert s["my_shared_entries"] == 1

    # Privacy reset: Dad makes everything private again; it disappears from the family view.
    r = await client.post(f"{API}/families/{fid}/unshare-mine", headers=auth(dad))
    assert r.json() == {"unshared": 1}
    s = (await client.get(f"{API}/families/{fid}/summary?month={MONTH}", headers=auth(mom))).json()
    assert s["shared_spend_paise"] == 120_050 and [x["member"] for x in s["by_member"]] == ["Mom"]
    assert (await client.get(f"{API}/families/{fid}/summary?month=2026-13", headers=auth(mom))).status_code == 422


async def test_goals_contributions_and_roles(client):
    mom = await register(client, "mom@example.com", full_name="Mom")
    kid = await register(client, "kid@example.com", full_name="Kid")
    gran = await register(client, "gran@example.com", full_name="Gran")
    fid = await family_with(client, mom, (kid, "child"), (gran, "viewer"))
    # Only admin/adult create goals and budgets.
    assert (await client.post(f"{API}/families/{fid}/goals", headers=auth(kid),
                              json={"name": "x", "target_paise": 100})).status_code == 403
    assert (await client.post(f"{API}/families/{fid}/budgets", headers=auth(gran),
                              json={"name": "x", "limit_paise": 100})).status_code == 403
    g = (await client.post(f"{API}/families/{fid}/goals", headers=auth(mom),
                           json={"name": "Goa holiday", "target_paise": 5_000_000})).json()
    url = f"{API}/families/{fid}/goals/{g['id']}/contributions"
    # Children contribute; viewers can't.
    body = {"amount_paise": 250_001, "idempotency_key": "kid-goa-0001"}
    assert (await client.post(url, headers=auth(kid), json=body)).status_code == 201
    v = (await client.post(url, headers=auth(kid), json=body)).json()  # retry: no duplicate
    assert v["saved_paise"] == 250_001
    assert (await client.post(url, headers=auth(gran), json={"amount_paise": 100})).status_code == 403
    v = (await client.post(url, headers=auth(mom), json={"amount_paise": 1_000_000})).json()
    assert v["saved_paise"] == 1_250_001 and v["remaining_paise"] == 3_749_999
    assert {x["member"]: x["amount_paise"] for x in v["by_member"]} == {"Mom": 1_000_000, "Kid": 250_001}
    # Kid can't remove Mom's contribution; can remove own; admin can remove any.
    mom_c = next(c["id"] for c in v["contributions"] if c["member"] == "Mom")
    kid_c = next(c["id"] for c in v["contributions"] if c["member"] == "Kid")
    assert (await client.delete(f"{url}/{mom_c}", headers=auth(kid))).status_code == 403
    v = (await client.delete(f"{url}/{kid_c}", headers=auth(kid))).json()
    assert v["saved_paise"] == 1_000_000
    v = (await client.delete(f"{url}/{kid_c}", headers=auth(kid))).json()  # repeat: no change
    assert v["saved_paise"] == 1_000_000
    # Completed goals take no more contributions.
    await client.patch(f"{API}/families/{fid}/goals/{g['id']}", headers=auth(mom), json={"status": "completed"})
    assert (await client.post(url, headers=auth(mom), json={"amount_paise": 1})).status_code == 409
    # Activity shows who did what without private data.
    act = (await client.get(f"{API}/families/{fid}/activity", headers=auth(gran))).json()
    labels = [a["label"] for a in act]
    assert "added a goal" in labels and "contributed to a goal" in labels and "joined" in labels
    assert all(set(a["details"]) <= {"name", "goal", "amount_paise", "limit_paise", "target_paise", "role",
                                     "status", "count", "description"} for a in act)


async def test_one_family_cannot_reach_another(client):
    a1 = await register(client, "a1@example.com")
    b1 = await register(client, "b1@example.com")
    fa = await family_with(client, a1)
    fb = await family_with(client, b1)
    gb = (await client.post(f"{API}/families/{fb}/goals", headers=auth(b1),
                            json={"name": "B goal", "target_paise": 1000})).json()
    bb = (await client.post(f"{API}/families/{fb}/budgets", headers=auth(b1),
                            json={"name": "B budget", "limit_paise": 1000})).json()
    b_tx = await add_tx(client, b1, await cash_account(client, b1), 777, description="B shared")
    await share(client, b1, b_tx["id"], fb)
    for path in (f"/families/{fb}/summary", f"/families/{fb}/activity", f"/families/{fb}/transactions"):
        assert (await client.get(f"{API}{path}", headers=auth(a1))).status_code == 404, path
    # Writing to B's goal/budget through A's family id, or directly, fails.
    assert (await client.post(f"{API}/families/{fa}/goals/{gb['id']}/contributions", headers=auth(a1),
                              json={"amount_paise": 10})).status_code == 404
    assert (await client.post(f"{API}/families/{fb}/goals/{gb['id']}/contributions", headers=auth(a1),
                              json={"amount_paise": 10})).status_code == 404
    assert (await client.patch(f"{API}/families/{fa}/budgets/{bb['id']}", headers=auth(a1),
                               json={"limit_paise": 1})).status_code == 404
    assert (await client.post(f"{API}/families/{fb}/unshare-mine", headers=auth(a1))).status_code == 404
    # A can't share an entry into B's family.
    a_tx = await add_tx(client, a1, await cash_account(client, a1), 5)
    assert (await client.post(f"{API}/families/share/{a_tx['id']}", headers=auth(a1),
                              json={"family_id": fb})).status_code == 404
    s = (await client.get(f"{API}/families/{fa}/summary", headers=auth(a1))).json()
    assert s["shared_spend_paise"] == 0 and s["goals"] == [] and s["budgets"] == []


async def test_removed_member_loses_access_and_sharing(client):
    mom = await register(client, "mom@example.com", full_name="Mom")
    dad = await register(client, "dad@example.com", full_name="Dad")
    fid = await family_with(client, mom, (dad, "adult"))
    tx = await add_tx(client, dad, await cash_account(client, dad), 1234, category="Groceries")
    await share(client, dad, tx["id"], fid)
    fam = (await client.get(f"{API}/families/{fid}", headers=auth(mom))).json()
    dad_mid = next(m["member_id"] for m in fam["members"] if m["name"] == "Dad")
    assert (await client.delete(f"{API}/families/{fid}/members/{dad_mid}", headers=auth(mom))).status_code == 204
    assert (await client.get(f"{API}/families/{fid}/summary", headers=auth(dad))).status_code == 404
    s = (await client.get(f"{API}/families/{fid}/summary", headers=auth(mom))).json()
    assert s["shared_spend_paise"] == 0
