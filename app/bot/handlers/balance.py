"""Balance handler — check rockets, VIP status, vote info."""

from __future__ import annotations

import logging

from aiogram import F, Router, types
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.keyboards.inline import main_menu_kb
from app.services import user_service
from app.services.redis_service import get_redis

router = Router(name="balance")
logger = logging.getLogger(__name__)


@router.callback_query(F.data == "balance")
async def cb_balance(
    callback: types.CallbackQuery,
    session: AsyncSession,
) -> None:
    """Show the user's current balance and status."""
    await callback.answer()
    logger.info("User %s checked balance", callback.from_user.id)

    user = await user_service.get_user(session, callback.from_user.id)
    if user is None:
        await callback.message.answer("⚠️ Please use /start first.")
        return

    redis = get_redis()

    # VIP info
    vip_text = "✅ Active" if user.is_vip else "❌ Not active"

    # Vote limit
    remaining = await redis.get_vote_limit(user.id)
    limit_text = str(remaining) if remaining is not None else "Full"

    # Cooldown
    cooldown_ttl = await redis.get_cooldown_ttl(user.id)
    if cooldown_ttl > 0:
        minutes = cooldown_ttl // 60
        seconds = cooldown_ttl % 60
        cooldown_text = f"⏳ {minutes}m {seconds}s"
    else:
        cooldown_text = "✅ Ready to vote"

    text = (
        f"📊 <b>Your Profile</b>\n\n"
        f"🚀 Rockets: <b>{user.balance}</b>\n"
        f"👑 VIP: {vip_text}\n"
        f"🎯 Votes remaining: <b>{limit_text}</b>\n"
        f"⏱ Cooldown: {cooldown_text}\n\n"
        f"🔗 Your referral link:\n"
        f"<code>https://t.me/your_bot?start={user.id}</code>"
    )

    await callback.message.edit_text(
        text,
        parse_mode="HTML",
        reply_markup=main_menu_kb(),
    )
