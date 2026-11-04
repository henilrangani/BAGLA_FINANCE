import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.models import AuthSession, FinancialAccount, User

INVALID = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _issue(db: AsyncSession, user: User, user_agent: str | None) -> dict:
    s = get_settings()
    token = new_refresh_token()
    session = AuthSession(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(token),
        expires_at=_now() + timedelta(days=s.refresh_token_days),
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(session)
    await db.flush()
    return {
        "session": session,
        "tokens": {
            "access_token": create_access_token(user.id, session.id),
            "refresh_token": token,
            "token_type": "bearer",
            "expires_in": s.access_token_minutes * 60,
        },
    }


async def register(db: AsyncSession, email: str, password: str, full_name: str, tz: str, locale: str,
                   user_agent: str | None) -> dict:
    email = email.strip().lower()
    if await db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=email, password_hash=hash_password(password), full_name=full_name.strip(),
                bagla_id="BAGLA-" + secrets.token_hex(5).upper(), timezone=tz, locale=locale)
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists") from None
    # Every user starts with a cash wallet so cash entries have a home.
    db.add(FinancialAccount(user_id=user.id, name="Cash Wallet", account_type="cash", currency="INR"))
    issued = await _issue(db, user, user_agent)
    await db.commit()
    return issued["tokens"]


async def login(db: AsyncSession, email: str, password: str, user_agent: str | None) -> dict:
    s = get_settings()
    user = await db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        verify_password(password, None)  # equalise timing
        raise INVALID
    if user.locked_until and user.locked_until > _now():
        verify_password(password, None)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many failed attempts. Try again later or reset your password.")
    if not user.is_active or not verify_password(password, user.password_hash):
        user.failed_login_count = (user.failed_login_count or 0) + 1
        if user.failed_login_count >= s.login_max_failures:
            user.locked_until = _now() + timedelta(minutes=s.login_lockout_minutes)
            user.failed_login_count = 0
        await db.commit()
        raise INVALID
    user.failed_login_count = 0
    user.locked_until = None
    issued = await _issue(db, user, user_agent)
    await db.commit()
    return issued["tokens"]


async def refresh(db: AsyncSession, refresh_token: str, user_agent: str | None) -> dict:
    session = await db.scalar(select(AuthSession).where(
        AuthSession.refresh_token_hash == hash_refresh_token(refresh_token)).with_for_update())
    bad = HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    if session is None:
        raise bad
    if session.revoked_at is not None:
        # A rotated-out token was presented again: likely stolen. Revoke every session.
        await revoke_all(db, session.user_id)
        await db.commit()
        raise bad
    if session.expires_at <= _now():
        raise bad
    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise bad
    issued = await _issue(db, user, user_agent)
    session.revoked_at = _now()
    session.replaced_by_id = issued["session"].id
    await db.commit()
    return issued["tokens"]


async def revoke_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    await db.execute(update(AuthSession).where(
        AuthSession.id == session_id, AuthSession.revoked_at.is_(None)).values(revoked_at=_now()))


async def revoke_all(db: AsyncSession, user_id: uuid.UUID, except_session: uuid.UUID | None = None) -> None:
    stmt = update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    if except_session:
        stmt = stmt.where(AuthSession.id != except_session)
    await db.execute(stmt.values(revoked_at=_now()))


async def change_password(db: AsyncSession, user: User, session_id: uuid.UUID, current: str, new: str) -> None:
    if not verify_password(current, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if current == new:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be different")
    user.password_hash = hash_password(new)
    await revoke_all(db, user.id, except_session=session_id)
    await db.commit()
