"""Logging middleware."""

from __future__ import annotations

import logging
import time
from typing import Any, Awaitable, Callable, Dict

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Update

logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseMiddleware):
    """Log incoming updates."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any],
    ) -> Any:
        """Log the update before passing it to the handler."""
        start_time = time.time()
        
        # Determine event type and user
        event_type = "Update"
        user_id = "Unknown"
        username = "Unknown"

        if isinstance(event, Update):
            if event.message:
                event_type = "Message"
                user_id = event.message.from_user.id
                username = event.message.from_user.username
                content = f"text='{event.message.text}'" if event.message.text else "content=Other"
            elif event.callback_query:
                event_type = "CallbackQuery"
                user_id = event.callback_query.from_user.id
                username = event.callback_query.from_user.username
                content = f"data='{event.callback_query.data}'"
            elif event.inline_query:
                event_type = "InlineQuery"
                user_id = event.inline_query.from_user.id
                username = event.inline_query.from_user.username
                content = f"query='{event.inline_query.query}'"
            else:
                content = "type=Other"
        else:
             content = "type=Non-Update"

        logger.info(
            "%s | User: %s (%s) | %s",
            event_type, user_id, username, content
        )

        try:
            result = await handler(event, data)
            duration = (time.time() - start_time) * 1000
            logger.info("Handled in %.2f ms", duration)
            return result
        except Exception as e:
            logger.error("Handler error: %s", e)
            raise
