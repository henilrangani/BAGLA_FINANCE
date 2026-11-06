from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_WEAK_SECRETS = {"", "change-me", "changeme", "secret", "replace-me", "dev-secret"}


class Settings(BaseSettings):
    app_name: str = "Bagla Finance API"
    environment: str = "development"  # development | test | staging | production
    # Auth attempts (register/login/refresh/change-password) per IP per 15 minutes. Local E2E runs
    # may raise it; staging/production refuse anything looser than the default (see validator).
    auth_rate_limit: int = 20
    database_url: str = "postgresql+asyncpg://bagla:bagla@localhost:5432/bagla_finance"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_body_bytes: int = 1_000_000
    login_max_failures: int = 5
    login_lockout_minutes: int = 15
    # Browser sessions keep the refresh token in an HttpOnly cookie (never readable by page scripts).
    refresh_cookie_name: str = "bagla_rt"
    refresh_cookie_secure: bool = True  # local http E2E may set False; refused in staging/production
    refresh_cookie_samesite: str = "lax"  # lax (API on the same site as the app) | strict | none
    refresh_cookie_domain: str | None = None
    # Two tabs refreshing at the same moment both present the same cookie. Within this window the
    # second gets an access token for the already-rotated session instead of triggering theft lockout.
    refresh_reuse_grace_seconds: int = 20

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("jwt_algorithm")
    @classmethod
    def only_hs256(cls, v: str) -> str:
        if v != "HS256":
            raise ValueError("only HS256 is supported")
        return v

    @model_validator(mode="after")
    def safe_cookie(self):
        if self.refresh_cookie_samesite not in {"lax", "strict", "none"}:
            raise ValueError("REFRESH_COOKIE_SAMESITE must be lax, strict or none")
        if self.is_production and not self.refresh_cookie_secure:
            raise ValueError("REFRESH_COOKIE_SECURE can't be false in staging/production")
        if self.refresh_cookie_samesite == "none" and not self.refresh_cookie_secure:
            raise ValueError("SameSite=None cookies must be Secure")
        if not 0 <= self.refresh_reuse_grace_seconds <= 60:
            raise ValueError("REFRESH_REUSE_GRACE_SECONDS must be 0-60")
        return self

    @model_validator(mode="after")
    def safe_rate_limit(self):
        if self.auth_rate_limit < 1 or (self.is_production and self.auth_rate_limit > 20):
            raise ValueError("AUTH_RATE_LIMIT must be 1-20 in staging/production")
        return self

    @model_validator(mode="after")
    def strong_secret(self):
        if self.jwt_secret.strip().lower() in _WEAK_SECRETS or len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be a random value of at least 32 characters")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment in {"staging", "production"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
