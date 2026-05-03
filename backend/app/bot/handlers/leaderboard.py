"""Leaderboard command."""
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import texts
from ..db import get_top_players
from ..keyboards import back_to_menu

router = Router(name="leaderboard")


@router.message(Command(commands=["top", "leaderboard"]))
async def top_cmd(message: Message):
    top = await get_top_players(limit=10)
    await message.answer(
        texts.leaderboard_text(top, me_id=message.from_user.id),
        reply_markup=back_to_menu(),
    )
