"""Battle service — queue management, battle lifecycle, scoring."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.models import Battle, BattleParticipant, BattleStatus

logger = logging.getLogger(__name__)


async def get_or_create_waiting_battle(session: AsyncSession) -> Battle:
    """Return the current *waiting* battle, or create a new one."""
    result = await session.execute(
        select(Battle).where(Battle.status == BattleStatus.WAITING).limit(1),
    )
    battle = result.scalar_one_or_none()

    if battle is None:
        battle = Battle(id=uuid.uuid4(), status=BattleStatus.WAITING)
        session.add(battle)
        await session.flush()
        logger.info("Created new waiting battle %s", battle.id)

    return battle


async def join_queue(
    session: AsyncSession,
    user_id: int,
) -> tuple[Battle, bool]:
    """Add a user to the waiting battle queue.

    Returns ``(battle, started)`` where *started* is ``True`` if the
    battle has just transitioned from WAITING → ACTIVE.
    """
    battle = await get_or_create_waiting_battle(session)

    # Check if already in this battle
    result = await session.execute(
        select(BattleParticipant).where(
            BattleParticipant.battle_id == battle.id,
            BattleParticipant.user_id == user_id,
        ),
    )
    already_queued = result.scalar_one_or_none() is not None

    started = False
    if not already_queued:
        # Add participant
        participant = BattleParticipant(
            battle_id=battle.id,
            user_id=user_id,
        )
        session.add(participant)
        await session.flush()

        # Count participants
        count_result = await session.execute(
            select(func.count())
            .where(BattleParticipant.battle_id == battle.id),
        )
        count = count_result.scalar_one()

        # Auto-start if queue is full
        if count >= settings.BATTLE_QUEUE_SIZE:
            battle.status = BattleStatus.ACTIVE
            battle.started_at = datetime.now(timezone.utc)
            started = True
            logger.info(
                "Battle %s started with %d participants",
                battle.id, count,
            )
            await session.flush()

    # Refresh battle to load participants + users for the API response
    result = await session.execute(
        select(Battle)
        .where(Battle.id == battle.id)
        .options(
            selectinload(Battle.participants).selectinload(BattleParticipant.user)
        )
    )
    battle = result.scalar_one()

    return battle, started


from sqlalchemy.orm import selectinload

async def get_active_battle(
    session: AsyncSession,
    user_id: int,
) -> Battle | None:
    """Return the user's current active battle, if any."""
    result = await session.execute(
        select(Battle)
        .join(BattleParticipant)
        .where(
            BattleParticipant.user_id == user_id,
            Battle.status == BattleStatus.ACTIVE,
        )
        .options(
            selectinload(Battle.participants).selectinload(BattleParticipant.user)
        )
    )
    return result.scalar_one_or_none()


async def get_battle_with_participants(
    session: AsyncSession,
    battle_id: uuid.UUID,
) -> Battle | None:
    """Fetch a battle with eager-loaded participants."""
    return await session.get(Battle, battle_id)


async def update_score(
    session: AsyncSession,
    battle_id: uuid.UUID,
    user_id: int,
    amount: int,
) -> int:
    """Increment a participant's score in a battle.

    Returns the new total score.
    """
    result = await session.execute(
        select(BattleParticipant)
        .where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.user_id == user_id,
        )
        .with_for_update(),
    )
    participant = result.scalar_one_or_none()
    if participant is None:
        raise ValueError(
            f"User {user_id} is not a participant in battle {battle_id}"
        )

    participant.score += amount
    await session.flush()
    return participant.score


async def finish_battle(
    session: AsyncSession,
    battle_id: uuid.UUID,
) -> Battle:
    """Mark a battle as finished."""
    battle = await session.get(Battle, battle_id)
    if battle is None:
        raise ValueError(f"Battle {battle_id} not found")

    battle.status = BattleStatus.FINISHED
    battle.finished_at = datetime.now(timezone.utc)
    await session.flush()

    logger.info("Battle %s finished", battle_id)
    return battle


async def get_leaderboard(
    session: AsyncSession,
    battle_id: uuid.UUID,
    limit: int = 10,
) -> list[BattleParticipant]:
    """Return top participants sorted by score descending."""
    result = await session.execute(
        select(BattleParticipant)
        .where(BattleParticipant.battle_id == battle_id)
        .order_by(BattleParticipant.score.desc())
        .limit(limit),
    )
    return list(result.scalars().all())
