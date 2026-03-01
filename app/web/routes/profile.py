"""Profile API endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.database import base
from app.services.user_service import get_or_create_user
from app.web.auth import AuthError, validate_init_data

router = APIRouter(prefix="/api", tags=["profile"])
import logging
logger = logging.getLogger(__name__)



from app.config.settings import settings
from app.services.redis_service import get_redis

class UserProfile(BaseModel):
    user_id: int
    id: int
    username: str | None
    first_name: str | None
    balance: int
    is_vip: bool
    vip_emoji: str | None
    limit_remaining: int
    limit_max: int
    cooldown_seconds: int
    daily_rockets_remaining: int = 300
    
    # Stats
    total_battles: int = 0
    wins: int = 0
    win_rate: str = "0%"
    rockets_spent: str = "0"
    stars_gained: int = 0
    referrals: int = 0


class EmojiUpdateData(BaseModel):
    emoji: str


from sqlalchemy import select, func
from app.database.models import BattleParticipant, Battle, BattleStatus, Transaction, Referral

@router.get("/profile", response_model=UserProfile)
async def get_profile(
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> UserProfile:
    """Get or create user profile based on Telegram initData."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        logger.info(
            "WebApp profile fetch for user: %s (username=%s, first_name=%s)",
            user_data.get("id"),
            user_data.get("username"),
            user_data.get("first_name"),
        )
    except AuthError as exc:
        logger.warning("Profile auth failed: %s", exc)
        raise HTTPException(status_code=401, detail=str(exc))

    user_id = user_data["id"]
    username = user_data.get("username")
    first_name = user_data.get("first_name")
    
    if not base.async_session_factory:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        user, _ = await get_or_create_user(
            session=session,
            user_id=user_id,
            username=username,
            first_name=first_name,
        )
        await session.commit()
        
        # Fetch limits from Redis
        redis = get_redis()
        
        # 1. Cooldown
        ttl = await redis.get_cooldown_ttl(user.id)
        cooldown_seconds = ttl if ttl > 0 else 0
        
        # 2. Vote Limit
        limit_max = settings.VIP_VOTE_LIMIT if user.is_vip else settings.STANDARD_VOTE_LIMIT
        
        if cooldown_seconds > 0:
            limit_remaining = 0
        else:
            current = await redis.get_vote_limit(user.id)
            limit_remaining = current if current is not None else limit_max

        # 3. Calculate Stats
        # Total Battles
        stmt_tb = select(func.count()).select_from(BattleParticipant).where(BattleParticipant.user_id == user.id)
        total_battles = await session.scalar(stmt_tb) or 0
        
        # Wins (survived finished battles)
        stmt_w = (
            select(func.count())
            .select_from(BattleParticipant)
            .join(Battle, BattleParticipant.battle_id == Battle.id)
            .where(
                BattleParticipant.user_id == user.id,
                BattleParticipant.is_eliminated == False,
                Battle.status == BattleStatus.FINISHED
            )
        )
        wins = await session.scalar(stmt_w) or 0
        
        # Win Rate
        win_rate_val = int((wins / total_battles) * 100) if total_battles > 0 else 0
        win_rate = f"{win_rate_val}%"
        
        # Rockets Spent
        stmt_rs = select(func.sum(Transaction.amount)).where(Transaction.user_id == user.id, Transaction.amount < 0)
        rockets_spent_val = abs(await session.scalar(stmt_rs) or 0)
        rockets_spent = f"{rockets_spent_val:,}"
        
        # Stars (Stars paid for rockets/vip)
        stmt_sg = select(func.sum(Transaction.stars_paid)).where(Transaction.user_id == user.id)
        stars_gained = await session.scalar(stmt_sg) or 0
        
        # Referrals
        stmt_ref = select(func.count()).select_from(Referral).where(Referral.referrer_id == user.id)
        referrals = await session.scalar(stmt_ref) or 0

        return UserProfile(
            user_id=user.id,
            id=user.id,
            username=user.username,
            first_name=user.first_name or first_name,
            balance=user.balance,
            is_vip=user.is_vip,
            vip_emoji=user.vip_emoji,
            limit_remaining=limit_remaining,
            limit_max=limit_max,
            cooldown_seconds=cooldown_seconds,
            daily_rockets_remaining=user.daily_rockets_remaining,
            total_battles=total_battles,
            wins=wins,
            win_rate=win_rate,
            rockets_spent=rockets_spent,
            stars_gained=stars_gained,
            referrals=referrals
        )


@router.post("/profile/emoji")
async def update_emoji(
    data: EmojiUpdateData,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> dict:
    """Set custom emoji for VIP users."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if not base.async_session_factory:
        raise HTTPException(status_code=500, detail="Database not initialised")

    # Limit emoji length strictly to 10 chars (handles Unicode surrogates)
    emoji = data.emoji.strip()
    if len(emoji) > 10:
        raise HTTPException(status_code=400, detail="Emoji string too long")

    async with base.async_session_factory() as session:
        user, _ = await get_or_create_user(session, user_id=user_data["id"])
        
        if not user.is_vip:
            raise HTTPException(status_code=403, detail="Only VIP users can set a custom emoji")
            
        user.vip_emoji = emoji if emoji else None
        await session.commit()
        
        return {"success": True, "vip_emoji": user.vip_emoji}
