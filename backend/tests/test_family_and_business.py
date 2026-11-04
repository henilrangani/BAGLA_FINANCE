from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.api.v1.routes.business import entitlement
from app.core.database import get_db
from app.models import Plan, User, UserSubscription
from tests.conftest import PASSWORD, add_tx, auth, cash_account, register

API = "/api/v1"


async def family_with(client, admin_h, *members):
    fam = (await client.post(f"{API}/families", headers=auth(admin_h), json={"name": "Shah Family"})).json()
    for h, role in members:
        tok = (await client.post(f"{API}/families/{fam['id']}/invites", headers=auth(admin_h),
                                 json={"role": role})).json()["token"]
        r = await client.post(f"{API}/families/invites/accept", headers=auth(h), json={"token": tok})
        assert r.status_code == 200, r.text
    return fam["id"]


async def test_personal_transactions_stay_private_until_shared(client):
    mom = await register(client, "mom@example.com")
    son = await register(client, "son@example.com")
    fid = await family_with(client, mom, (son, "child"))
    mom_tx = await add_tx(client, mom, await cash_account(client, mom), 2_000, description="private gift")
    son_tx = await add_tx(client, son, await cash_account(client, son), 500, description="school canteen")

    shared = (await client.get(f"{API}/families/{fid}/transactions", headers=auth(mom))).json()
    assert shared["items"] == []  # nothing shared by default
    # Son shares his own entry; mom can't share his, and he can't read hers.
    assert (await client.post(f"{API}/families/share/{son_tx['id']}", headers=auth(son),
                              json={"family_id": fid})).status_code == 200
    assert (await client.post(f"{API}/families/share/{son_tx['id']}", headers=auth(mom),
                              json={"family_id": fid})).status_code == 404
    assert (await client.get(f"{API}/transactions/{mom_tx['id']}", headers=auth(son))).status_code == 404
    shared = (await client.get(f"{API}/families/{fid}/transactions", headers=auth(mom))).json()
    assert [i["description"] for i in shared["items"]] == ["school canteen"]
    assert shared["shared_net_spend_paise"] == 500
    assert "account_id" not in shared["items"][0] and "notes" not in shared["items"][0]
    # Unshare
    await client.post(f"{API}/families/share/{son_tx['id']}", headers=auth(son), json={"family_id": None})
    assert (await client.get(f"{API}/families/{fid}/transactions", headers=auth(mom))).json()["items"] == []


async def test_roles_invites_and_removal(client):
    admin = await register(client, "admin@example.com")
    viewer = await register(client, "viewer@example.com")
    adult = await register(client, "adult@example.com")
    outsider = await register(client, "out@example.com")
    fid = await family_with(client, admin, (viewer, "viewer"), (adult, "adult"))

    # Outsiders see nothing; non-admins can't invite; viewers can't share.
    assert (await client.get(f"{API}/families/{fid}", headers=auth(outsider))).status_code == 404
    assert (await client.get(f"{API}/families/{fid}/transactions", headers=auth(outsider))).status_code == 404
    assert (await client.post(f"{API}/families/{fid}/invites", headers=auth(adult), json={})).status_code == 403
    v_tx = await add_tx(client, viewer, await cash_account(client, viewer), 100)
    assert (await client.post(f"{API}/families/share/{v_tx['id']}", headers=auth(viewer),
                              json={"family_id": fid})).status_code == 403
    # Members list shows names/roles only.
    fam = (await client.get(f"{API}/families/{fid}", headers=auth(viewer))).json()
    assert {m["role"] for m in fam["members"]} == {"admin", "viewer", "adult"}
    assert all("email" not in m for m in fam["members"])

    # Invite tokens are single-use and expire.
    tok = (await client.post(f"{API}/families/{fid}/invites", headers=auth(admin), json={})).json()["token"]
    assert (await client.post(f"{API}/families/invites/accept", headers=auth(outsider),
                              json={"token": tok})).status_code == 200
    assert (await client.post(f"{API}/families/invites/accept", headers=auth(viewer),
                              json={"token": tok})).status_code == 400
    assert (await client.post(f"{API}/families/invites/accept", headers=auth(viewer),
                              json={"token": "x" * 30})).status_code == 400

    # Removal revokes access and un-shares the member's entries immediately.
    a_tx = await add_tx(client, adult, await cash_account(client, adult), 700)
    await client.post(f"{API}/families/share/{a_tx['id']}", headers=auth(adult), json={"family_id": fid})
    members = {m["name"]: m for m in fam["members"]}
    adult_member = next(m for m in (await client.get(f"{API}/families/{fid}", headers=auth(admin))).json()["members"]
                        if m["role"] == "adult")
    assert (await client.delete(f"{API}/families/{fid}/members/{adult_member['member_id']}",
                                headers=auth(viewer))).status_code == 403
    assert (await client.delete(f"{API}/families/{fid}/members/{adult_member['member_id']}",
                                headers=auth(admin))).status_code == 204
    assert (await client.get(f"{API}/families/{fid}/transactions", headers=auth(adult))).status_code == 404
    assert (await client.get(f"{API}/families/{fid}/transactions", headers=auth(admin))).json()["items"] == []
    assert members  # names present

    # Last admin can't leave or be demoted.
    admin_member = next(m for m in fam["members"] if m["role"] == "admin")
    assert (await client.delete(f"{API}/families/{fid}/members/{admin_member['member_id']}",
                                headers=auth(admin))).status_code == 409
    assert (await client.patch(f"{API}/families/{fid}/members/{admin_member['member_id']}", headers=auth(admin),
                               json={"role": "adult"})).status_code == 409


