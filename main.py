"""Antigravity — Rocket Battle.

Combined entry point: starts the Aiogram bot (polling) and the
FastAPI server (Uvicorn) concurrently.
"""

from __future__ import annotations

import asyncio
import logging

import uvicorn
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from app.bot.handlers import router as bot_router
from app.bot.middlewares.db_middleware import DbSessionMiddleware
from app.bot.middlewares.throttle_middleware import ThrottleMiddleware
from app.config.settings import settings
from app.database.base import Base, close_database, setup_database
from app.services.redis_service import close_redis, setup_redis
from app.web.app import create_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


async def start_bot(bot: Bot, dp: Dispatcher) -> None:
    """Run the Aiogram bot in long-polling mode."""
    logger.info("Starting bot polling…")
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await bot.session.close()


async def start_web() -> None:
    """Run the FastAPI server via Uvicorn."""
    app = create_app()
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info",
    )
    server = uvicorn.Server(config)
    logger.info("Starting FastAPI server on :8001…")
    await server.serve()


async def main() -> None:
    """Application entry point."""
    # ── Initialise infrastructure ─────────────────────────────
    logger.info("Initialising database…")
    session_factory = setup_database(settings.DATABASE_URL)

    # Create tables (use Alembic migrations in production)
    from app.database.base import engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Initialising Redis…")
    setup_redis(settings.REDIS_URL)

    # ── Configure the bot ─────────────────────────────────────
    logger.info("Configuring bot with WEBAPP_URL=%s", settings.WEBAPP_URL)
    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()

    # Register middlewares
    dp.update.outer_middleware(DbSessionMiddleware(session_factory))
    dp.update.outer_middleware(ThrottleMiddleware(rate_seconds=1))

    # Register handlers
    dp.include_router(bot_router)

    # ── Run concurrently ──────────────────────────────────────
    try:
        await asyncio.gather(
            start_bot(bot, dp),
            start_web(),
        )
    finally:
        logger.info("Shutting down…")
        await close_database()
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
