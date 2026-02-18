"""Payment service — Telegram Stars purchases (rockets & VIP)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.models import Transaction, TransactionType, User

logger = logging.getLogger(__name__)


# ── Package helpers ───────────────────────────────────────────

def get_rocket_packages() -> dict[int, int]:
    """Return the available {stars: rockets} packages."""
    return settings.ROCKET_PACKAGES


def rockets_for_stars(stars: int) -> int | None:
    """Look up how many rockets a given star amount buys.

    Returns ``None`` if the star amount doesn't match any package.
    """
    return settings.ROCKET_PACKAGES.get(stars)


# ── Purchase Processing ──────────────────────────────────────

async def process_rocket_purchase(
    session: AsyncSession,
    user_id: int,
    stars_paid: int,
) -> int:
    """Credit rockets after a successful Telegram Stars payment.

    Returns the number of rockets awarded.
    Raises ``ValueError`` if the star amount is invalid.
    """
    rockets = rockets_for_stars(stars_paid)
    if rockets is None:
        raise ValueError(f"No package found for {stars_paid} stars")

    user = await session.get(User, user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")

    user.balance += rockets

    session.add(Transaction(
        user_id=user_id,
        amount=rockets,
        type=TransactionType.PURCHASE,
        stars_paid=stars_paid,
    ))
    await session.flush()

    logger.info(
        "Rocket purchase: user=%d stars=%d rockets=%d new_balance=%d",
        user_id, stars_paid, rockets, user.balance,
    )
    return rockets


async def process_vip_purchase(
    session: AsyncSession,
    user_id: int,
) -> User:
    """Activate (or extend) VIP status after Stars payment.

    Returns the updated user.
    """
    user = await session.get(User, user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")

    now = datetime.now(timezone.utc)
    if user.is_vip and user.vip_expire_date and user.vip_expire_date > now:
        # Extend existing VIP
        user.vip_expire_date += timedelta(days=settings.VIP_DURATION_DAYS)
    else:
        # Fresh VIP activation
        user.is_vip = True
        user.vip_expire_date = now + timedelta(days=settings.VIP_DURATION_DAYS)

    session.add(Transaction(
        user_id=user_id,
        amount=0,
        type=TransactionType.VIP,
        stars_paid=settings.VIP_PRICE_STARS,
    ))
    await session.flush()

    logger.info(
        "VIP activated: user=%d until=%s",
        user_id, user.vip_expire_date,
    )
    return user
