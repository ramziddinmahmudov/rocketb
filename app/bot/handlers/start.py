"""/start handler — user registration and referral processing."""

from __future__ import annotations

import logging

from aiogram import Router, types
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import URLInputFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.keyboards.inline import main_menu_kb
from app.services import user_service
from app.config.settings import settings

router = Router(name="start")
logger = logging.getLogger(__name__)

PROMO_TEXT = (
    "<b>What is Rocket Battle?</b>\n"
    "It's not just a game. It's a <b>flex</b>. "
    "Earn rockets. Hold them. Watch your empire grow "
    "while you sleep like a boss.\n\n"
    "<b>Need help or have questions?</b>\n"
    "💬 Message @rocketbattleebot, we've got you covered!\n\n"
    "<b>Ready to fly?</b>\n"
    "🚀 Just tap the <b>Play</b> button!"
)


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
    start_param: str | None = None

    if command.args:
        start_param = command.args
        if command.args.isdigit():
            try:
                referrer_id = int(command.args)
            except ValueError:
                pass

    user, created = await user_service.get_or_create_user(
        session,
        user_id=message.from_user.id,
        username=message.from_user.username,
        referrer_id=referrer_id,
    )
    await session.commit()

    photo = URLInputFile(f"{settings.WEBAPP_URL}/splash.png")

    if created and referrer_id:
        await message.answer_photo(
            photo=photo,
            caption=(
                f"🚀 <b>Welcome to Rocket Battle!</b>\n\n"
                f"You've been invited by a friend!\n"
                f"🎁 +10 bonus rockets for you and your referrer.\n"
                f"Your balance: <b>{user.balance} 🚀</b>\n\n"
                f"{PROMO_TEXT}"
            ),
            parse_mode="HTML",
            reply_markup=main_menu_kb(start_param),
        )
    elif created:
        await message.answer_photo(
            photo=photo,
            caption=(
                f"🚀 <b>Welcome to Rocket Battle!</b>\n\n"
                f"You start with <b>{user.balance} 🚀</b> rockets.\n\n"
                f"{PROMO_TEXT}"
            ),
            parse_mode="HTML",
            reply_markup=main_menu_kb(start_param),
        )
    else:
        await message.answer_photo(
            photo=photo,
            caption=(
                f"🚀 <b>Welcome back!</b>\n\n"
                f"Your balance: <b>{user.balance} 🚀</b>\n\n"
                f"{PROMO_TEXT}"
            ),
            parse_mode="HTML",
            reply_markup=main_menu_kb(start_param),
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

    photo = URLInputFile(f"{settings.WEBAPP_URL}/splash.png")

    if created:
        await message.answer_photo(
            photo=photo,
            caption=(
                f"🚀 <b>Welcome to Rocket Battle!</b>\n\n"
                f"You start with <b>{user.balance} 🚀</b> rockets.\n\n"
                f"{PROMO_TEXT}"
            ),
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )
    else:
        await message.answer_photo(
            photo=photo,
            caption=(
                f"🚀 <b>Welcome back!</b>\n\n"
                f"Your balance: <b>{user.balance} 🚀</b>\n\n"
                f"{PROMO_TEXT}"
            ),
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )
