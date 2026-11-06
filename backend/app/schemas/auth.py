from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from .common import TimeZoneName


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    full_name: str = Field(min_length=1, max_length=160)
    timezone: TimeZoneName = "Asia/Kolkata"
    locale: Literal["en", "hi", "gu"] = "en"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    # Omitted by the browser app, which sends the HttpOnly cookie instead.
    refresh_token: str | None = Field(default=None, min_length=20, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class TokenPair(BaseModel):
    access_token: str
    # None for browser (cookie) sessions: the refresh token is only ever in the HttpOnly cookie.
    refresh_token: str | None = None
    token_type: str = "bearer"  # noqa: S105 (OAuth token type, not a secret)
    expires_in: int  # seconds until the access token expires
