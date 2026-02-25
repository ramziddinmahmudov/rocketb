"""Battle service — 16-player tournament bracket: queue, rounds, elimination."""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config.settings import settings
from app.database.models import (
    Battle,
    BattleParticipant,
    BattleRound,
    BattleStatus,
    RoundStatus,
)

logger = logging.getLogger(__name__)


# ── Queue & Auto-start ───────────────────────────────────────


async def get_or_create_waiting_battle(session: AsyncSession) -> Battle:
    """Return the current *waiting* battle (no room), or create a new one.

    Used for matchmaking without a specific room.
    """
    result = await session.execute(
        select(Battle).where(
            Battle.status == BattleStatus.WAITING,
            Battle.room_id.is_(None),
        ).limit(1),
    )
    battle = result.scalar_one_or_none()

    if battle is None:
        battle = Battle(
            id=uuid.uuid4(),
            status=BattleStatus.WAITING,
            total_rounds=settings.BATTLE_TOTAL_ROUNDS,
        )
        session.add(battle)
        await session.flush()
        logger.info("Created new waiting battle %s", battle.id)

    return battle


async def join_queue(
    session: AsyncSession,
    user_id: int,
    battle_id: uuid.UUID | None = None,
) -> tuple[Battle, bool]:
    """Add a user to a battle queue.

    If battle_id is provided, join that specific battle.
    Otherwise join the global matchmaking queue.

    Returns ``(battle, started)`` where *started* is ``True`` if the
    battle has just transitioned from WAITING → ACTIVE.
    """
    if battle_id:
        battle = await session.get(Battle, battle_id)
        if battle is None:
            raise ValueError(f"Battle {battle_id} not found")
    else:
        battle = await get_or_create_waiting_battle(session)

    if battle.status != BattleStatus.WAITING:
        raise ValueError("Battle has already started or finished")

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
        # Count current participants for seeding
        count_result = await session.execute(
            select(func.count())
            .select_from(BattleParticipant)
            .where(BattleParticipant.battle_id == battle.id),
        )
        count = count_result.scalar_one()

        # Add participant
        participant = BattleParticipant(
            battle_id=battle.id,
            user_id=user_id,
            bracket_position=count,
        )
        session.add(participant)
        await session.flush()

        new_count = count + 1
        logger.info(
            "User %d joined battle %s (%d/%d)",
            user_id, battle.id, new_count, settings.BATTLE_PLAYERS,
        )

        # Auto-start if queue is full
        if new_count >= settings.BATTLE_PLAYERS:
            started = await _start_battle(session, battle)

    # Refresh battle with participants loaded
    result = await session.execute(
        select(Battle)
        .where(Battle.id == battle.id)
        .options(
            selectinload(Battle.participants).selectinload(BattleParticipant.user)
        )
    )
    battle = result.scalar_one()

    return battle, started


async def _start_battle(session: AsyncSession, battle: Battle) -> bool:
    """Transition a battle from WAITING → ACTIVE and create first round."""
    battle.status = BattleStatus.ACTIVE
    battle.started_at = datetime.now(timezone.utc)
    battle.current_round = 1
    await session.flush()

    logger.info("Battle %s started!", battle.id)

    # Create first round matchups
    await create_round_matchups(session, battle.id, round_number=1)
    return True


# ── Bracket Logic ────────────────────────────────────────────


async def create_round_matchups(
    session: AsyncSession,
    battle_id: uuid.UUID,
    round_number: int,
) -> list[BattleRound]:
    """Create 1v1 matchups for a given bracket round.

    Round 1: 16 players → 8 matches
    Round 2: 8 players → 4 matches
    Round 3: 4 players → 2 matches
    Round 4: 2 players → 1 match (Final)
    """
    # Get non-eliminated participants, ordered by bracket position
    result = await session.execute(
        select(BattleParticipant)
        .where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.is_eliminated == False,
        )
        .order_by(BattleParticipant.bracket_position.asc())
    )
    active_players = list(result.scalars().all())

    if len(active_players) < 2:
        logger.warning("Not enough players for round %d in battle %s", round_number, battle_id)
        return []

    # Shuffle for round 1 to randomize, keep bracket order for later rounds
    if round_number == 1:
        random.shuffle(active_players)
        # Update bracket positions after shuffle
        for idx, p in enumerate(active_players):
            p.bracket_position = idx
        await session.flush()

    # Pair adjacent players
    matches = []
    now = datetime.now(timezone.utc)
    for i in range(0, len(active_players), 2):
        if i + 1 >= len(active_players):
            # Odd player gets a bye (auto-advance)
            logger.info("Player %d gets a bye in round %d", active_players[i].user_id, round_number)
            continue

        p1 = active_players[i]
        p2 = active_players[i + 1]

        match = BattleRound(
            battle_id=battle_id,
            round_number=round_number,
            player1_id=p1.user_id,
            player2_id=p2.user_id,
            status=RoundStatus.ACTIVE,
            started_at=now,
            duration_seconds=settings.ROUND_DURATION,
        )
        session.add(match)
        matches.append(match)

    await session.flush()
    logger.info(
        "Created %d matchups for round %d in battle %s",
        len(matches), round_number, battle_id,
    )
    return matches


async def get_current_round_matches(
    session: AsyncSession,
    battle_id: uuid.UUID,
) -> list[BattleRound]:
    """Get active or pending matches for the current round."""
    battle = await session.get(Battle, battle_id)
    if battle is None:
        return []

    result = await session.execute(
        select(BattleRound)
        .where(
            BattleRound.battle_id == battle_id,
            BattleRound.round_number == battle.current_round,
        )
        .order_by(BattleRound.id.asc())
    )
    return list(result.scalars().all())


