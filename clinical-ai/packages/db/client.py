from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
import os

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from packages.db.models.base import Base

# ── Module-level singletons — created once at startup ─────────────────────────
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_db(database_url: str, pool_size: int = 10, max_overflow: int = 20) -> None:
    """
    Call once at application startup.
    Creates the engine and session factory.
    Never call this more than once.
    """
    global _engine, _session_factory

    engine_kwargs = {
        "pool_pre_ping": True,
        "echo": False,
    }
    if os.getenv("PYTEST_CURRENT_TEST"):
        engine_kwargs["poolclass"] = NullPool
    else:
        engine_kwargs["pool_size"] = pool_size
        engine_kwargs["max_overflow"] = max_overflow

    _engine = create_async_engine(database_url, **engine_kwargs)

    _session_factory = async_sessionmaker(
        bind=_engine,
        class_=AsyncSession,
        expire_on_commit=False,     # objects remain usable after commit
        autoflush=False,
        autocommit=False,
    )


async def close_db() -> None:
    """
    Call once at application shutdown.
    Disposes the connection pool cleanly.
    """
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


def get_engine() -> AsyncEngine:
    if _engine is None:
        raise RuntimeError("Database not initialised. Call init_db() first.")
    return _engine


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager — use in services and workers.

    Usage:
        async with get_session() as session:
            result = await session.execute(...)
    """
    if _session_factory is None:
        database_url = os.getenv("DATABASE_URL", "").strip()
        if not database_url:
            raise RuntimeError("Database not initialised. Call init_db() first.")
        init_db(database_url=database_url)

    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_session_dependency() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency injection version.
    Use this in api/dependencies.py only.

    Usage:
        async def my_route(session: AsyncSession = Depends(get_session_dependency)):
    """
    async with get_session() as session:
        yield session
