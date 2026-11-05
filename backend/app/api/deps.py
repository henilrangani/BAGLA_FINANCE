import time
import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import AuthSession, User

bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    user: User
    session_id: uuid.UUID


async def get_current(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in",
                                 headers={"WWW-Authenticate": "Bearer"})
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except Exception:
        raise unauthorized from None
    # Checking the session makes logout / password change take effect immediately.
    session = await db.scalar(select(AuthSession).where(
        AuthSession.id == session_id, AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)))
    if session is None:
        raise unauthorized
    user = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        raise unauthorized
    return CurrentUser(user=user, session_id=session_id)


async def get_current_user(current: CurrentUser = Depends(get_current)) -> User:
    return current.user


class RateLimiter:
    """Fixed-window per-IP limiter. In-memory = per process; use Redis when running >1 instance."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit, self.window = limit, window_seconds
        self.hits: dict[str, tuple[int, float]] = {}

    def __call__(self, request: Request) -> None:
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        count, reset = self.hits.get(key, (0, now + self.window))
        if now >= reset:
            count, reset = 0, now + self.window
        count += 1
        if len(self.hits) > 50_000:
            self.hits.clear()
        self.hits[key] = (count, reset)
        if count > self.limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Please wait and try again.",
                                headers={"Retry-After": str(int(reset - now) + 1)})


auth_limiter = RateLimiter(limit=get_settings().auth_rate_limit, window_seconds=15 * 60)
