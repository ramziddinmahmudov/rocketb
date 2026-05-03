"""Custom filters."""
from aiogram.filters import Filter
from aiogram.types import CallbackQuery, Message

from .db import is_admin


class AdminFilter(Filter):
    """Allow only users that are in ADMIN_IDS env or have is_admin=True in DB."""

    async def __call__(self, event: Message | CallbackQuery) -> bool:
        user = event.from_user
        if not user:
            return False
        return await is_admin(user.id)
