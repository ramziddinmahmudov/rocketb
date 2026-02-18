"""bot.py — Standalone Telegram Bot runner with WebApp inline button.

This file provides the /start command with an inline keyboard
containing a "🚀 Start Battle" button that opens the Telegram Mini App.

Usage:
    python bot.py

Environment variables:
    BOT_TOKEN   — Telegram Bot API token (from @BotFather)
    WEBAPP_URL  — Public URL of the Frontend (e.g. https://yourdomain.com)
                  This is the URL Telegram opens inside the Mini App.
                  For local testing: use ngrok/localtunnel to expose port 80.
"""

from __future__ import annotations

import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F, Router, types
from aiogram.enums import ParseMode
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from aiogram.client.default import DefaultBotProperties
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.bot.middlewares.db_middleware import DbSessionMiddleware
from app.bot.middlewares.throttle_middleware import ThrottleMiddleware
from app.config.settings import settings
from app.database.base import Base, close_database, setup_database
from app.services import user_service
from app.services.redis_service import close_redis, setup_redis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ── Router ────────────────────────────────────────────────
router = Router(name="bot_main")

# Read WEBAPP_URL from environment (set in .env or docker-compose)
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://yourdomain.com")


def get_start_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Build the /start inline keyboard with WebApp button."""
    builder = InlineKeyboardBuilder()

    # 🚀 Main action — opens the Mini App
    builder.row(
        InlineKeyboardButton(
            text="🚀 Start Battle",
            web_app=WebAppInfo(url=WEBAPP_URL),
        ),
    )

    # Secondary actions
    builder.row(
        InlineKeyboardButton(text="📊 Balance", callback_data="balance"),
        InlineKeyboardButton(text="🏪 Store", callback_data="store"),
    )
    builder.row(
        InlineKeyboardButton(text="👑 Buy VIP", callback_data="buy_vip"),
        InlineKeyboardButton(
            text="🔗 Invite Friend",
            switch_inline_query=f"Join me in Rocket Battle! 🚀",
        ),
    )
    builder.row(
        InlineKeyboardButton(
            text="📋 Referral Link",
            callback_data="referral_link",
        ),
    )

    return builder.as_markup()


# ── /start handler ────────────────────────────────────────


@router.message(CommandStart(deep_link=True))
async def cmd_start_deeplink(
    message: types.Message,
    command: CommandObject,
    session,
) -> None:
    """Handle /start with referral deep link."""
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
        text = (
            f"🚀 <b>Welcome to Rocket Battle!</b>\n\n"
            f"You've been invited by a friend!\n"
            f"🎁 <b>+10 bonus rockets</b> for you and your referrer.\n\n"
            f"Your balance: <b>{user.balance} 🚀</b>\n\n"
            f"Tap <b>Start Battle</b> to join the arena! ⚔️"
        )
    elif created:
        text = (
            f"🚀 <b>Welcome to Rocket Battle!</b>\n\n"
            f"You start with <b>{user.balance} 🚀</b> rockets.\n\n"
            f"Tap <b>Start Battle</b> to launch your first attack! ⚔️"
        )
    else:
        text = (
            f"🚀 <b>Welcome back!</b>\n\n"
            f"Your balance: <b>{user.balance} 🚀</b>\n\n"
            f"Ready for another battle? 💥"
        )

    await message.answer(
        text,
        parse_mode="HTML",
        reply_markup=get_start_keyboard(message.from_user.id),
    )


@router.message(CommandStart())
async def cmd_start(message: types.Message, session) -> None:
    """Handle plain /start (no deep link)."""
    user, created = await user_service.get_or_create_user(
        session,
        user_id=message.from_user.id,
        username=message.from_user.username,
    )
    await session.commit()

    text = (
        f"🚀 <b>Welcome{'!' if created else ' back!'}</b>\n\n"
        f"Your balance: <b>{user.balance} 🚀</b>\n\n"
        f"Tap <b>Start Battle</b> to enter the arena! ⚔️"
    )

    await message.answer(
        text,
        parse_mode="HTML",
        reply_markup=get_start_keyboard(message.from_user.id),
    )


# ── Referral link callback ────────────────────────────────


@router.callback_query(F.data == "referral_link")
async def cb_referral_link(callback: types.CallbackQuery) -> None:
    """Show the user's referral link."""
    await callback.answer()
    bot_info = await callback.bot.get_me()
    link = f"https://t.me/{bot_info.username}?start={callback.from_user.id}"

    await callback.message.answer(
        f"🔗 <b>Your Referral Link:</b>\n\n"
        f"<code>{link}</code>\n\n"
        f"Share it and earn <b>+10 🚀</b> for each new friend!",
        parse_mode="HTML",
    )


# ── Main ──────────────────────────────────────────────────


async def main() -> None:
    """Start the bot (polling mode)."""
    logger.info("Initialising database…")
    session_factory = setup_database(settings.DATABASE_URL)

    from app.database.base import engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Initialising Redis…")
    setup_redis(settings.REDIS_URL)

    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()

    # Middlewares
    dp.update.outer_middleware(DbSessionMiddleware(session_factory))
    dp.update.outer_middleware(ThrottleMiddleware(rate_seconds=1))

    # Include this file's router + all existing handlers
    dp.include_router(router)

    from app.bot.handlers import balance, payment
    dp.include_router(balance.router)
    dp.include_router(payment.router)

    logger.info("Bot starting… (WEBAPP_URL=%s)", WEBAPP_URL)

    try:
        await dp.start_polling(
            bot,
            allowed_updates=dp.resolve_used_update_types(),
        )
    finally:
        await bot.session.close()
        await close_database()
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
