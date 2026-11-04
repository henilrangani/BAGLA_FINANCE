"""Bank statement import: parse → preview → user review → commit.

Nothing reaches the ledger until the user commits a previewed batch. Rows are
never guessed: unparseable dates/amounts are reported as row errors.
Re-importing the same statement can't duplicate entries: each row gets a
deterministic idempotency key (account + date + direction + amount +
description + occurrence), enforced by the ledger's unique constraint.
"""
import csv
import hashlib
import io
import re
import uuid
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ImportBatch, ImportRow, Transaction, User
from app.services.ledger import audit, conflict, get_account, not_found, snapshot

MAX_FILE_BYTES = 700_000
MAX_ROWS = 5_000
MAX_PAISE = 1_000_000_000_000

HEADERS = {
    "date": ["date", "txn date", "transaction date", "value date", "tran date", "posting date", "value dt"],
    "description": ["description", "narration", "particulars", "remarks", "details", "transaction details",
                    "transaction remarks", "merchant"],
    "debit": ["debit", "withdrawal", "withdrawal amt", "withdrawal amount", "dr", "debit amount", "withdrawals"],
    "credit": ["credit", "deposit", "deposit amt", "deposit amount", "cr", "credit amount", "deposits"],
    "amount": ["amount", "transaction amount", "amt"],
    "type": ["type", "dr/cr", "cr/dr", "transaction type", "debit/credit"],
    "category": ["category"],
}
CATEGORY_RULES = [
    ("Food", r"swiggy|zomato|restaurant|cafe|dominos|pizza|hotel|food"),
    ("Groceries", r"bigbasket|blinkit|zepto|instamart|dmart|grocery|kirana|reliance fresh"),
    ("Transport", r"uber|ola|rapido|irctc|metro|fuel|petrol|hpcl|bpcl|iocl|fastag"),
    ("Shopping", r"amazon|flipkart|myntra|ajio|meesho|nykaa"),
    ("Bills", r"electricity|bescom|msedcl|torrent|airtel|jio|vodafone|\bvi\b|broadband|recharge|gas bill|water bill"),
    ("Subscriptions", r"netflix|hotstar|prime video|spotify|youtube premium|zee5|sonyliv"),
    ("Healthcare", r"pharmacy|apollo|medplus|hospital|clinic|1mg|pharmeasy"),
    ("Salary", r"salary|sal cr|payroll"),
]
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov",
                                      "dec"], start=1)}


class RowError(ValueError):
    pass


def _norm_header(h: object) -> str:
    s = str(h or "").strip().lower()
    s = re.sub(r"\(.*?\)|\.|₹|\binr\b|\brs\b", " ", s)  # word-bounded: "Particulars" must survive
    return re.sub(r"\s+", " ", s).strip()


def parse_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value or "").strip()
    if not s:
        raise RowError("missing date")
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?", s)
    try:
        if m:
            return date(int(m[1]), int(m[2]), int(m[3]))
        m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})", s)  # Indian: day first
        if m:
            y = int(m[3]) + (2000 if len(m[3]) == 2 else 0)
            return date(y, int(m[2]), int(m[1]))
        m = re.fullmatch(r"(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/,-]+(\d{2}|\d{4})", s)
        if m and m[2].lower() in MONTHS:
            y = int(m[3]) + (2000 if len(m[3]) == 2 else 0)
            return date(y, MONTHS[m[2].lower()], int(m[1]))
    except ValueError:
        raise RowError(f"invalid date '{s}'") from None
    raise RowError(f"unrecognised date '{s}'")


