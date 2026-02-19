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



class UserProfile(BaseModel):
    id: int
    username: str | None
    first_name: str | None
    balance: int
    is_vip: bool


@router.get("/profile", response_model=UserProfile)
async def get_profile(
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> UserProfile:
    """Get or create user profile based on Telegram initData."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        logger.info("WebApp profile fetch for user: %s", user_data.get("id"))
    except AuthError as exc:
        logger.warning("Profile auth failed: %s", exc)
        raise HTTPException(status_code=401, detail=str(exc))

    user_id = user_data["id"]
    username = user_data.get("username")
    first_name = user_data.get("first_name")
    # referrer_id could be extracted from start_param if needed, 
    # but that's usually handled by the bot start command.

    if not base.async_session_factory:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        user, _ = await get_or_create_user(
            session=session,
            user_id=user_id,
            username=username,
        )
        await session.commit()

        return UserProfile(
            id=user.id,
            username=user.username,
            first_name=first_name,
            balance=user.balance,
            is_vip=user.is_vip,
        )
