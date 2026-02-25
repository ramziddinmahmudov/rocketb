"""Room service — create, join, and manage battle rooms."""

from __future__ import annotations

import logging
import secrets
import string
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config.settings import settings
from app.database.models import BattleRoom, BattleParticipant, Battle, BattleStatus

logger = logging.getLogger(__name__)


def _generate_invite_code(length: int = 8) -> str:
    """Generate a short alphanumeric invite code."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def create_room(
    session: AsyncSession,
    creator_id: int,
    name: str = "Battle Room",
) -> BattleRoom:
    """Create a new battle room with a unique invite code."""
    # Generate unique invite code
    for _ in range(10):
        code = _generate_invite_code()
        existing = await session.execute(
            select(BattleRoom).where(BattleRoom.invite_code == code)
        )
        if existing.scalar_one_or_none() is None:
            break
    else:
        raise ValueError("Failed to generate unique invite code")

    room = BattleRoom(
        id=uuid.uuid4(),
        invite_code=code,
        name=name,
        creator_id=creator_id,
        max_players=settings.BATTLE_PLAYERS,
    )
    session.add(room)
    await session.flush()

    # Create a waiting battle for this room
    battle = Battle(
        id=uuid.uuid4(),
        room_id=room.id,
        status=BattleStatus.WAITING,
        total_rounds=settings.BATTLE_TOTAL_ROUNDS,
    )
    session.add(battle)
    await session.flush()

    logger.info("Created room %s (code=%s) with battle %s", room.id, code, battle.id)
    return room


async def get_room_by_code(
    session: AsyncSession,
    invite_code: str,
) -> BattleRoom | None:
    """Fetch a room by its invite code."""
    result = await session.execute(
        select(BattleRoom).where(
            BattleRoom.invite_code == invite_code,
            BattleRoom.is_active == True,
        )
    )
    return result.scalar_one_or_none()


async def get_room(
    session: AsyncSession,
    room_id: uuid.UUID,
) -> BattleRoom | None:
    """Fetch a room by ID."""
    return await session.get(BattleRoom, room_id)


async def get_room_battle(
    session: AsyncSession,
    room_id: uuid.UUID,
) -> Battle | None:
    """Get the current waiting/active battle for a room."""
    result = await session.execute(
        select(Battle)
        .where(
            Battle.room_id == room_id,
            Battle.status.in_([BattleStatus.WAITING, BattleStatus.ACTIVE]),
        )
        .options(
            selectinload(Battle.participants).selectinload(BattleParticipant.user)
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def join_room(
    session: AsyncSession,
    invite_code: str,
    user_id: int,
) -> tuple[BattleRoom, Battle, bool]:
    """Join a room via invite code.

    Returns ``(room, battle, already_joined)``.
    """
    room = await get_room_by_code(session, invite_code)
    if room is None:
        raise ValueError(f"Room with code '{invite_code}' not found or inactive")

    battle = await get_room_battle(session, room.id)
    if battle is None:
        raise ValueError("No active battle in this room")

    if battle.status != BattleStatus.WAITING:
        raise ValueError("Battle has already started")

    # Check if already joined
    result = await session.execute(
        select(BattleParticipant).where(
            BattleParticipant.battle_id == battle.id,
            BattleParticipant.user_id == user_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return room, battle, True  # already joined

    # Count current participants
    count_result = await session.execute(
        select(func.count())
        .select_from(BattleParticipant)
        .where(BattleParticipant.battle_id == battle.id)
    )
    count = count_result.scalar_one()

    new_count = count + 1

    # Add participant with bracket position
    participant = BattleParticipant(
        battle_id=battle.id,
        user_id=user_id,
        bracket_position=count,  # 0-indexed seeding
    )
    session.add(participant)
    await session.flush()

    logger.info(
        "User %d joined room %s (battle %s), position %d, total %d/%d",
        user_id, room.invite_code, battle.id, count, new_count, room.max_players,
    )

    if new_count >= room.max_players:
        from app.services.battle_service import _start_battle
        await _start_battle(session, battle)
        # Create a new room with the same name to keep the cycle going
        await create_room(session, creator_id=room.creator_id, name=room.name)
        logger.info("Room %s reached max players, battle %s started. A new room was automatically created.", room.invite_code, battle.id)

    return room, battle, False


async def get_room_participants_count(
    session: AsyncSession,
    battle_id: uuid.UUID,
) -> int:
    """Get the number of participants in a battle."""
    from sqlalchemy import func
    result = await session.execute(
        select(func.count())
        .select_from(BattleParticipant)
        .where(BattleParticipant.battle_id == battle_id)
    )
    return result.scalar_one()


async def list_active_rooms(session: AsyncSession) -> list[BattleRoom]:
    """List all active rooms with waiting battles."""
    result = await session.execute(
        select(BattleRoom)
        .join(Battle, BattleRoom.id == Battle.room_id)
        .where(
            BattleRoom.is_active == True,
            Battle.status == BattleStatus.WAITING
        )
        .order_by(BattleRoom.created_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())


# Import at bottom to avoid circular
from sqlalchemy import func
