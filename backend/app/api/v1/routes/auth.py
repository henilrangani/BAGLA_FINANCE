from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, auth_limiter, get_current
from app.core.database import get_db
from app.schemas.auth import ChangePasswordRequest, LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.services import auth_service

router = APIRouter()


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(auth_limiter)])
async def register(payload: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    return await auth_service.register(db, payload.email, payload.password, payload.full_name,
                                       payload.timezone, payload.locale, _ua(request))


@router.post("/login", response_model=TokenPair, dependencies=[Depends(auth_limiter)])
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    return await auth_service.login(db, payload.email, payload.password, _ua(request))


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(auth_limiter)])
async def refresh(payload: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    return await auth_service.refresh(db, payload.refresh_token, _ua(request))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current: CurrentUser = Depends(get_current), db: AsyncSession = Depends(get_db)):
    await auth_service.revoke_session(db, current.session_id)
    await db.commit()


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(current: CurrentUser = Depends(get_current), db: AsyncSession = Depends(get_db)):
    await auth_service.revoke_all(db, current.user.id)
    await db.commit()


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(auth_limiter)])
async def change_password(payload: ChangePasswordRequest, current: CurrentUser = Depends(get_current),
                          db: AsyncSession = Depends(get_db)):
    await auth_service.change_password(db, current.user, current.session_id,
                                       payload.current_password, payload.new_password)