async def update_round_score(
    session: AsyncSession,
    battle_id: uuid.UUID,
    target_id: int,
    amount: int,
) -> tuple[int, BattleRound]:
    """Add rockets to a player's score in their current active round.

    Returns (new_score, round).
    """
    # Find the target player's active round
    result = await session.execute(
        select(BattleRound)
        .where(
            BattleRound.battle_id == battle_id,
            BattleRound.status == RoundStatus.ACTIVE,
            (
                (BattleRound.player1_id == target_id)
                | (BattleRound.player2_id == target_id)
            ),
        )
    )
    round_match = result.scalar_one_or_none()

    if round_match is None:
        raise ValueError(f"Target {target_id} has no active round in battle {battle_id}")

    if round_match.player1_id == target_id:
        round_match.player1_score += amount
        new_score = round_match.player1_score
    else:
        round_match.player2_score += amount
        new_score = round_match.player2_score

    # Also update participant total score
    p_result = await session.execute(
        select(BattleParticipant).where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.user_id == target_id,
        )
    )
    participant = p_result.scalar_one_or_none()
    if participant:
        participant.score += amount

    await session.flush()
    return new_score, round_match


async def resolve_round(
    session: AsyncSession,
    battle_id: uuid.UUID,
    round_number: int,
) -> list[int]:
    """Resolve all matches in a round — determine winners and eliminate losers.

    Returns list of winner user_ids.
    """
    result = await session.execute(
        select(BattleRound).where(
            BattleRound.battle_id == battle_id,
            BattleRound.round_number == round_number,
            BattleRound.status == RoundStatus.ACTIVE,
        )
    )
    matches = list(result.scalars().all())
    now = datetime.now(timezone.utc)

    winners = []
    for match in matches:
        match.status = RoundStatus.FINISHED
        match.finished_at = now

        # Determine winner (higher score wins, tie = player1 wins)
        if match.player1_score >= match.player2_score:
            match.winner_id = match.player1_id
            loser_id = match.player2_id
        else:
            match.winner_id = match.player2_id
            loser_id = match.player1_id

        winners.append(match.winner_id)

        # Mark loser as eliminated
        loser_result = await session.execute(
            select(BattleParticipant).where(
                BattleParticipant.battle_id == battle_id,
                BattleParticipant.user_id == loser_id,
            )
        )
        loser = loser_result.scalar_one_or_none()
        if loser:
            loser.is_eliminated = True
            loser.eliminated_at_round = round_number

        # Award bonus rockets to winner
        winner_result = await session.execute(
            select(BattleParticipant).where(
                BattleParticipant.battle_id == battle_id,
                BattleParticipant.user_id == match.winner_id,
            )
        )
        winner = winner_result.scalar_one_or_none()
        if winner:
            winner.rockets_earned += 10  # Bonus per win

        logger.info(
            "Round %d match: %d vs %d → winner=%d (scores: %d-%d)",
            round_number, match.player1_id, match.player2_id,
            match.winner_id, match.player1_score, match.player2_score,
        )

    await session.flush()
    return winners


async def advance_bracket(
    session: AsyncSession,
    battle_id: uuid.UUID,
) -> bool:
    """Advance to the next bracket round, or finish the battle.

    Returns ``True`` if the battle is now finished (champion determined).
    """
    battle = await session.get(Battle, battle_id)
    if battle is None:
        raise ValueError(f"Battle {battle_id} not found")

    # Resolve current round
    winners = await resolve_round(session, battle_id, battle.current_round)

    if len(winners) <= 1:
        # We have a champion
        return await finish_battle(session, battle_id)

    # Advance to next round
    battle.current_round += 1
    await session.flush()

    # Create next round matchups
    await create_round_matchups(session, battle_id, battle.current_round)

    logger.info(
        "Battle %s advanced to round %d with %d players",
        battle_id, battle.current_round, len(winners),
    )
    return False


# ── Battle lifecycle ─────────────────────────────────────────


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
            selectinload(Battle.participants).selectinload(BattleParticipant.user),
            selectinload(Battle.rounds),
        )
    )
    return result.scalar_one_or_none()


async def get_waiting_battle_for_user(
    session: AsyncSession,
    user_id: int,
) -> Battle | None:
    """Return a waiting battle the user is part of."""
    result = await session.execute(
        select(Battle)
        .join(BattleParticipant)
        .where(
            BattleParticipant.user_id == user_id,
            Battle.status == BattleStatus.WAITING,
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
    result = await session.execute(
        select(Battle)
        .where(Battle.id == battle_id)
        .options(
            selectinload(Battle.participants).selectinload(BattleParticipant.user),
            selectinload(Battle.rounds),
        )
    )
    return result.scalar_one_or_none()


async def finish_battle(
    session: AsyncSession,
    battle_id: uuid.UUID,
) -> bool:
    """Mark a battle as finished."""
    battle = await session.get(Battle, battle_id)
    if battle is None:
        raise ValueError(f"Battle {battle_id} not found")

    battle.status = BattleStatus.FINISHED
    battle.finished_at = datetime.now(timezone.utc)

    # Close the room
    if battle.room_id:
        from app.database.models import BattleRoom
        room = await session.get(BattleRoom, battle.room_id)
        if room:
            room.is_active = False

    await session.flush()

    logger.info("Battle %s finished", battle_id)
    return True


async def get_leaderboard(
    session: AsyncSession,
    battle_id: uuid.UUID,
    limit: int = 16,
) -> list[BattleParticipant]:
    """Return top participants sorted by score descending."""
    result = await session.execute(
        select(BattleParticipant)
        .where(BattleParticipant.battle_id == battle_id)
        .order_by(BattleParticipant.score.desc())
        .limit(limit),
    )
    return list(result.scalars().all())
