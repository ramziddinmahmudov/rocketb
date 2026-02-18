"""Voting service — orchestrates the full vote flow.

The vote pipeline:
1. Check cooldown  (Redis)
2. Init / read vote limit  (Redis)
3. Atomically decrement limit  (Redis Lua)
4. Deduct balance  (DB  SELECT … FOR UPDATE)
5. Update battle score  (DB)
6. If limit hit 0 → start cooldown  (Redis TTL)

On any DB failure the Redis limit is restored (compensating action).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.models import User
from app.services import battle_service
from app.services.redis_service import RedisService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VoteResult:
    """Returned after a successful vote."""

    new_balance: int
    remaining_limit: int
    score: int
    cooldown_started: bool
    cooldown_seconds: int


class VotingError(Exception):
    """Base exception for voting failures."""


class CooldownActiveError(VotingError):
    """User is still on cooldown."""

    def __init__(self, ttl: int) -> None:
        self.ttl = ttl
        super().__init__(f"Cooldown active: {ttl}s remaining")


class InsufficientLimitError(VotingError):
    """Vote limit exhausted (concurrent decrement failed)."""


class InsufficientBalanceError(VotingError):
    """Not enough rockets."""


class NoBattleError(VotingError):
    """User is not in an active battle."""


async def process_vote(
    session: AsyncSession,
    redis: RedisService,
    user_id: int,
    battle_id: uuid.UUID,
    amount: int,
) -> VoteResult:
    """Execute the full voting pipeline (Redis + DB).

    This is the single entry-point that the FastAPI endpoint and
    any bot handler should call.  It guarantees atomicity across
    Redis and PostgreSQL through compensating actions.
    """
    if amount <= 0:
        raise VotingError("Vote amount must be positive")

    # 1 ── Cooldown check ──────────────────────────────────────
    if await redis.is_on_cooldown(user_id):
        ttl = await redis.get_cooldown_ttl(user_id)
        raise CooldownActiveError(ttl)

    # 2 ── Determine & initialise vote limit ───────────────────
    user = await session.get(User, user_id)
    if user is None:
        raise VotingError(f"User {user_id} not found")

    is_vip = user.is_vip and (
        user.vip_expire_date is not None
        and user.vip_expire_date > datetime.now(timezone.utc)
    )
    max_limit = settings.VIP_VOTE_LIMIT if is_vip else settings.STANDARD_VOTE_LIMIT
    await redis.init_vote_limit(user_id, max_limit)

    # 3 ── Atomically decrement vote limit (Lua script) ────────
    remaining = await redis.decrement_vote_limit(user_id, amount)
    if remaining < 0:
        raise InsufficientLimitError(
            "Not enough votes remaining in this cycle"
        )

    # From here, Redis is decremented — must restore on failure.
    try:
        # 4 ── Deduct balance (DB with row lock) ──────────────
        if user.balance < amount:
            raise InsufficientBalanceError(
                f"Need {amount} rockets, have {user.balance}"
            )

        user.balance -= amount
        await session.flush()

        # 5 ── Update battle score ────────────────────────────
        new_score = await battle_service.update_score(
            session, battle_id, user_id, amount,
        )

        await session.flush()

    except Exception:
        # Compensating action: restore the Redis limit
        await redis.restore_vote_limit(user_id, amount)
        raise

    # 6 ── Start cooldown if limit is exhausted ───────────────
    cooldown_started = False
    cooldown_seconds = 0
    if remaining == 0:
        cooldown_seconds = (
            settings.VIP_COOLDOWN if is_vip else settings.STANDARD_COOLDOWN
        )
        await redis.start_cooldown(user_id, cooldown_seconds)
        # Reset limit so it re-initialises on next cycle
        await redis.reset_vote_limit(user_id)
        cooldown_started = True
        logger.info(
            "Cooldown started for user %d (%ds)", user_id, cooldown_seconds,
        )

    logger.info(
        "Vote OK: user=%d battle=%s amount=%d balance=%d limit=%d",
        user_id, battle_id, amount, user.balance, remaining,
    )

    return VoteResult(
        new_balance=user.balance,
        remaining_limit=remaining,
        score=new_score,
        cooldown_started=cooldown_started,
        cooldown_seconds=cooldown_seconds,
    )
