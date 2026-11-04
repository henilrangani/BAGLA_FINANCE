import base64
import io
from datetime import date

import pytest

from app.services.imports import RowError, parse_amount, parse_date
from tests.conftest import auth, new_account, register

API = "/api/v1"

HDFC_STYLE = """Account Statement,,,,
Name: SYNTHETIC TEST USER,,,,
Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.
01/11/26,UPI-SWIGGY-ORDER,1234,"1,250.50",
02/11/26,SALARY NOV,,,"50,000.00"
03/11/26,AMAZON PAY,,499.00,
03/11/26,AMAZON PAY,,499.00,
04/11/26,BAD ROW,,abc,
31/02/26,BAD DATE,,10,
"""


def b64(s: str | bytes) -> str:
    return base64.b64encode(s.encode() if isinstance(s, str) else s).decode()


async def preview(client, h, acc, content, filename="statement.csv", **extra):
    r = await client.post(f"{API}/imports/preview", headers=auth(h), json={
        "account_id": acc, "filename": filename, "content_base64": b64(content), **extra})
    return r


def test_amount_and_date_parsing():
    assert parse_amount("1,25,000.50") == (12_500_050, None)
    assert parse_amount("₹ 99") == (9_900, None)
    assert parse_amount("(500.00)") == (-50_000, None)
    assert parse_amount("250.00 Dr") == (25_000, "debit")
    assert parse_amount("250 CR") == (25_000, "credit")
    assert parse_amount(1250.5) == (125_050, None)
    assert parse_amount(0.1 + 0.2) == (30, None)  # Excel float noise is tolerated only below 1e-6
    assert parse_amount("") == (0, None)
    for bad in ("10.001", "abc", "1.2.3", 10.005):
        with pytest.raises(RowError):
            parse_amount(bad)
    assert parse_date("01/11/26") == date(2026, 11, 1)
    assert parse_date("01-Nov-2026") == date(2026, 11, 1)
    assert parse_date("1 November 2026") == date(2026, 11, 1)
    assert parse_date("2026-11-04") == date(2026, 11, 4)
    assert parse_date("04.11.2026") == date(2026, 11, 4)
    for bad in ("31/02/2026", "", "yesterday", "13/13/2026"):
        with pytest.raises(RowError):
            parse_date(bad)


async def test_preview_detects_header_columns_errors_and_categories(client):
    h = await register(client)
    acc = await new_account(client, h)
    r = await preview(client, h, acc, HDFC_STYLE)
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["status"] == "preview" and b["row_count"] == 6 and b["error_count"] == 2
    rows = {x["row_number"]: x for x in b["rows"]}
    assert rows[4]["amount_paise"] == 125_050 and rows[4]["direction"] == "debit" and rows[4]["category"] == "Food"
    assert rows[5]["direction"] == "credit" and rows[5]["category"] == "Salary"
    assert "invalid amount" in rows[8]["error"] and "invalid date" in rows[9]["error"]
    # Nothing touches the ledger before commit.
    tx = (await client.get(f"{API}/transactions", headers=auth(h))).json()["items"]
    assert tx == []


async def test_commit_is_idempotent_and_reimport_creates_no_duplicates(client):
    h = await register(client)
    acc = await new_account(client, h, opening=0)
    b = (await preview(client, h, acc, HDFC_STYLE)).json()
    c1 = await client.post(f"{API}/imports/{b['id']}/commit", headers=auth(h), json={})
    assert c1.status_code == 200 and c1.json()["imported_count"] == 4  # both identical AMAZON rows kept
    c2 = await client.post(f"{API}/imports/{b['id']}/commit", headers=auth(h), json={})
    assert c2.json()["imported_count"] == 4  # safe retry
    bal = (await client.get(f"{API}/accounts/{acc}", headers=auth(h))).json()["balance_paise"]
    assert bal == 5_000_000 - 125_050 - 49_900 - 49_900
    # Same statement uploaded again: every row is a duplicate; commit adds nothing.
    b2 = (await preview(client, h, acc, HDFC_STYLE)).json()
    assert b2["duplicate_count"] == 4
    c3 = await client.post(f"{API}/imports/{b2['id']}/commit", headers=auth(h),
                           json={"include_duplicate_row_numbers": [4, 5, 6, 7]})
    assert c3.json()["imported_count"] == 0  # idempotency keys still block re-posting
    s = (await client.get(f"{API}/reports/summary?from_date=2026-11-01&to_date=2026-11-30",
                          headers=auth(h))).json()
    assert s["income_paise"] == 5_000_000 and s["expense_paise"] == 125_050 + 99_800
    tx = (await client.get(f"{API}/transactions?limit=50", headers=auth(h))).json()["items"]
    assert all(t["source"] == "import" for t in tx)


