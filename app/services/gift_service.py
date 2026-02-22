"""Gift service — send rockets to friends with daily limits."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.models import (
    RocketGift,
    Transaction,
    TransactionType,
    User,
)

logger = logging.getLogger(__name__)


async def get_gift_limit_for_receiver(
    session: AsyncSession,
    sender_id: int,
    receiver_id: int,
) -> int:
    """Get remaining gift limit from sender to a specific receiver today.

    Standard users: 100 per friend per day
    VIP users: 900 per friend per day
    """
    sender = await session.get(User, sender_id)
    if sender is None:
        raise ValueError(f"Sender {sender_id} not found")

    is_vip = sender.is_vip and (
        sender.vip_expire_date is not None
        and sender.vip_expire_date > datetime.now(timezone.utc)
    )
    max_limit = settings.GIFT_LIMIT_VIP if is_vip else settings.GIFT_LIMIT_STANDARD

    # Count today's gifts to this specific receiver
    today = date.today()
    result = await session.execute(
        select(func.coalesce(func.sum(RocketGift.amount), 0))
        .where(
            RocketGift.sender_id == sender_id,
            RocketGift.receiver_id == receiver_id,
            func.date(RocketGift.created_at) == today,
        )
    )
    sent_today = result.scalar_one()

    return max(0, max_limit - sent_today)


async def send_rockets(
    session: AsyncSession,
    sender_id: int,
    receiver_id: int,
    amount: int,
) -> tuple[int, int]:
    """Send rockets from sender to receiver.

    Returns (sender_new_balance, receiver_new_balance).
    Raises ValueError on insufficient balance or exceeded limit.
    """
    if amount <= 0:
        raise ValueError("Gift amount must be positive")

    if sender_id == receiver_id:
        raise ValueError("Cannot gift to yourself")

    # Check sender exists and has balance
    sender = await session.get(User, sender_id)
    if sender is None:
        raise ValueError(f"Sender {sender_id} not found")

    receiver = await session.get(User, receiver_id)
    if receiver is None:
        raise ValueError(f"Receiver {receiver_id} not found")

    if sender.balance < amount:
        raise ValueError(
            f"Insufficient balance: have {sender.balance}, need {amount}"
        )

    # Check gift limit
    remaining_limit = await get_gift_limit_for_receiver(
        session, sender_id, receiver_id
    )
    if amount > remaining_limit:
        raise ValueError(
            f"Gift limit exceeded: can send {remaining_limit} more to this friend today"
        )

    # Transfer rockets
    sender.balance -= amount
    receiver.balance += amount

    # Record gift
    gift = RocketGift(
        sender_id=sender_id,
        receiver_id=receiver_id,
        amount=amount,
    )
    session.add(gift)

    # Record transactions
    session.add(Transaction(
        user_id=sender_id,
        amount=-amount,
        type=TransactionType.GIFT_SENT,
    ))
    session.add(Transaction(
        user_id=receiver_id,
        amount=amount,
        type=TransactionType.GIFT_RECEIVED,
    ))

    await session.flush()

    logger.info(
        "Gift: %d → %d (%d rockets). Sender balance: %d, Receiver balance: %d",
        sender_id, receiver_id, amount, sender.balance, receiver.balance,
    )

    return sender.balance, receiver.balance


async def get_gifts_sent_today(
    session: AsyncSession,
    user_id: int,
) -> list[RocketGift]:
    """Get all gifts sent by a user today."""
    today = date.today()
    result = await session.execute(
        select(RocketGift)
        .where(
            RocketGift.sender_id == user_id,
            func.date(RocketGift.created_at) == today,
        )
        .order_by(RocketGift.created_at.desc())
    )
    return list(result.scalars().all())


async def get_total_sent_today(
    session: AsyncSession,
    user_id: int,
) -> int:
    """Get total rockets gifted by a user today."""
    today = date.today()
    result = await session.execute(
        select(func.coalesce(func.sum(RocketGift.amount), 0))
        .where(
            RocketGift.sender_id == user_id,
            func.date(RocketGift.created_at) == today,
        )
    )
    return result.scalar_one()
