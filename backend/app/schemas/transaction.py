from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from .common import AwareDatetime, PositivePaise, TimeZoneName

# Kinds a client may create directly. Transfers, refunds and reversals have
# dedicated endpoints so their links and invariants are always enforced.
DirectKind = Literal["income", "expense", "savings_contribution", "loan_repayment", "investment", "adjustment"]
ClientSource = Literal["manual", "voice", "receipt", "ai_suggested"]


class TransactionCreate(BaseModel):
    account_id: UUID
    amount_paise: PositivePaise
    kind: DirectKind
    # Required only for kind="adjustment"; otherwise derived from kind.
    direction: Literal["debit", "credit"] | None = None
    description: str = Field(min_length=1, max_length=500)
    merchant: str | None = Field(default=None, max_length=160)
    category: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    occurred_at: AwareDatetime | None = None
    timezone: TimeZoneName | None = None
    status: Literal["pending", "posted"] = "posted"
    source: ClientSource = "manual"
    needs_review: bool = False
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=255)

    @model_validator(mode="after")
    def adjustment_needs_direction(self):
        if self.kind == "adjustment" and self.direction is None:
            raise ValueError("adjustment entries must state direction (debit or credit)")
        if self.kind != "adjustment" and self.direction is not None:
            raise ValueError("direction is derived from kind; only adjustments may set it")
        return self


class TransferCreate(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    amount_paise: PositivePaise
    description: str = Field(default="Transfer", min_length=1, max_length=500)
    occurred_at: AwareDatetime | None = None
    timezone: TimeZoneName | None = None
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=200)

    @model_validator(mode="after")
    def different_accounts(self):
        if self.from_account_id == self.to_account_id:
            raise ValueError("cannot transfer to the same account")
        return self


class RefundCreate(BaseModel):
    amount_paise: PositivePaise
    description: str | None = Field(default=None, max_length=500)
    occurred_at: AwareDatetime | None = None
    timezone: TimeZoneName | None = None
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=255)


class ReverseRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class TransactionUpdate(BaseModel):
    """Edits are allowed but always audited. Kind, account and links can't change:
    void the entry and create a new one instead."""

    amount_paise: PositivePaise | None = None
    description: str | None = Field(default=None, min_length=1, max_length=500)
    merchant: str | None = Field(default=None, max_length=160)
    category: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    occurred_at: AwareDatetime | None = None
    timezone: TimeZoneName | None = None
    status: Literal["pending", "posted"] | None = None
    needs_review: bool | None = None


class TransactionResponse(BaseModel):
    id: UUID
    account_id: UUID
    amount_paise: int
    currency: str
    direction: str
    kind: str
    status: str
    description: str
    merchant: str | None
    category: str | None
    notes: str | None
    occurred_at: datetime
    local_date: date
    timezone: str
    source: str
    source_ref: str | None
    needs_review: bool
    transfer_group_id: UUID | None
    refund_of_id: UUID | None
    reverses_id: UUID | None
    shared_family_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TransactionPage(BaseModel):
    items: list[TransactionResponse]
    next_offset: int | None


class TransferResponse(BaseModel):
    transfer_group_id: UUID
    debit: TransactionResponse
    credit: TransactionResponse
