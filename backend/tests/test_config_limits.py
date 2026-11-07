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


def test_one_database_url_works_for_api_and_migrations():
    """DigitalOcean (and most managed Postgres) give ...?sslmode=require; asyncpg needs ssl=, libpq sslmode=."""
    import inspect

    import asyncpg

    s = Settings(jwt_secret=SECRET, database_url="postgresql+asyncpg://u:p%40ss@db.example:25060/beta?sslmode=require")
    assert s.app_database_url == "postgresql+asyncpg://u:p%40ss@db.example:25060/beta?ssl=require"
    assert s.migration_database_url == "postgresql+psycopg://u:p%40ss@db.example:25060/beta?sslmode=require"
    assert "ssl" in inspect.signature(asyncpg.connect).parameters  # what the API engine passes
    s2 = Settings(jwt_secret=SECRET, database_url="postgresql+asyncpg://u:p@h/db?ssl=require&application_name=bagla")
    assert s2.migration_database_url.endswith("?sslmode=require&application_name=bagla")
    s3 = Settings(jwt_secret=SECRET, database_url="postgresql+asyncpg://u:p@h/db")
    assert s3.app_database_url == "postgresql+asyncpg://u:p@h/db"
    lite = Settings(jwt_secret=SECRET, database_url="sqlite+aiosqlite:///x.db")
    assert lite.app_database_url == "sqlite+aiosqlite:///x.db"


def test_database_url_is_required_so_nothing_falls_back_to_the_legacy_database(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError) as e:
        Settings(_env_file=None, jwt_secret=SECRET)
    assert "database_url" in str(e.value)


def test_postgres_test_suite_refuses_a_non_test_database():
    """The PostgreSQL suite drops every table, so it must refuse e.g. the legacy `bagla_finance` database."""
    import os
    import subprocess
    import sys

    env = {**os.environ, "TEST_DATABASE_URL": "postgresql+asyncpg://bagla:x@127.0.0.1:1/bagla_finance"}
    r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/test_money.py"],
                       env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode == 2, r.stdout[-800:]
    assert "Refusing to run the PostgreSQL test suite against database 'bagla_finance'" in r.stdout
