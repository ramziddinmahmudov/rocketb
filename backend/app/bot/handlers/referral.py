"""Invite/referral command."""
from aiogram import Bot, Router
from aiogram.filters import Command
from aiogram.types import Message

from .. import texts
from ..config import BOT_USERNAME
from ..db import count_referrals, ensure_user
from ..keyboards import invite_keyboard

router = Router(name="referral")


@router.message(Command(commands=["invite", "ref"]))
async def invite_cmd(message: Message, bot: Bot):
    await ensure_user(message.from_user)
    username = BOT_USERNAME
    if not username:
        me = await bot.me()
        username = me.username or "your_bot"
    link = f"https://t.me/{username}?start=ref_{message.from_user.id}"
    cnt = await count_referrals(message.from_user.id) or 0
    await message.answer(texts.invite_text(link, cnt), reply_markup=invite_keyboard(link))
