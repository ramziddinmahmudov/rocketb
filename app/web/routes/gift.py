"""Gift API — send rockets to friends."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.database import base
from app.services import gift_service
from app.web.auth import AuthError, validate_init_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gift", tags=["gifts"])


# ── Schemas ───────────────────────────────────────────────────


class GiftRequest(BaseModel):
    receiver_id: int
    amount: int = Field(gt=0, le=1000, description="Number of rockets to send")


class GiftResponse(BaseModel):
    success: bool
    sender_balance: int
    receiver_balance: int
    amount: int


class GiftLimitResponse(BaseModel):
    receiver_id: int
    remaining_limit: int
    is_vip: bool


class ErrorResponse(BaseModel):
    detail: str


# ── Endpoints ─────────────────────────────────────────────────


@router.post("", response_model=GiftResponse)
async def send_gift(
    body: GiftRequest,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> GiftResponse:
    """Send rockets to a friend."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        try:
            sender_bal, receiver_bal = await gift_service.send_rockets(
                session, user_id, body.receiver_id, body.amount,
            )
            await session.commit()

            return GiftResponse(
                success=True,
                sender_balance=sender_bal,
                receiver_balance=receiver_bal,
                amount=body.amount,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            await session.rollback()
            logger.error("Gift failed: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail="Gift failed")


@router.get("/limit/{receiver_id}", response_model=GiftLimitResponse)
async def get_gift_limit(
    receiver_id: int,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> GiftLimitResponse:
    """Check remaining gift limit for a specific friend."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        remaining = await gift_service.get_gift_limit_for_receiver(
            session, user_id, receiver_id
        )
        user = await session.get(
            __import__("app.database.models", fromlist=["User"]).User,
            user_id,
        )
        from datetime import datetime, timezone
        is_vip = user and user.is_vip and (
            user.vip_expire_date is not None
            and user.vip_expire_date > datetime.now(timezone.utc)
        )

        return GiftLimitResponse(
            receiver_id=receiver_id,
            remaining_limit=remaining,
            is_vip=bool(is_vip),
        )
