from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from .common import Currency, SignedPaise

AccountType = Literal["bank", "cash", "savings", "credit_card", "wallet", "loan", "investment", "other"]


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    account_type: AccountType
    # May be negative for credit cards / loans (money owed).
    opening_balance_paise: SignedPaise = 0
    currency: Currency = "INR"

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    is_archived: bool | None = None


class AccountResponse(BaseModel):
    id: UUID
    name: str
    account_type: str
    currency: str
    opening_balance_paise: int
    balance_paise: int  # derived: opening + posted credits - posted debits
    pending_paise: int  # net of pending entries (not in balance)
    is_archived: bool
