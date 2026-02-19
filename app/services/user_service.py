"""User service — registration, balance, referrals."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.models import Referral, Transaction, TransactionType, User

logger = logging.getLogger(__name__)


async def get_or_create_user(
    session: AsyncSession,
    user_id: int,
    username: str | None = None,
    referrer_id: int | None = None,
) -> tuple[User, bool]:
    """Register a user if they don't exist, handling referral bonuses.

    Returns ``(user, created)`` where *created* is ``True`` for new users.
    """
    user = await session.get(User, user_id)
    if user is not None:
        # Update username if it changed
        if username and user.username != username:
            user.username = username
            await session.flush()
        logger.debug("Retrieved existing user: %d", user_id)
        return user, False

    # ── New user ──────────────────────────────────────────────
    user = User(
        id=user_id,
        username=username,
        balance=settings.INITIAL_ROCKETS,
        referrer_id=referrer_id if referrer_id and referrer_id != user_id else None,
    )
    session.add(user)
    await session.flush()

    # Log the initial balance transaction
    session.add(Transaction(
        user_id=user_id,
        amount=settings.INITIAL_ROCKETS,
        type=TransactionType.REWARD,
    ))

    # ── Referral bonus ────────────────────────────────────────
    if referrer_id and referrer_id != user_id:
        referrer = await session.get(User, referrer_id)
        if referrer is not None:
            bonus = settings.REFERRAL_BONUS

            # Give bonus to referrer
            referrer.balance += bonus
            session.add(Transaction(
                user_id=referrer_id,
                amount=bonus,
                type=TransactionType.REFERRAL,
            ))

            # Give bonus to new user
            user.balance += bonus
            session.add(Transaction(
                user_id=user_id,
                amount=bonus,
                type=TransactionType.REFERRAL,
            ))

            # Record the referral
            session.add(Referral(
                referrer_id=referrer_id,
                referred_id=user_id,
                bonus_given=bonus,
            ))

            logger.info(
                "Referral bonus: referrer=%d → referred=%d (+%d each)",
                referrer_id, user_id, bonus,
            )

    logger.info("Created new user: %d (referrer: %s)", user_id, referrer_id)
    await session.flush()
    return user, True


async def get_user(session: AsyncSession, user_id: int) -> User | None:
    """Fetch a user by Telegram ID."""
    return await session.get(User, user_id)


async def get_balance(session: AsyncSession, user_id: int) -> int:
    """Return the user's current rocket balance."""
    result = await session.execute(
        select(User.balance).where(User.id == user_id),
    )
    row = result.scalar_one_or_none()
    return row if row is not None else 0


async def add_rockets(
    session: AsyncSession,
    user_id: int,
    amount: int,
    tx_type: TransactionType,
    stars_paid: int | None = None,
) -> int:
    """Credit rockets to a user and record the transaction.

    Returns the updated balance.
    """
    result = await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(balance=User.balance + amount)
        .returning(User.balance),
    )
    new_balance = result.scalar_one()

    session.add(Transaction(
        user_id=user_id,
        amount=amount,
        type=tx_type,
        stars_paid=stars_paid,
    ))
    await session.flush()
    return new_balance


async def deduct_rockets(session: AsyncSession, user_id: int, amount: int) -> int:
    """Debit rockets from a user with row-level locking (FOR UPDATE).

    Raises ``ValueError`` if balance is insufficient.
    Returns the updated balance.
    """
    # Lock the row to prevent concurrent modifications
    result = await session.execute(
        select(User)
        .where(User.id == user_id)
        .with_for_update(),
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError(f"User {user_id} not found")

    if user.balance < amount:
        raise ValueError(
            f"Insufficient balance: have {user.balance}, need {amount}"
        )

    user.balance -= amount

    session.add(Transaction(
        user_id=user_id,
        amount=-amount,
        type=TransactionType.VOTE,
    ))
    await session.flush()
    return user.balance


async def set_vip(
    session: AsyncSession,
    user_id: int,
    duration_days: int = 30,
) -> User:
    """Activate VIP status for the user."""
    user = await session.get(User, user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")

    user.is_vip = True
    user.vip_expire_date = datetime.now(timezone.utc).replace(
        day=datetime.now(timezone.utc).day + duration_days,
    )
    await session.flush()
    return user