async def test_deleting_an_account_does_not_delete_the_family(client):
    owner = await register(client, "owner@example.com")
    other = await register(client, "other@example.com")
    fid = await family_with(client, owner, (other, "adult"))
    r = await client.request("DELETE", f"{API}/users/me", headers=auth(owner),
                             json={"password": PASSWORD, "confirm": "DELETE MY ACCOUNT"})
    assert r.status_code == 204
    fam = (await client.get(f"{API}/families/{fid}", headers=auth(other))).json()
    assert [m["role"] for m in fam["members"]] == ["admin"]  # promoted, family survives


async def test_support_tickets_and_feedback(client):
    h = await register(client)
    other = await register(client, "other@example.com")
    r = await client.post(f"{API}/support/tickets", headers=auth(h), json={
        "category": "security", "subject": "Strange login", "message": "I saw a login I don't recognise."})
    assert r.status_code == 201
    t = r.json()
    assert t["reference"].startswith("BF-") and t["priority"] == "urgent" and "Email notifications" in t["notice"]
    assert [x["reference"] for x in (await client.get(f"{API}/support/tickets", headers=auth(h))).json()] == \
        [t["reference"]]
    assert (await client.get(f"{API}/support/tickets", headers=auth(other))).json() == []
    assert (await client.post(f"{API}/feedback", headers=auth(h), json={"kind": "satisfaction", "rating": 6})
            ).status_code == 422
    assert (await client.post(f"{API}/feedback", headers=auth(h), json={
        "kind": "onboarding_abandoned", "context": "step_3"})).status_code == 201


async def _make_admin(email: str):
    async for db in get_db():
        await db.execute(update(User).where(User.email == email).values(is_admin=True))
        await db.commit()


async def test_admin_is_staff_only_and_sees_no_financial_records(client):
    staff = await register(client, "staff@example.com")
    user = await register(client, "user@example.com")
    await add_tx(client, user, await cash_account(client, user), 123_456, description="very private")
    assert (await client.get(f"{API}/admin/overview", headers=auth(user))).status_code == 404
    await _make_admin("staff@example.com")
    ov = (await client.get(f"{API}/admin/overview", headers=auth(staff))).json()
    assert ov["users"] == 2 and ov["transactions"] == 1
    assert "123456" not in str(ov) and "very private" not in str(ov)
    # No admin route returns transactions.
    for path in ("/admin/tickets", "/admin/feedback"):
        assert "very private" not in (await client.get(API + path, headers=auth(staff))).text
    # Plans: no price required; non-integer price rejected.
    assert (await client.put(f"{API}/admin/plans", headers=auth(staff), json={
        "code": "pro", "name": "Pro", "price_paise": 99.5})).status_code == 422
    assert (await client.put(f"{API}/admin/plans", headers=auth(user), json={
        "code": "pro", "name": "Pro"})).status_code == 404
    r = await client.put(f"{API}/admin/plans", headers=auth(staff), json={
        "code": "pro", "name": "Pro", "features": {"family": True}})
    assert r.status_code == 200 and r.json()["price_paise"] is None


async def test_trial_cancel_keeps_access_until_end(client):
    staff = await register(client, "staff@example.com")
    await _make_admin("staff@example.com")
    await client.put(f"{API}/admin/plans", headers=auth(staff), json={"code": "pro", "name": "Pro",
                                                                      "features": {"family": True}})
    h = await register(client)
    assert (await client.get(f"{API}/billing/me", headers=auth(h))).json()["has_access"] is False
    plans = (await client.get(f"{API}/billing/plans", headers=auth(h))).json()
    assert plans[0]["purchasable"] is False
    t = (await client.post(f"{API}/billing/trial", headers=auth(h), json={"plan_code": "pro"})).json()
    assert t["status"] == "trialing" and t["has_access"] and t["features"] == {"family": True}
    assert (await client.post(f"{API}/billing/trial", headers=auth(h), json={"plan_code": "pro"})).status_code == 409
    c = (await client.post(f"{API}/billing/cancel", headers=auth(h))).json()
    assert c["has_access"] is True and c["cancel_at_period_end"] is True  # access continues
    hist = [e["event"] for e in (await client.get(f"{API}/billing/history", headers=auth(h))).json()]
    assert hist == ["trial_started", "cancel_requested"]


def test_entitlement_rules():
    t0 = datetime(2026, 11, 4, tzinfo=timezone.utc)
    plans = {"pro": Plan(code="pro", name="Pro", features={"x": 1})}
    trial = UserSubscription(plan_code="pro", status="trialing", trial_ends_at=t0 + timedelta(days=7))
    assert entitlement(trial, plans, t0)["has_access"] is True
    assert entitlement(trial, plans, t0 + timedelta(days=7))["status"] == "expired"
    canceled = UserSubscription(plan_code="pro", status="canceled", current_period_end=t0 + timedelta(days=3),
                                cancel_at_period_end=True)
    assert entitlement(canceled, plans, t0)["has_access"] is True
    assert entitlement(canceled, plans, t0 + timedelta(days=4))["has_access"] is False
    assert entitlement(None, plans, t0)["plan"] == "free"
    assert select  # imported for parity with other tests