async def test_manual_entry_matching_a_statement_row_is_flagged(client):
    h = await register(client)
    acc = await new_account(client, h)
    await client.post(f"{API}/transactions", headers=auth(h), json={
        "account_id": acc, "amount_paise": 49_900, "kind": "expense", "description": "amazon order",
        "occurred_at": "2026-11-03T10:00:00+05:30"})
    b = (await preview(client, h, acc, HDFC_STYLE)).json()
    dups = [r for r in b["rows"] if r["duplicate_of_id"]]
    assert [r["row_number"] for r in dups] == [6, 7]
    c = await client.post(f"{API}/imports/{b['id']}/commit", headers=auth(h), json={"exclude_row_numbers": [4]})
    assert c.json()["imported_count"] == 1  # only the salary row (4 excluded, 6/7 duplicates skipped)


async def test_signed_amount_and_type_columns(client):
    h = await register(client)
    acc = await new_account(client, h)
    csv_text = "Txn Date,Description,Amount,Dr/Cr\n2026-11-01,Rent,15000,DR\n2026-11-02,Refund,200,CR\n"
    rows = (await preview(client, h, acc, csv_text)).json()["rows"]
    assert [r["direction"] for r in rows] == ["debit", "credit"]
    signed = "Date,Description,Amount\n2026-11-01,Coffee,-120\n2026-11-02,Cashback,50\n"
    rows = (await preview(client, h, acc, signed)).json()["rows"]
    assert [r["direction"] for r in rows] == ["debit", "credit"]
    rows = (await preview(client, h, acc, "Date,Description,Amount\n2026-11-01,Coffee,120\n",
                          sign_convention="positive_is_debit")).json()["rows"]
    assert rows[0]["direction"] == "debit"


async def test_xlsx_import(client):
    from openpyxl import Workbook

    h = await register(client)
    acc = await new_account(client, h)
    wb = Workbook()
    ws = wb.active
    ws.append(["Bank statement (synthetic)"])
    ws.append(["Value Date", "Particulars", "Debit", "Credit"])
    ws.append([date(2026, 11, 5), "NETFLIX SUBSCRIPTION", 649.0, None])
    ws.append([date(2026, 11, 6), "INTEREST", None, 12.34])
    buf = io.BytesIO()
    wb.save(buf)
    r = await preview(client, h, acc, buf.getvalue(), filename="stmt.xlsx")
    assert r.status_code == 201, r.text
    rows = r.json()["rows"]
    assert r.json()["format"] == "xlsx"
    assert rows[0]["amount_paise"] == 64_900 and rows[0]["category"] == "Subscriptions"
    assert rows[1]["amount_paise"] == 1_234 and rows[1]["direction"] == "credit"


async def test_import_rejects_bad_files_and_other_users(client):
    h = await register(client)
    acc = await new_account(client, h)
    assert (await preview(client, h, acc, "just,some,text\n1,2,3\n")).status_code == 422
    assert (await preview(client, h, acc, b"PK\x03\x04garbage", filename="x.xlsx")).status_code == 422
    assert (await preview(client, h, acc, "x", filename="old.xls")).status_code == 415
    r = await client.post(f"{API}/imports/preview", headers=auth(h), json={
        "account_id": acc, "filename": "a.csv", "content_base64": "%%%not-base64%%%"})
    assert r.status_code == 422
    big = "Date,Description,Amount\n" + "2026-11-01,x,1\n" * 60_000
    assert (await preview(client, h, acc, big)).status_code in (413, 422)
    other = await register(client, "other@example.com")
    assert (await preview(client, other, acc, HDFC_STYLE)).status_code == 404
    b = (await preview(client, h, acc, HDFC_STYLE)).json()
    assert (await client.get(f"{API}/imports/{b['id']}", headers=auth(other))).status_code == 404
    assert (await client.post(f"{API}/imports/{b['id']}/commit", headers=auth(other), json={})).status_code == 404
