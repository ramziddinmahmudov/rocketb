"""Per-user throttle middleware — rate-limits incoming updates via Redis."""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Update

from app.services.redis_service import get_redis

logger = logging.getLogger(__name__)


class ThrottleMiddleware(BaseMiddleware):
    """Simple per-user throttle based on Redis TTL keys.

    If the user sends updates faster than the configured rate, the
    extra updates are silently dropped.

    **Usage**::

        dp.update.outer_middleware(ThrottleMiddleware(rate_seconds=1))
    """

    def __init__(self, rate_seconds: int = 1) -> None:
        super().__init__()
        self.rate_seconds = rate_seconds

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        if not isinstance(event, Update):
            return await handler(event, data)

        # Extract user id from the update
        user_id = self._extract_user_id(event)
        if user_id is None:
            return await handler(event, data)

        redis = get_redis()

        if await redis.is_throttled(user_id):
            logger.debug("Throttled user %d", user_id)
            return None  # silently drop

        await redis.set_throttle(user_id, self.rate_seconds)
        return await handler(event, data)

    @staticmethod
    def _extract_user_id(update: Update) -> int | None:
        """Try to get the user ID from any update type."""
        if update.message and update.message.from_user:
            return update.message.from_user.id
        if update.callback_query and update.callback_query.from_user:
            return update.callback_query.from_user.id
        if update.inline_query and update.inline_query.from_user:
            return update.inline_query.from_user.id
        return None
