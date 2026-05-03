"""Entry point: `python -m app.bot` starts polling."""
import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand, BotCommandScopeAllPrivateChats, BotCommandScopeChat

from .config import ADMIN_IDS, BOT_TOKEN
from .handlers import admin, common, leaderboard, profile, referral, shop


USER_COMMANDS = [
    BotCommand(command="start", description="🚀 Boshlash"),
    BotCommand(command="menu", description="🏠 Bosh menyu"),
    BotCommand(command="profile", description="👤 Mening profilim"),
    BotCommand(command="shop", description="🛒 Raketa olish"),
    BotCommand(command="top", description="🏆 Top o'yinchilar"),
    BotCommand(command="invite", description="👥 Do'stlarni taklif qilish"),
    BotCommand(command="help", description="ℹ️ Yordam"),
]

ADMIN_COMMANDS = USER_COMMANDS + [
    BotCommand(command="admin", description="👑 Admin panel"),
    BotCommand(command="find", description="🔍 Foydalanuvchi qidirish"),
    BotCommand(command="give", description="➕ Raketa berish"),
    BotCommand(command="setlevel", description="⭐ Daraja belgilash"),
    BotCommand(command="makeadmin", description="👑 Admin toggle"),
    BotCommand(command="broadcast", description="📢 Hammaga xabar"),
    BotCommand(command="tasks", description="📋 Vazifalar"),
    BotCommand(command="addtask", description="➕ Yangi vazifa"),
    BotCommand(command="deltask", description="🗑 Vazifani o'chirish"),
]


async def setup_commands(bot: Bot):
    # Default for all private chats
    await bot.set_my_commands(USER_COMMANDS, scope=BotCommandScopeAllPrivateChats())
    # Per-admin scope (overrides default with admin commands)
    for admin_id in ADMIN_IDS:
        try:
            await bot.set_my_commands(ADMIN_COMMANDS, scope=BotCommandScopeChat(chat_id=admin_id))
        except Exception as e:
            logging.getLogger(__name__).warning("Couldn't set commands for admin %s: %s", admin_id, e)


async def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    if not BOT_TOKEN:
        raise SystemExit("BOT_TOKEN env var is required")

    bot = Bot(
        token=BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())

    # Order: admin first so its filter runs and admin commands aren't shadowed.
    dp.include_routers(
        admin.router,
        common.router,
        profile.router,
        shop.router,
        leaderboard.router,
        referral.router,
    )

    await bot.delete_webhook(drop_pending_updates=False)
    await setup_commands(bot)

    me = await bot.me()
    logging.info("🤖 Bot started: @%s (id=%s)", me.username, me.id)

    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
