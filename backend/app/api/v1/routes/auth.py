"""Authentication.

Two client styles:
- Browser app (sends `X-Bagla-Client: web`): the refresh token travels only in an HttpOnly,
  Secure, SameSite cookie scoped to /api/v1/auth; response bodies never contain it. The
  cookie-using endpoints (refresh, logout) require the `X-Bagla-CSRF` header, which a
  cross-site form can't send and which forces a CORS preflight, and an allowed Origin.
- API clients (scripts, tests, future mobile): tokens in the JSON body as before.
Access tokens are short-lived bearer tokens held in memory by the client.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, auth_limiter, get_current
from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.auth import ChangePasswordRequest, LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.services import auth_service

router = APIRouter()
WEB_HEADER = "x-bagla-client"
CSRF_HEADER = "x-bagla-csrf"


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _is_web(request: Request) -> bool:
    return request.headers.get(WEB_HEADER) == "web"


def _check_csrf(request: Request) -> None:
    """For endpoints that act on the cookie: require the custom header and an allowed Origin."""
    s = get_settings()
    if request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing CSRF header")
    origin = request.headers.get("origin")
    if origin is not None and origin not in s.cors_origin_list:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Origin not allowed")


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(s.refresh_cookie_name, token, max_age=s.refresh_token_days * 86400, httponly=True,
                        secure=s.refresh_cookie_secure, samesite=s.refresh_cookie_samesite,
                        path="/api/v1/auth", domain=s.refresh_cookie_domain)


def _clear_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(s.refresh_cookie_name, path="/api/v1/auth", domain=s.refresh_cookie_domain,
                           secure=s.refresh_cookie_secure, httponly=True, samesite=s.refresh_cookie_samesite)


def _respond(request: Request, response: Response, tokens: dict) -> dict:
    tokens = {k: v for k, v in tokens.items() if k != "rotated"}
    if _is_web(request):
        if tokens.get("refresh_token"):
            _set_cookie(response, tokens["refresh_token"])
        tokens["refresh_token"] = None
    return tokens


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(auth_limiter)])
async def register(payload: RegisterRequest, request: Request, response: Response,
                   db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.register(db, payload.email, payload.password, payload.full_name,
                                         payload.timezone, payload.locale, _ua(request))
    return _respond(request, response, tokens)


@router.post("/login", response_model=TokenPair, dependencies=[Depends(auth_limiter)])
async def login(payload: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # A fresh session is always issued; any cookie already in the browser is replaced (no fixation).
    tokens = await auth_service.login(db, payload.email, payload.password, _ua(request))
    return _respond(request, response, tokens)


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(auth_limiter)])
async def refresh(request: Request, response: Response, payload: RefreshRequest | None = None,
                  db: AsyncSession = Depends(get_db)):
    token = payload.refresh_token if payload else None
    if token is None:
        _check_csrf(request)
        token = request.cookies.get(get_settings().refresh_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    try:
        tokens = await auth_service.refresh(db, token, _ua(request))
    except HTTPException as e:
        if e.status_code == 401 and payload is None:
            _clear_cookie(response)
            raise HTTPException(401, e.detail, headers={"set-cookie": response.headers.get("set-cookie", "")}) from None
        raise
    return _respond(request, response, tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, current: CurrentUser = Depends(get_current),
                 db: AsyncSession = Depends(get_db)):
    if _is_web(request):
        _check_csrf(request)  # before anything changes: a forged request must not log anyone out
    await auth_service.revoke_session(db, current.session_id)
    await db.commit()
    if _is_web(request):
        _clear_cookie(response)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(request: Request, response: Response, current: CurrentUser = Depends(get_current),
                     db: AsyncSession = Depends(get_db)):
    if _is_web(request):
        _check_csrf(request)  # before anything changes: a forged request must not log anyone out
    await auth_service.revoke_all(db, current.user.id)
    await db.commit()
    if _is_web(request):
        _clear_cookie(response)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(auth_limiter)])
async def change_password(payload: ChangePasswordRequest, current: CurrentUser = Depends(get_current),
                          db: AsyncSession = Depends(get_db)):
    await auth_service.change_password(db, current.user, current.session_id,
                                       payload.current_password, payload.new_password)
