"""Database session middleware — injects AsyncSession into handler data."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject





class DbSessionMiddleware(BaseMiddleware):
    """Provide a fresh ``AsyncSession`` to each handler.

    The session is available as ``data["session"]`` inside the handler
    and is automatically closed after the handler returns.

    **Usage**::

        dp.update.outer_middleware(DbSessionMiddleware(session_factory))
    """

    def __init__(self, session_factory):
        super().__init__()
        self.session_factory = session_factory

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        async with self.session_factory() as session:
            data["session"] = session
            try:
                result = await handler(event, data)
                return result
            except Exception:
                await session.rollback()
                raise

