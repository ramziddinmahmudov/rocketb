"""bot.py — Standalone Telegram Bot runner with WebApp inline button.

This file provides the /start command with an inline keyboard
containing a "🚀 Start Battle" button that opens the Telegram Mini App.
Supports battle room links via deep linking.

Usage:
    python bot.py

Environment variables:
    BOT_TOKEN   — Telegram Bot API token (from @BotFather)
    WEBAPP_URL  — Public URL of the Frontend
"""

from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher, F, Router, types
from aiogram.enums import ParseMode
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from aiogram.client.default import DefaultBotProperties
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.bot.middlewares.db_middleware import DbSessionMiddleware
from app.bot.middlewares.logging_middleware import LoggingMiddleware
from app.bot.middlewares.throttle_middleware import ThrottleMiddleware
from app.config.settings import settings
from app.database.base import Base, close_database, setup_database
from app.services import user_service
from app.services.redis_service import close_redis, setup_redis

import logging.handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.handlers.RotatingFileHandler("bot.log", maxBytes=5*1024*1024, backupCount=2),
    ]
)
logger = logging.getLogger(__name__)

# ── Router ────────────────────────────────────────────────
router = Router(name="bot_main")

WEBAPP_URL = settings.WEBAPP_URL


def get_start_keyboard(user_id: int) -> InlineKeyboardMarkup:
    """Build the /start inline keyboard — single WebApp button."""
    builder = InlineKeyboardBuilder()

    # 🚀 Single action — opens the Mini App directly
    builder.row(
        InlineKeyboardButton(
            text="🚀 Rocket Battle",
            web_app=WebAppInfo(url=WEBAPP_URL),
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
    """Handle /start with referral or room deep link."""
    referrer_id: int | None = None
    room_code: str | None = None

    if command.args:
        args = command.args
        if args.startswith("room_"):
            # Room invite link: /start room_ABCD1234
            room_code = args[5:]
        else:
            try:
                referrer_id = int(args)
            except ValueError:
                referrer_id = None

    user, created = await user_service.get_or_create_user(
        session,
        user_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        referrer_id=referrer_id,
    )
    await session.commit()

    if room_code:
        # User came from a room invite
        text = (
            f"🏟️ <b>Battle xonasiga taklif!</b>\n\n"
            f"Xona kodi: <code>{room_code}</code>\n\n"
            f"Balansingiz: <b>{user.balance} 🚀</b>\n\n"
            f"<b>Battle boshlash</b> tugmasini bosib xonaga qo'shiling! ⚔️"
        )
        # Build keyboard with room-specific URL
        builder = InlineKeyboardBuilder()
        builder.row(
            InlineKeyboardButton(
                text="🏟️ Xonaga qo'shilish",
                web_app=WebAppInfo(url=f"{WEBAPP_URL}?room={room_code}"),
            ),
        )
        builder.row(
            InlineKeyboardButton(text="📊 Balans", callback_data="balance"),
        )
        await message.answer(
            text,
            parse_mode="HTML",
            reply_markup=builder.as_markup(),
        )
        return

    if created and referrer_id:
        text = (
            f"🚀 <b>Rocket Battle ga xush kelibsiz!</b>\n\n"
            f"Siz do'stingiz tomonidan taklif qilindingiz!\n"
            f"🎁 <b>+10 bonus raketa</b> siz va do'stingizga.\n\n"
            f"Balansingiz: <b>{user.balance} 🚀</b>\n\n"
            f"<b>Battle boshlash</b> tugmasini bosing! ⚔️"
        )
    elif created:
        text = (
            f"🚀 <b>Rocket Battle ga xush kelibsiz!</b>\n\n"
            f"Siz <b>{user.balance} 🚀</b> raketa bilan boshladingiz.\n\n"
            f"<b>Battle boshlash</b> tugmasini bosing! ⚔️"
        )
    else:
        text = (
            f"🚀 <b>Qaytganingiz bilan!</b>\n\n"
            f"Balansingiz: <b>{user.balance} 🚀</b>\n\n"
            f"Yangi battle boshlashga tayyormisiz? 💥"
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
        first_name=message.from_user.first_name,
    )
    await session.commit()

    text = (
        f"🚀 <b>{'Xush kelibsiz!' if created else 'Qaytganingiz bilan!'}</b>\n\n"
        f"Balansingiz: <b>{user.balance} 🚀</b>\n\n"
        f"<b>Battle boshlash</b> tugmasini bosing! ⚔️"
    )

    await message.answer(
        text,
        parse_mode="HTML",
        reply_markup=get_start_keyboard(message.from_user.id),
    )


# ── Callback handlers ────────────────────────────────────


@router.callback_query(F.data == "referral_link")
async def cb_referral_link(callback: types.CallbackQuery) -> None:
    """Show the user's referral link."""
    await callback.answer()
    bot_info = await callback.bot.get_me()
    link = f"https://t.me/{bot_info.username}?start={callback.from_user.id}"

    await callback.message.answer(
        f"🔗 <b>Sizning taklif havolangiz:</b>\n\n"
        f"<code>{link}</code>\n\n"
        f"Ulashing va har bir yangi do'st uchun <b>+10 🚀</b> oling!",
        parse_mode="HTML",
    )


@router.callback_query(F.data == "daily_tasks")
async def cb_daily_tasks(callback: types.CallbackQuery) -> None:
    """Open daily tasks info."""
    await callback.answer()
    await callback.message.answer(
        "📋 <b>Kunlik vazifalar</b>\n\n"
        "Kunlik vazifalarni bajarib bepul raketalar oling!\n"
        "Vazifalaringizni ko'rish uchun Mini App ni oching.\n\n"
        "🎮 Battle ga qo'shiling — <b>+50 🚀</b>\n"
        "🏆 3 ta raund yuting — <b>+100 🚀</b>\n"
        "🎁 Do'stga raketa yuboring — <b>+30 🚀</b>\n"
        "👥 Do'stni taklif qiling — <b>+50 🚀</b>",
        parse_mode="HTML",
    )


@router.callback_query(F.data == "gift_rockets")
async def cb_gift_rockets(callback: types.CallbackQuery) -> None:
    """Gift rockets info."""
    await callback.answer()
    await callback.message.answer(
        "🎁 <b>Do'stga raketa yuborish</b>\n\n"
        "Do'stlaringizga raketa yuborishingiz mumkin!\n\n"
        "📌 Oddiy foydalanuvchi: <b>100 ta/do'st</b> kuniga\n"
        "👑 VIP foydalanuvchi: <b>900 ta/do'st</b> kuniga\n\n"
        "Mini App da 🎁 Yuborish tugmasini bosing.",
        parse_mode="HTML",
    )


# ── Main ──────────────────────────────────────────────────


async def main() -> None:
    """Start the bot (polling mode)."""
    logger.info("Initialising database…")
    session_factory = setup_database(settings.DATABASE_URL)

    from app.database.base import engine

    # Run migrations first (adds new columns to existing tables)
    from app.database.migrate import run_migrations
    await run_migrations(engine)

    # Then create any brand-new tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed daily tasks
    from app.services import daily_task_service
    async with session_factory() as session:
        await daily_task_service.seed_default_tasks(session)
        await session.commit()

    logger.info("Initialising Redis…")
    setup_redis(settings.REDIS_URL)

    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()

    # Middlewares
    dp.update.outer_middleware(DbSessionMiddleware(session_factory))
    dp.update.outer_middleware(LoggingMiddleware())
    dp.update.outer_middleware(ThrottleMiddleware(rate_seconds=1))

    # Include routers
    dp.include_router(router)

    from app.bot.handlers import admin, balance, payment
    dp.include_router(admin.router)
    dp.include_router(balance.router)
    dp.include_router(payment.router)

    logger.info("Bot starting… (WEBAPP_URL=%s)", settings.WEBAPP_URL)

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
