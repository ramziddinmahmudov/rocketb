"""Daily Tasks API — get tasks, claim rewards."""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.database import base
from app.services import daily_task_service
from app.web.auth import AuthError, validate_init_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/daily-tasks", tags=["daily_tasks"])


# ── Schemas ───────────────────────────────────────────────────


class TaskSchema(BaseModel):
    id: int
    title: str
    description: str
    rocket_reward: int
    task_type: str
    target_count: int
    progress: int
    completed: bool
    claimed: bool


class TaskListResponse(BaseModel):
    tasks: list[TaskSchema]
    total_unclaimed: int


class ClaimResponse(BaseModel):
    success: bool
    rockets_earned: int
    new_balance: int | None = None


class ErrorResponse(BaseModel):
    detail: str


# ── Endpoints ─────────────────────────────────────────────────


@router.get("", response_model=TaskListResponse)
async def get_daily_tasks(
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> TaskListResponse:
    """Get today's daily tasks with progress."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        user_tasks = await daily_task_service.get_daily_tasks(session, user_id)
        await session.commit()

        tasks = []
        total_unclaimed = 0
        for udt in user_tasks:
            task = udt.task
            if task is None:
                continue
            if udt.completed and not udt.claimed:
                total_unclaimed += 1
            tasks.append(TaskSchema(
                id=udt.id,
                title=task.title,
                description=task.description,
                rocket_reward=task.rocket_reward,
                task_type=task.task_type.value,
                target_count=task.target_count,
                progress=udt.progress,
                completed=udt.completed,
                claimed=udt.claimed,
            ))

        return TaskListResponse(tasks=tasks, total_unclaimed=total_unclaimed)


@router.post("/{task_id}/claim", response_model=ClaimResponse)
async def claim_task(
    task_id: int,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> ClaimResponse:
    """Claim reward for a completed daily task."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        try:
            rockets = await daily_task_service.claim_task_reward(
                session, user_id, task_id
            )
            await session.commit()

            # Get updated balance
            from app.services import user_service
            balance = await user_service.get_balance(session, user_id)

            return ClaimResponse(
                success=True,
                rockets_earned=rockets,
                new_balance=balance,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            await session.rollback()
            logger.error("Failed to claim task: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to claim task")
