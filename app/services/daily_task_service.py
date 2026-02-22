"""Daily task service — create, track, and claim daily tasks."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.database.models import (
    DailyTask,
    DailyTaskType,
    Transaction,
    TransactionType,
    User,
    UserDailyTask,
)

logger = logging.getLogger(__name__)


# ── Default daily tasks (seeded on first run) ────────────────

DEFAULT_TASKS = [
    {
        "title": "🎮 Battle ga qo'shiling",
        "description": "Bugun 1 ta battle ga qo'shiling",
        "rocket_reward": 50,
        "task_type": DailyTaskType.PLAY_BATTLE,
        "target_count": 1,
    },
    {
        "title": "🏆 Raund yuting",
        "description": "Bugun 3 ta raund yuting",
        "rocket_reward": 100,
        "task_type": DailyTaskType.WIN_ROUND,
        "target_count": 3,
    },
    {
        "title": "🎁 Do'stingizga raketa yuboring",
        "description": "Do'stingizga kamida 10 ta raketa yuboring",
        "rocket_reward": 30,
        "task_type": DailyTaskType.GIFT_ROCKETS,
        "target_count": 1,
    },
    {
        "title": "👥 Do'stni taklif qiling",
        "description": "1 ta do'stingizni taklif qiling",
        "rocket_reward": 50,
        "task_type": DailyTaskType.INVITE_FRIEND,
        "target_count": 1,
    },
]


async def seed_default_tasks(session: AsyncSession) -> None:
    """Seed default daily tasks if none exist."""
    result = await session.execute(select(DailyTask).limit(1))
    if result.scalar_one_or_none() is not None:
        return  # Tasks already exist

    for task_data in DEFAULT_TASKS:
        task = DailyTask(**task_data)
        session.add(task)

    await session.flush()
    logger.info("Seeded %d default daily tasks", len(DEFAULT_TASKS))


async def get_daily_tasks(
    session: AsyncSession,
    user_id: int,
) -> list[UserDailyTask]:
    """Get today's tasks for a user, creating UserDailyTask records as needed.

    Returns a list of UserDailyTask with the `task` relationship loaded.
    """
    today = date.today()

    # Get all active task templates
    result = await session.execute(
        select(DailyTask).where(DailyTask.is_active == True)
    )
    all_tasks = list(result.scalars().all())

    # Get user's existing task records for today
    result = await session.execute(
        select(UserDailyTask).where(
            UserDailyTask.user_id == user_id,
            UserDailyTask.task_date == today,
        )
    )
    existing = {udt.task_id: udt for udt in result.scalars().all()}

    # Create missing records
    user_tasks = []
    for task in all_tasks:
        if task.id in existing:
            user_tasks.append(existing[task.id])
        else:
            udt = UserDailyTask(
                user_id=user_id,
                task_id=task.id,
                task_date=today,
            )
            session.add(udt)
            user_tasks.append(udt)

    await session.flush()

    # Re-fetch with relationships
    result = await session.execute(
        select(UserDailyTask)
        .where(
            UserDailyTask.user_id == user_id,
            UserDailyTask.task_date == today,
        )
    )
    return list(result.scalars().all())


async def update_task_progress(
    session: AsyncSession,
    user_id: int,
    task_type: DailyTaskType,
    increment: int = 1,
) -> None:
    """Increment progress on all matching daily tasks for today.

    Automatically marks as completed when target is reached.
    """
    today = date.today()

    # Find matching task templates
    result = await session.execute(
        select(DailyTask).where(
            DailyTask.task_type == task_type,
            DailyTask.is_active == True,
        )
    )
    matching_tasks = list(result.scalars().all())

    for task in matching_tasks:
        # Get or create user task record
        result = await session.execute(
            select(UserDailyTask).where(
                UserDailyTask.user_id == user_id,
                UserDailyTask.task_id == task.id,
                UserDailyTask.task_date == today,
            )
        )
        udt = result.scalar_one_or_none()

        if udt is None:
            udt = UserDailyTask(
                user_id=user_id,
                task_id=task.id,
                task_date=today,
            )
            session.add(udt)
            await session.flush()

        if udt.completed:
            continue  # Already done

        udt.progress = min(udt.progress + increment, task.target_count)
        if udt.progress >= task.target_count:
            udt.completed = True
            logger.info(
                "User %d completed daily task '%s'",
                user_id, task.title,
            )

    await session.flush()


async def claim_task_reward(
    session: AsyncSession,
    user_id: int,
    user_task_id: int,
) -> int:
    """Claim the reward for a completed daily task.

    Returns the rocket amount earned.
    Raises ValueError if task is not completed or already claimed.
    """
    result = await session.execute(
        select(UserDailyTask).where(
            UserDailyTask.id == user_task_id,
            UserDailyTask.user_id == user_id,
        )
    )
    udt = result.scalar_one_or_none()

    if udt is None:
        raise ValueError("Task not found")
    if not udt.completed:
        raise ValueError("Task not yet completed")
    if udt.claimed:
        raise ValueError("Reward already claimed")

    # Get the task template for reward amount
    task = await session.get(DailyTask, udt.task_id)
    if task is None:
        raise ValueError("Task template not found")

    # Award rockets
    user = await session.get(User, user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")

    user.balance += task.rocket_reward
    udt.claimed = True

    # Record transaction
    session.add(Transaction(
        user_id=user_id,
        amount=task.rocket_reward,
        type=TransactionType.DAILY_TASK,
    ))

    await session.flush()
    logger.info(
        "User %d claimed %d rockets for task '%s'",
        user_id, task.rocket_reward, task.title,
    )

    return task.rocket_reward


async def reset_daily_rockets(
    session: AsyncSession,
    user_id: int,
) -> int:
    """Reset the user's daily rocket limit. Returns the new limit."""
    user = await session.get(User, user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")

    is_vip = user.is_vip and (
        user.vip_expire_date is not None
        and user.vip_expire_date > datetime.now(timezone.utc)
    )

    limit = settings.DAILY_ROCKETS_VIP if is_vip else settings.DAILY_ROCKETS_STANDARD
    user.daily_rockets_remaining = limit
    user.daily_rockets_reset_at = datetime.now(timezone.utc)

    await session.flush()
    logger.info("Reset daily rockets for user %d to %d", user_id, limit)
    return limit
