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
        _engine = create_async_engine(url, pool_pre_ping=True, **pool)
        if url.startswith("sqlite"):
            # SQLite ignores foreign keys unless asked (tests / local only).
            @event.listens_for(_engine.sync_engine, "connect")
            def _fk_on(dbapi_conn, _):
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA foreign_keys=ON")
                cur.close()

        _sessionmaker = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    return _engine


async def get_db():
    get_engine()
    if _sessionmaker is None:  # pragma: no cover - defensive; get_engine() always sets it
        raise RuntimeError("database session factory not initialised")
    async with _sessionmaker() as session:
        yield session
