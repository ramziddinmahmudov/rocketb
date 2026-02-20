"""Admin service — logic for managing users and system actions."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.models import Transaction, TransactionType, User, BattleParticipant
from app.services.redis_service import RedisService

logger = logging.getLogger(__name__)


async def get_user_by_input(
    session: AsyncSession,
    input_str: str,
) -> User | None:
    """Find a user by ID (int) or Username (str)."""
    # Try as ID
    if input_str.isdigit():
        user_id = int(input_str)
        return await session.get(User, user_id)

    # Try as Username
    username = input_str.lstrip("@")
    result = await session.execute(
        select(User).where(User.username == username)
    )
    return result.scalar_one_or_none()


async def get_total_users(session: AsyncSession) -> int:
    """Return total number of registered users."""
    # Approximate count is fine, but precise is better for admin
    # For speed on large DBs, select(func.count(User.id)) is better
    from sqlalchemy import func
    result = await session.execute(select(func.count(User.id)))
    return result.scalar_one()


async def grant_vip(
    session: AsyncSession,
    user_id: int,
    duration_days: int = 30,
) -> User:
    """Grant VIP status to a user."""
    user = await session.get(User, user_id)
    if not user:
        raise ValueError("User not found")

    now = datetime.now(timezone.utc)
    
    # If already VIP and not expired, extend
    if user.is_vip and user.vip_expire_date and user.vip_expire_date > now:
        user.vip_expire_date += timedelta(days=duration_days)
    else:
        user.is_vip = True
        user.vip_expire_date = now + timedelta(days=duration_days)

    # Log transaction (0 cost)
    tx = Transaction(
        user_id=user_id,
        amount=0,
        type=TransactionType.VIP,
        stars_paid=0,
    )
    session.add(tx)
    await session.flush()
    
    logger.info("Admin granted VIP to %d for %d days", user_id, duration_days)
    return user


async def add_balance(
    session: AsyncSession,
    user_id: int,
    amount: int,
) -> User:
    """Add (or subtract) rockets from user balance."""
    user = await session.get(User, user_id)
    if not user:
        raise ValueError("User not found")

    user.balance += amount
    
    tx = Transaction(
        user_id=user_id,
        amount=amount,
        type=TransactionType.REWARD,  # Or a new ADMIN_ADJUST type
    )
    session.add(tx)
    await session.flush()

    logger.info("Admin adjusted balance of %d by %d", user_id, amount)
    return user


async def get_all_users_for_broadcast(session: AsyncSession) -> list[int]:
    """Return list of all user IDs for broadcasting."""
    # CAUTION: In production with millions of users, use batching or a queue.
    result = await session.execute(select(User.id))
    return list(result.scalars().all())
