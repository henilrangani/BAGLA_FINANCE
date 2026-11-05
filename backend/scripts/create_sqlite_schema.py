"""Create a fresh schema in a local SQLite file for browser (E2E) tests.

Dev/test only: refuses anything that isn't a sqlite URL, so it can never touch a real
database. PostgreSQL databases are created with `alembic upgrade head`.
Usage: python scripts/create_sqlite_schema.py sqlite+aiosqlite:///path/to/e2e.db
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.models import Base  # noqa: E402


async def main(url: str) -> None:
    if not url.startswith("sqlite+aiosqlite:///"):
        raise SystemExit("Refusing: this script only creates local SQLite test databases")
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
