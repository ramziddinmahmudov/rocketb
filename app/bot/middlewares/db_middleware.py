"""Database session middleware — injects AsyncSession into handler data."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from app.database.base import async_session_factory


class DbSessionMiddleware(BaseMiddleware):
    """Provide a fresh ``AsyncSession`` to each handler.

    The session is available as ``data["session"]`` inside the handler
    and is automatically closed after the handler returns.

    **Usage** (in the router/dispatcher setup)::

        dp.update.outer_middleware(DbSessionMiddleware())
    """

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        if async_session_factory is None:
            raise RuntimeError(
                "Database not initialised — call setup_database() first."
            )

        async with async_session_factory() as session:
            data["session"] = session
            try:
                result = await handler(event, data)
                return result
            except Exception:
                await session.rollback()
                raise
