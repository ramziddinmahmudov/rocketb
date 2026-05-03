"""Profile command."""
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import texts
from ..db import ensure_user, get_global_stats, get_top_players, get_user
from ..keyboards import back_to_menu

router = Router(name="profile")


@router.message(Command(commands=["profile", "stats", "me"]))
async def profile_cmd(message: Message):
    u = await get_user(message.from_user.id) or await ensure_user(message.from_user)
    top = await get_top_players(limit=100)
    place = next((i + 1 for i, t in enumerate(top) if t["id"] == u["id"]), None)
    stats = await get_global_stats()
    await message.answer(
        texts.profile_text(u, place=place, total_users=stats["total_users"]),
        reply_markup=back_to_menu(),
    )
