from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        s = get_settings()
        url = s.app_database_url
        pool = {} if url.startswith("sqlite") else {"pool_size": s.db_pool_size, "max_overflow": s.db_max_overflow,
                                                     "pool_recycle": 1800}
        connect = {"timeout": 30} if url.startswith("sqlite") else {}
        _engine = create_async_engine(url, pool_pre_ping=True, connect_args=connect, **pool)
        if url.startswith("sqlite"):
            # SQLite (tests, local demo): foreign keys on; WAL so readers don't block the writer; and a writer waits
            # up to 30 s for the lock instead of failing at once ("database is locked" under concurrent users).
            @event.listens_for(_engine.sync_engine, "connect")
            def _fk_on(dbapi_conn, _):
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA foreign_keys=ON")
                cur.execute("PRAGMA busy_timeout=30000")
                cur.execute("PRAGMA journal_mode=WAL")
                cur.close()

        _sessionmaker = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    return _engine


async def get_db():
    get_engine()
    if _sessionmaker is None:  # pragma: no cover - defensive; get_engine() always sets it
        raise RuntimeError("database session factory not initialised")
    async with _sessionmaker() as session:
        yield session
