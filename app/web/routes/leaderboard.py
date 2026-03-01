"""Global Leaderboard API endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func

from app.database import base
from app.database.models import User, BattleParticipant
from app.web.auth import AuthError, validate_init_data

import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["leaderboard"])


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    username: str | None
    first_name: str | None
    score: int
    is_vip: bool
    vip_emoji: str | None


class LeaderboardResponse(BaseModel):
    my_rank: int | None
    my_score: int
    entries: list[LeaderboardEntry]


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
    limit: int = Query(50, ge=1, le=100),
) -> LeaderboardResponse:
    """
    Return global leaderboard ranked by total battle score (sum of all
    BattleParticipant.score), falling back to balance if no battles played.
    """
    try:
        user_data = validate_init_data(x_telegram_init_data)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    my_user_id = user_data["id"]

    if not base.async_session_factory:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        # Compute total score for each user across all battles
        score_subq = (
            select(
                BattleParticipant.user_id,
                sa_func.coalesce(sa_func.sum(BattleParticipant.score), 0).label("total_score"),
            )
            .group_by(BattleParticipant.user_id)
            .subquery()
        )

        # Join users with their total scores, order by score desc then balance desc
        stmt = (
            select(
                User.id,
                User.username,
                User.first_name,
                User.balance,
                User.is_vip,
                User.vip_emoji,
                sa_func.coalesce(score_subq.c.total_score, 0).label("total_score"),
            )
            .outerjoin(score_subq, User.id == score_subq.c.user_id)
            .order_by(
                sa_func.coalesce(score_subq.c.total_score, 0).desc(),
                User.balance.desc(),
            )
            .limit(limit)
        )

        result = await session.execute(stmt)
        rows = result.all()

        entries: list[LeaderboardEntry] = []
        my_rank = None
        my_score = 0

        for idx, row in enumerate(rows, start=1):
            entry = LeaderboardEntry(
                rank=idx,
                user_id=row.id,
                username=row.username,
                first_name=row.first_name,
                score=row.total_score if row.total_score else row.balance,
                is_vip=row.is_vip,
                vip_emoji=row.vip_emoji,
            )
            entries.append(entry)
            if row.id == my_user_id:
                my_rank = idx
                my_score = entry.score

        # If user not in top N, compute their rank separately
        if my_rank is None:
            my_total_stmt = (
                select(
                    sa_func.coalesce(sa_func.sum(BattleParticipant.score), 0)
                )
                .where(BattleParticipant.user_id == my_user_id)
            )
            my_total_result = await session.execute(my_total_stmt)
            my_total = my_total_result.scalar() or 0

            if my_total == 0:
                # Fall back to balance
                user_result = await session.execute(
                    select(User.balance).where(User.id == my_user_id)
                )
                my_score = user_result.scalar() or 0
            else:
                my_score = my_total

            # Count how many users have a higher score
            rank_stmt = (
                select(sa_func.count())
                .select_from(
                    select(
                        User.id,
                        sa_func.coalesce(score_subq.c.total_score, 0).label("ts"),
                    )
                    .outerjoin(score_subq, User.id == score_subq.c.user_id)
                    .where(
                        sa_func.coalesce(score_subq.c.total_score, 0) > my_score
                    )
                    .subquery()
                )
            )
            rank_result = await session.execute(rank_stmt)
            my_rank = (rank_result.scalar() or 0) + 1

        return LeaderboardResponse(
            my_rank=my_rank,
            my_score=my_score,
            entries=entries,
        )
