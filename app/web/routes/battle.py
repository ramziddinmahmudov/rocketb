"""Battle API endpoint — join queue, get active battle, bracket info."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config.settings import settings
from app.database import base
from app.database.models import BattleRound, RoundStatus
from app.services import battle_service
from app.web.auth import AuthError, validate_init_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/battle", tags=["battle"])


# ── Schemas ───────────────────────────────────────────────────


class ParticipantSchema(BaseModel):
    user_id: int
    username: str
    first_name: str | None = None
    avatar_url: str | None = None
    score: int = 0
    bracket_position: int = 0
    is_eliminated: bool = False
    rockets_earned: int = 0


class RoundSchema(BaseModel):
    id: int
    round_number: int
    player1_id: int
    player2_id: int
    player1_score: int = 0
    player2_score: int = 0
    player1_username: str | None = None
    player2_username: str | None = None
    winner_id: int | None = None
    status: str
    duration_seconds: int = 60


class JoinResponse(BaseModel):
    battle_id: uuid.UUID
    status: str
    started_at: datetime | None = None
    current_round: int = 0
    total_rounds: int = 4
    already_joined: bool
    participants: list[ParticipantSchema]
    current_matches: list[RoundSchema] = []
    players_count: int = 0
    max_players: int = 16


class BattleDetailResponse(BaseModel):
    battle_id: uuid.UUID
    status: str
    current_round: int
    total_rounds: int
    participants: list[ParticipantSchema]
    rounds: list[RoundSchema]


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
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        # Check if already in an active battle
        active_battle = await battle_service.get_active_battle(session, user_id)
        if active_battle:
            logger.info("User %d already in active battle %s", user_id, active_battle.id)
            battle = active_battle
            already_joined = True
        else:
            # Check if in a waiting battle
            waiting_battle = await battle_service.get_waiting_battle_for_user(session, user_id)
            if waiting_battle:
                battle = waiting_battle
                already_joined = True
            else:
                # Join queue
                try:
                    battle, started = await battle_service.join_queue(session, user_id)
                    await session.commit()
                    already_joined = False
                except Exception as exc:
                    logger.error("Failed to join queue: %s", exc, exc_info=True)
                    await session.rollback()
                    raise HTTPException(status_code=500, detail="Failed to join battle")

        # Build response
        participants_data = _build_participants(battle)
        current_matches = []

        if battle.status.value == "active":
            matches = await battle_service.get_current_round_matches(
                session, battle.id
            )
            current_matches = _build_rounds(matches)

        return JoinResponse(
            battle_id=battle.id,
            status=battle.status.value,
            started_at=battle.started_at,
            current_round=battle.current_round,
            total_rounds=battle.total_rounds,
            already_joined=already_joined,
            participants=participants_data,
            current_matches=current_matches,
            players_count=len(participants_data),
            max_players=settings.BATTLE_PLAYERS,
        )


@router.get(
    "/{battle_id}",
    response_model=BattleDetailResponse,
)
async def get_battle(
    battle_id: uuid.UUID,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> BattleDetailResponse:
    """Get full battle details including bracket and rounds."""
    try:
        validate_init_data(x_telegram_init_data)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        battle = await battle_service.get_battle_with_participants(session, battle_id)
        if battle is None:
            raise HTTPException(status_code=404, detail="Battle not found")

        return BattleDetailResponse(
            battle_id=battle.id,
            status=battle.status.value,
            current_round=battle.current_round,
            total_rounds=battle.total_rounds,
            participants=_build_participants(battle),
            rounds=_build_rounds(battle.rounds),
        )


@router.post("/{battle_id}/advance")
async def advance_round(
    battle_id: uuid.UUID,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> dict:
    """Advance the battle to the next bracket round.

    This should be called by a timer or admin when a round ends.
    """
    try:
        validate_init_data(x_telegram_init_data)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        try:
            is_finished = await battle_service.advance_bracket(session, battle_id)
            await session.commit()

            battle = await battle_service.get_battle_with_participants(session, battle_id)

            return {
                "success": True,
                "is_finished": is_finished,
                "current_round": battle.current_round if battle else 0,
                "status": battle.status.value if battle else "unknown",
            }
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            await session.rollback()
            logger.error("Failed to advance bracket: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to advance")


# ── Helpers ───────────────────────────────────────────────────


def _build_participants(battle) -> list[ParticipantSchema]:
    """Build participant schemas from battle."""
    result = []
    for p in battle.participants:
        u = p.user
        avatar = f"https://ui-avatars.com/api/?name={u.username or u.first_name or 'Player'}&background=random"
        result.append(ParticipantSchema(
            user_id=u.id,
            username=u.username or f"User {u.id}",
            first_name=u.first_name,
            avatar_url=avatar,
            score=p.score,
            bracket_position=p.bracket_position,
            is_eliminated=p.is_eliminated,
            rockets_earned=p.rockets_earned,
        ))
    return result


def _build_rounds(rounds) -> list[RoundSchema]:
    """Build round schemas."""
    result = []
    for r in rounds:
        result.append(RoundSchema(
            id=r.id,
            round_number=r.round_number,
            player1_id=r.player1_id,
            player2_id=r.player2_id,
            player1_score=r.player1_score,
            player2_score=r.player2_score,
            player1_username=r.player1.username if r.player1 else None,
            player2_username=r.player2.username if r.player2 else None,
            winner_id=r.winner_id,
            status=r.status.value,
            duration_seconds=r.duration_seconds,
        ))
    return result
