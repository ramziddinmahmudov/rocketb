"""Database engine, session factory, and declarative base."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


# ── Global references (initialised at startup) ───────────────
engine: AsyncEngine | None = None
async_session_factory: async_sessionmaker[AsyncSession] | None = None


def setup_database(database_url: str) -> async_sessionmaker[AsyncSession]:
    """Create the async engine and session factory.

    Call once at application startup.  Returns the session factory and
    also stores it in the module-level ``async_session_factory`` global
    so that middlewares / services can import it directly.
    """
    global engine, async_session_factory

    engine = create_async_engine(
        database_url,
        echo=False,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
    )

    async_session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    return async_session_factory


async def close_database() -> None:
    """Dispose of the engine connection pool.  Call on shutdown."""
    global engine, async_session_factory
    if engine is not None:
        await engine.dispose()
        engine = None
        async_session_factory = None
