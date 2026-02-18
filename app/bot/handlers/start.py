"""/start handler — user registration and referral processing."""

from __future__ import annotations

import logging

from aiogram import Router, types
from aiogram.filters import CommandObject, CommandStart
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.keyboards.inline import main_menu_kb
from app.services import user_service

router = Router(name="start")
logger = logging.getLogger(__name__)


@router.message(CommandStart(deep_link=True))
async def cmd_start_deeplink(
    message: types.Message,
    command: CommandObject,
    session: AsyncSession,
) -> None:
    """Handle ``/start <referral_id>``."""
    referrer_id: int | None = None
    if command.args:
        try:
            referrer_id = int(command.args)
        except ValueError:
            referrer_id = None

    user, created = await user_service.get_or_create_user(
        session,
        user_id=message.from_user.id,
        username=message.from_user.username,
        referrer_id=referrer_id,
    )
    await session.commit()

    if created and referrer_id:
        await message.answer(
            f"🚀 <b>Welcome to Rocket Battle!</b>\n\n"
            f"You've been invited by a friend!\n"
            f"🎁 +10 bonus rockets for you and your referrer.\n\n"
            f"Your balance: <b>{user.balance} 🚀</b>",
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )
    elif created:
        await message.answer(
            f"🚀 <b>Welcome to Rocket Battle!</b>\n\n"
            f"You start with <b>{user.balance} 🚀</b> rockets.\n"
            f"Join a battle and show your power!",
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )
    else:
        await message.answer(
            f"🚀 <b>Welcome back!</b>\n\n"
            f"Your balance: <b>{user.balance} 🚀</b>",
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )

    logger.info(
        "/start user=%d created=%s referrer=%s",
        message.from_user.id, created, referrer_id,
    )


@router.message(CommandStart())
async def cmd_start(
    message: types.Message,
    session: AsyncSession,
) -> None:
    """Handle plain ``/start`` (no deep link)."""
    user, created = await user_service.get_or_create_user(
        session,
        user_id=message.from_user.id,
        username=message.from_user.username,
    )
    await session.commit()

    if created:
        await message.answer(
            f"🚀 <b>Welcome to Rocket Battle!</b>\n\n"
            f"You start with <b>{user.balance} 🚀</b> rockets.\n"
            f"Join a battle and show your power!",
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )
    else:
        await message.answer(
            f"🚀 <b>Welcome back!</b>\n\n"
            f"Your balance: <b>{user.balance} 🚀</b>",
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )
