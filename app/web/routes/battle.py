"""Battle API endpoint — join queue, get active battle."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.database import base
from app.services import battle_service
from app.web.auth import AuthError, validate_init_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/battle", tags=["battle"])


# ── Schemas ───────────────────────────────────────────────────


from datetime import timedelta
from app.config.settings import settings

class ParticipantSchema(BaseModel):
    user_id: int
    username: str
    first_name: str | None
    avatar_url: str | None = None
    score: int

class JoinResponse(BaseModel):
    battle_id: uuid.UUID
    status: str
    started_at: datetime | None = None
    end_time: datetime | None = None
    already_joined: bool
    participants: list[ParticipantSchema]


class ErrorResponse(BaseModel):
    detail: str


# ── Endpoints ─────────────────────────────────────────────────


@router.post(
    "/join",
    response_model=JoinResponse,
    responses={
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def join_battle(
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> JoinResponse:
    """Join the waiting queue or return the current active battle."""
    # 1. Authenticate
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        # 2. Check if already in an active battle
        active_battle = await battle_service.get_active_battle(session, user_id)
        if active_battle:
            logger.info("User %d already in active battle %s", user_id, active_battle.id)
            battle = active_battle
            already_joined = True
        else:
            # 3. Join queue
            try:
                battle, started = await battle_service.join_queue(session, user_id)
                await session.commit()
                already_joined = False
            except Exception as exc:
                logger.error("Failed to join queue: %s", exc, exc_info=True)
                await session.rollback()
                raise HTTPException(status_code=500, detail="Failed to join battle")

        # Prepare response data
        participants_data = []
        for p in battle.participants:
            # Fallback if user is not loaded (though service should load it)
            u = p.user
            # Simple placeholder avatar logic or real one if available later
            avatar = f"https://ui-avatars.com/api/?name={u.username or 'Player'}&background=random"
            
            participants_data.append(ParticipantSchema(
                user_id=u.id,
                username=u.username or f"User {u.id}",
                first_name=None, # Add field to model if needed, currently User model has no first_name
                avatar_url=avatar,
                score=p.score,
            ))
            
        end_time = None
        if battle.started_at:
            end_time = battle.started_at + timedelta(seconds=settings.BATTLE_DURATION)

        return JoinResponse(
            battle_id=battle.id,
            status=battle.status.value,
            started_at=battle.started_at,
            end_time=end_time,
            already_joined=already_joined,
            participants=participants_data,
        )