def parse_amount(value: object) -> tuple[int, str | None]:
    """Returns (signed paise, explicit direction from a Dr/Cr suffix or None). 0 = empty cell."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return 0, None
    if isinstance(value, bool):
        raise RowError("invalid amount")
    if isinstance(value, (int, float, Decimal)):
        d = Decimal(str(value))
        q = d.quantize(Decimal("0.01"))
        if abs(d - q) > Decimal("0.000001"):
            raise RowError(f"amount {value} has more than 2 decimal places")
        paise = int(q * 100)
    else:
        s = str(value).strip()
        direction = None
        m = re.search(r"\s*\b(dr|cr)\.?$", s, re.I)
        if m:
            direction = "debit" if m[1].lower() == "dr" else "credit"
            s = s[: m.start()]
        negative = s.startswith("-") or (s.startswith("(") and s.endswith(")"))
        s = re.sub(r"[()₹,\s]|rs\.?|inr", "", s, flags=re.I).lstrip("-+")
        if not re.fullmatch(r"\d+(\.\d{1,2})?", s):
            raise RowError(f"invalid amount '{value}'")
        try:
            paise = int((Decimal(s) * 100).to_integral_value())
        except InvalidOperation:
            raise RowError(f"invalid amount '{value}'") from None
        paise = -paise if negative else paise
        if abs(paise) > MAX_PAISE:
            raise RowError("amount too large")
        return paise, direction
    if abs(paise) > MAX_PAISE:
        raise RowError("amount too large")
    return paise, None


def categorise(description: str) -> str | None:
    d = description.lower()
    for cat, pattern in CATEGORY_RULES:
        if re.search(pattern, d):
            return cat
    return None


def read_table(content: bytes, filename: str) -> tuple[list[list[object]], str]:
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_FILE_BYTES // 1000} KB)")
    if content[:4] == b"PK\x03\x04":  # XLSX (zip container)
        import defusedxml  # noqa: F401  # openpyxl uses it automatically when installed (XXE protection)
        from openpyxl import load_workbook

        try:
            wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception:
            raise HTTPException(422, "Could not read the Excel file") from None
        ws = wb.worksheets[0]
        rows = []
        for i, r in enumerate(ws.iter_rows(values_only=True)):
            if i > MAX_ROWS + 20:
                break
            rows.append(list(r))
        wb.close()
        return rows, "xlsx"
    if filename.lower().endswith((".xls",)):
        raise HTTPException(415, "Old .xls files aren't supported; save as .xlsx or .csv")
    for enc in ("utf-8-sig", "cp1252"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise HTTPException(422, "Unreadable text encoding")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect)], "csv"


def detect_columns(rows: list[list[object]]) -> tuple[int, dict[str, int]]:
    """Find the header row (bank exports often start with account details)."""
    for idx, row in enumerate(rows[:25]):
        names = [_norm_header(c) for c in row]
        cmap: dict[str, int] = {}
        for key, options in HEADERS.items():
            for i, n in enumerate(names):
                if n in options and key not in cmap:
                    cmap[key] = i
        if "date" in cmap and ("amount" in cmap or "debit" in cmap or "credit" in cmap):
            return idx, cmap
    raise HTTPException(422, "Couldn't find the header row. Expected columns like Date, Description/Narration, "
                             "and Amount or Debit/Credit.")


def parse_rows(rows: list[list[object]], sign_convention: str) -> tuple[dict[str, int], list[dict]]:
    header_idx, cmap = detect_columns(rows)
    out = []
    for n, row in enumerate(rows[header_idx + 1:], start=header_idx + 2):
        if not any(str(c or "").strip() for c in row):
            continue
        if len(out) >= MAX_ROWS:
            raise HTTPException(413, f"Too many rows (max {MAX_ROWS})")

        def cell(key, row=row):
            i = cmap.get(key)
            return row[i] if i is not None and i < len(row) else None

        rec = {"row_number": n, "description": str(cell("description") or "").strip()[:500],
               "category": (str(cell("category")).strip()[:80] if cell("category") else None)}
        try:
            rec["local_date"] = parse_date(cell("date"))
            debit, d_dir = parse_amount(cell("debit"))
            credit, c_dir = parse_amount(cell("credit"))
            amount, a_dir = parse_amount(cell("amount"))
            type_cell = str(cell("type") or "").strip().lower()
            if debit and credit:
                raise RowError("both debit and credit filled")
            if debit:
                rec["direction"], paise = "debit", abs(debit)
            elif credit:
                rec["direction"], paise = "credit", abs(credit)
            elif amount:
                paise = abs(amount)
                if type_cell in ("dr", "debit", "d", "withdrawal"):
                    rec["direction"] = "debit"
                elif type_cell in ("cr", "credit", "c", "deposit"):
                    rec["direction"] = "credit"
                elif a_dir:
                    rec["direction"] = a_dir
                elif sign_convention == "positive_is_debit":
                    rec["direction"] = "credit" if amount < 0 else "debit"
                else:
                    rec["direction"] = "debit" if amount < 0 else "credit"
            else:
                raise RowError("no amount")
            if paise <= 0:
                raise RowError("amount must be greater than zero")
            rec["amount_paise"] = paise
            rec["category"] = rec["category"] or categorise(rec["description"])
        except RowError as e:
            rec["error"] = str(e)
        out.append(rec)
    return cmap, out


def _dedupe_keys(account_id: uuid.UUID, rows: list[dict]) -> None:
    seen: Counter[str] = Counter()
    for r in rows:
        if r.get("error"):
            continue
        desc = re.sub(r"\s+", " ", r["description"].lower()).strip()
        base = f"{account_id}|{r['local_date']}|{r['direction']}|{r['amount_paise']}|{desc}"
        seen[base] += 1
        r["dedupe_key"] = "imp:" + hashlib.sha256(f"{base}|{seen[base]}".encode()).hexdigest()[:48]


async def preview(db: AsyncSession, user: User, account_id: uuid.UUID, filename: str, content: bytes,
                  sign_convention: str) -> ImportBatch:
    acc = await get_account(db, user.id, account_id)
    if acc.is_archived:
        raise conflict("Account is archived")
    table, fmt = read_table(content, filename)
    cmap, rows = parse_rows(table, sign_convention)
    _dedupe_keys(acc.id, rows)

    existing = list(await db.scalars(select(Transaction).where(
        Transaction.user_id == user.id, Transaction.account_id == acc.id, Transaction.status != "void")))
    by_key = {t.idempotency_key: t for t in existing if t.idempotency_key}
    by_sig = {}
    for t in existing:
        by_sig.setdefault((t.local_date, t.direction, t.amount_paise), t)

    batch = ImportBatch(user_id=user.id, account_id=acc.id, filename=filename[:255],
                        file_sha256=hashlib.sha256(content).hexdigest(), file_format=fmt,
                        column_map=cmap, row_count=len(rows))
    db.add(batch)
    await db.flush()
    for r in rows:
        dup = None
        if not r.get("error"):
            dup = by_key.get(r["dedupe_key"]) or by_sig.get((r["local_date"], r["direction"], r["amount_paise"]))
        db.add(ImportRow(batch_id=batch.id, row_number=r["row_number"], local_date=r.get("local_date"),
                         description=r["description"], amount_paise=r.get("amount_paise"),
                         direction=r.get("direction"), category=r.get("category"), dedupe_key=r.get("dedupe_key"),
                         duplicate_of_id=dup.id if dup else None, error=r.get("error")))
    batch.error_count = sum(1 for r in rows if r.get("error"))
    await db.flush()
    batch.duplicate_count = len([1 for r in await batch_rows(db, batch.id) if r.duplicate_of_id])
    await db.commit()
    return batch


async def get_batch(db: AsyncSession, user_id: uuid.UUID, batch_id: uuid.UUID) -> ImportBatch:
    b = await db.scalar(select(ImportBatch).where(ImportBatch.id == batch_id, ImportBatch.user_id == user_id))
    if b is None:
        raise not_found("Import not found")
    return b


async def batch_rows(db: AsyncSession, batch_id: uuid.UUID) -> list[ImportRow]:
    return list(await db.scalars(select(ImportRow).where(ImportRow.batch_id == batch_id)
                                 .order_by(ImportRow.row_number)))


async def commit(db: AsyncSession, user: User, batch_id: uuid.UUID, exclude: set[int],
                 include_duplicates: set[int]) -> ImportBatch:
    batch = await get_batch(db, user.id, batch_id)
    if batch.status == "committed":
        return batch  # safe retry
    if batch.status != "preview":
        raise conflict("This import was cancelled")
    acc = await get_account(db, user.id, batch.account_id)
    keys_present = set(await db.scalars(select(Transaction.idempotency_key).where(
        Transaction.user_id == user.id, Transaction.idempotency_key.like("imp:%"))))
    created = 0
    from datetime import time, timezone
    from zoneinfo import ZoneInfo

    for r in await batch_rows(db, batch.id):
        if r.error or r.row_number in exclude:
            continue
        if r.duplicate_of_id and r.row_number not in include_duplicates:
            continue
        if r.dedupe_key in keys_present:
            continue  # already imported earlier (same statement re-uploaded)
        when = datetime.combine(r.local_date, time(12, 0), ZoneInfo(user.timezone)).astimezone(timezone.utc)
        tx = Transaction(
            user_id=user.id, account_id=acc.id, amount_paise=r.amount_paise, currency=acc.currency,
            direction=r.direction, kind="expense" if r.direction == "debit" else "income", status="posted",
            description=r.description or "Imported entry", category=r.category, occurred_at=when,
            local_date=r.local_date, timezone=user.timezone, source="import",
            source_ref=f"{batch.filename}#row{r.row_number}"[:255], idempotency_key=r.dedupe_key,
            needs_review=r.category is None, import_batch_id=batch.id,
        )
        db.add(tx)
        await db.flush()
        r.transaction_id = tx.id
        keys_present.add(r.dedupe_key)
        audit(db, user.id, "transaction", tx.id, "create", None, snapshot(tx))
        created += 1
    batch.status = "committed"
    batch.imported_count = created
    audit(db, user.id, "import_batch", batch.id, "commit", None, {"imported": created})
    await db.commit()
    return batch
