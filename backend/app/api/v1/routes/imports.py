import base64
import binascii
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import ImportBatch, User
from app.services import imports

router = APIRouter()


class PreviewRequest(BaseModel):
    account_id: UUID
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=4, max_length=960_000)
    # Only used when the file has a single signed Amount column with no Dr/Cr column.
    sign_convention: Literal["negative_is_debit", "positive_is_debit"] = "negative_is_debit"


class CommitRequest(BaseModel):
    exclude_row_numbers: list[int] = Field(default_factory=list, max_length=5000)
    include_duplicate_row_numbers: list[int] = Field(default_factory=list, max_length=5000)


def _batch(b: ImportBatch) -> dict:
    return {"id": b.id, "account_id": b.account_id, "filename": b.filename, "format": b.file_format,
            "status": b.status, "row_count": b.row_count, "error_count": b.error_count,
            "duplicate_count": b.duplicate_count, "imported_count": b.imported_count, "column_map": b.column_map}


@router.post("/preview", status_code=201)
async def preview(payload: PreviewRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        content = base64.b64decode(payload.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "content_base64 is not valid base64") from None
    batch = await imports.preview(db, user, payload.account_id, payload.filename, content, payload.sign_convention)
    return await detail(batch.id, user, db)


@router.get("/{batch_id}")
async def detail(batch_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    b = await imports.get_batch(db, user.id, batch_id)
    rows = await imports.batch_rows(db, b.id)
    return {**_batch(b), "rows": [
        {"row_number": r.row_number, "local_date": r.local_date, "description": r.description,
         "amount_paise": r.amount_paise, "direction": r.direction, "category": r.category,
         "duplicate_of_id": r.duplicate_of_id, "error": r.error, "transaction_id": r.transaction_id}
        for r in rows]}


@router.post("/{batch_id}/commit")
async def commit(batch_id: UUID, payload: CommitRequest, user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    b = await imports.commit(db, user, batch_id, set(payload.exclude_row_numbers),
                             set(payload.include_duplicate_row_numbers))
    return _batch(b)


@router.post("/{batch_id}/cancel")
async def cancel(batch_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    b = await imports.get_batch(db, user.id, batch_id)
    if b.status == "committed":
        raise HTTPException(409, "Already committed; void individual entries instead")
    b.status = "cancelled"
    await db.commit()
    return _batch(b)
