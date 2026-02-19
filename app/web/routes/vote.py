"""Vote API endpoint — WebApp sends vote requests here."""

from __future__ import annotations

import logging
import traceback
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.database.base import async_session_factory
from app.services.redis_service import get_redis
from app.services.voting_service import (
    CooldownActiveError,
    InsufficientBalanceError,
    InsufficientLimitError,
    NoBattleError,
    VoteResult,
    VotingError,
    process_vote,
)
from app.web.auth import AuthError, validate_init_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["voting"])


# ── Request / Response Schemas ────────────────────────────────


class VoteRequest(BaseModel):
    battle_id: uuid.UUID
    amount: int = Field(gt=0, le=100, description="Number of rockets to spend")


class VoteResponse(BaseModel):
    success: bool
    new_balance: int
    remaining_limit: int
    score: int
    cooldown_started: bool
    cooldown_seconds: int


class ErrorResponse(BaseModel):
    detail: str
    cooldown_ttl: int | None = None


# ── Endpoint ──────────────────────────────────────────────────


@router.post(
    "/vote",
    response_model=VoteResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
    },
)
async def vote(
    body: VoteRequest,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> VoteResponse:
    """Process a vote from the WebApp.

    The WebApp must send the Telegram ``initData`` string in the
    ``X-Telegram-Init-Data`` header for authentication.
    """
    # 1 ── Authenticate ────────────────────────────────────────
    try:
        user_data = validate_init_data(x_telegram_init_data)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    user_id: int = user_data["id"]

    # 2 ── Execute vote pipeline ──────────────────────────────
    if async_session_factory is None:
        logger.error("Database not initialised (async_session_factory is None)")
        raise HTTPException(status_code=500, detail="Database not initialised")

    try:
        redis = get_redis()
    except Exception as exc:
        logger.error("Redis connection failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Redis unavailable")

    try:
        async with async_session_factory() as session:
            try:
                result: VoteResult = await process_vote(
                    session=session,
                    redis=redis,
                    user_id=user_id,
                    battle_id=body.battle_id,
                    amount=body.amount,
                )
                await session.commit()

            except CooldownActiveError as exc:
                raise HTTPException(
                    status_code=429,
                    detail=f"Cooldown active: {exc.ttl}s remaining",
                )
            except InsufficientLimitError:
                raise HTTPException(
                    status_code=400,
                    detail="Vote limit exhausted for this cycle",
                )
            except InsufficientBalanceError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            except NoBattleError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            except VotingError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            except Exception:
                await session.rollback()
                raise

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Vote processing failed: %s", exc, exc_info=True)
        # trace = traceback.format_exc()
        # logger.error(trace)
        raise HTTPException(status_code=500, detail="Internal Server Error (Check logs)")

    return VoteResponse(
        success=True,
        new_balance=result.new_balance,
        remaining_limit=result.remaining_limit,
        score=result.score,
        cooldown_started=result.cooldown_started,
        cooldown_seconds=result.cooldown_seconds,
    )
