from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from .common import TimeZoneName


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    bagla_id: str
    timezone: str
    locale: str
    default_currency: str
    email_verified: bool

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    timezone: TimeZoneName | None = None
    locale: Literal["en", "hi", "gu"] | None = None


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    confirm: Literal["DELETE MY ACCOUNT"]
