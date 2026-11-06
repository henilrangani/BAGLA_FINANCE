import pytest
from pydantic import ValidationError

from app.core.config import Settings

SECRET = "x" * 40


def test_auth_rate_limit_cannot_be_loosened_in_production():
    assert Settings(jwt_secret=SECRET, environment="development", auth_rate_limit=500).auth_rate_limit == 500
    assert Settings(jwt_secret=SECRET, environment="production", auth_rate_limit=10).auth_rate_limit == 10
    for env in ("production", "staging"):
        with pytest.raises(ValidationError):
            Settings(jwt_secret=SECRET, environment=env, auth_rate_limit=21)
    with pytest.raises(ValidationError):
        Settings(jwt_secret=SECRET, environment="development", auth_rate_limit=0)


def test_refresh_rate_limit_is_bounded_in_production():
    assert Settings(jwt_secret=SECRET, environment="production").refresh_rate_limit == 120
    for env in ("production", "staging"):
        with pytest.raises(ValidationError):
            Settings(jwt_secret=SECRET, environment=env, refresh_rate_limit=301)
    with pytest.raises(ValidationError):
        Settings(jwt_secret=SECRET, environment="development", refresh_rate_limit=0)
