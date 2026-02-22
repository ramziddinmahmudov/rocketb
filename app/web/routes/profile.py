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
    limit_remaining: int
    limit_max: int
    cooldown_seconds: int
    daily_rockets_remaining: int = 300


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

        return UserProfile(
            user_id=user.id,
            id=user.id,
            username=user.username,
            first_name=user.first_name or first_name,
            balance=user.balance,
            is_vip=user.is_vip,
            limit_remaining=limit_remaining,
            limit_max=limit_max,
            cooldown_seconds=cooldown_seconds,
            daily_rockets_remaining=user.daily_rockets_remaining,
        )
