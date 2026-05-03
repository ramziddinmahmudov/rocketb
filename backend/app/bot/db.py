"""Direct DB access for the bot. Uses the same async engine as the main API."""
import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, func, select, update

from ..database import AsyncSessionLocal
from ..models import MatchHistory, Task, User, UserTask
from .config import ADMIN_IDS, DAILY_BONUS, REFERRAL_BONUS


def user_to_dict(u: User) -> Dict[str, Any]:
    return {
        "id": u.id,
        "username": u.username,
        "first_name": u.first_name,
        "rockets_balance": u.rockets_balance,
        "wins": u.wins,
        "total_played": u.total_played,
        "level": u.level,
        "xp": u.xp,
        "coins": u.coins,
        "is_admin": u.is_admin,
        "referrals_count": u.referrals_count,
        "referred_by": u.referred_by,
    }


async def ensure_user(tg_user) -> Dict[str, Any]:
    """Create the user on first /start; grant daily bonus on a new calendar day."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).filter(User.id == tg_user.id))
        u = res.scalars().first()
        created = False
        if not u:
            u = User(
                id=tg_user.id,
                username=tg_user.username,
                first_name=tg_user.first_name or "Player",
                is_admin=(tg_user.id in ADMIN_IDS),
            )
            db.add(u)
            created = True
        else:
            # Sync display fields if Telegram changed them.
            if tg_user.username and tg_user.username != u.username:
                u.username = tg_user.username
            if tg_user.first_name and tg_user.first_name != u.first_name:
                u.first_name = tg_user.first_name
            if tg_user.id in ADMIN_IDS and not u.is_admin:
                u.is_admin = True

        # Daily bonus
        today = datetime.date.today().isoformat()
        bonus_granted = False
        if u.last_login_date != today:
            u.last_login_date = today
            u.rockets_balance += DAILY_BONUS
            bonus_granted = True

        await db.commit()
        await db.refresh(u)
        data = user_to_dict(u)
        data["_created"] = created
        data["_daily_bonus"] = bonus_granted
        return data


async def get_user(user_id: int) -> Optional[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).filter(User.id == user_id))
        u = res.scalars().first()
        return user_to_dict(u) if u else None


async def is_admin(user_id: int) -> bool:
    if user_id in ADMIN_IDS:
        return True
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User.is_admin).filter(User.id == user_id))
        v = res.scalar()
        return bool(v)


async def register_referral(new_user_id: int, referrer_id: int) -> bool:
    """Return True if a new referral was registered (i.e. first time)."""
    if new_user_id == referrer_id:
        return False
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).filter(User.id == new_user_id))
        u = res.scalars().first()
        if not u or u.referred_by is not None:
            return False
        ref_res = await db.execute(select(User).filter(User.id == referrer_id))
        referrer = ref_res.scalars().first()
        if not referrer:
            return False
        u.referred_by = referrer_id
        referrer.referrals_count = (referrer.referrals_count or 0) + 1
        referrer.rockets_balance += REFERRAL_BONUS
        await db.commit()
        return True


async def credit_rockets(user_id: int, amount: int) -> Optional[int]:
    """Add (or subtract, if negative) rockets atomically. Returns new balance or None if user missing."""
    async with AsyncSessionLocal() as db:
        if amount < 0:
            # Don't let admin pushes drop the balance below zero.
            stmt = (
                update(User)
                .where(User.id == user_id, User.rockets_balance + amount >= 0)
                .values(rockets_balance=User.rockets_balance + amount)
                .returning(User.rockets_balance)
            )
        else:
            stmt = (
                update(User)
                .where(User.id == user_id)
                .values(rockets_balance=User.rockets_balance + amount)
                .returning(User.rockets_balance)
            )
        res = await db.execute(stmt)
        new_balance = res.scalar()
        await db.commit()
        return new_balance


async def set_level(user_id: int, level: int) -> bool:
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            update(User).where(User.id == user_id).values(level=max(1, level), xp=0)
        )
        await db.commit()
        return res.rowcount > 0


async def toggle_admin(user_id: int) -> Optional[bool]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).filter(User.id == user_id))
        u = res.scalars().first()
        if not u:
            return None
        u.is_admin = not u.is_admin
        await db.commit()
        return u.is_admin


async def get_top_players(limit: int = 10) -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(User)
            .order_by(desc(User.level), desc(User.xp), desc(User.wins))
            .limit(limit)
        )
        return [user_to_dict(u) for u in res.scalars().all()]


async def get_global_stats() -> Dict[str, int]:
    async with AsyncSessionLocal() as db:
        total_users = await db.scalar(select(func.count(User.id))) or 0
        total_matches = await db.scalar(select(func.count(MatchHistory.id))) or 0
        total_rockets_in_circulation = await db.scalar(select(func.sum(User.rockets_balance))) or 0
        total_rockets_used = await db.scalar(select(func.sum(User.rockets_used))) or 0
        active_today = await db.scalar(
            select(func.count(User.id)).filter(User.last_login_date == datetime.date.today().isoformat())
        ) or 0
        return {
            "total_users": int(total_users),
            "total_matches": int(total_matches),
            "rockets_in_circulation": int(total_rockets_in_circulation),
            "rockets_used": int(total_rockets_used),
            "active_today": int(active_today),
        }


async def find_user(query: str) -> Optional[Dict[str, Any]]:
    """Find by id (numeric) or by username (case-insensitive, with or without @)."""
    query = query.strip().lstrip("@")
    async with AsyncSessionLocal() as db:
        if query.isdigit():
            res = await db.execute(select(User).filter(User.id == int(query)))
        else:
            res = await db.execute(
                select(User).filter(func.lower(User.username) == query.lower())
            )
        u = res.scalars().first()
        return user_to_dict(u) if u else None


async def get_all_user_ids(positive_only: bool = True) -> List[int]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User.id))
        ids = [r[0] for r in res.all()]
        if positive_only:
            ids = [i for i in ids if i > 0]
        return ids


async def count_referrals(user_id: int) -> int:
    async with AsyncSessionLocal() as db:
        v = await db.scalar(select(User.referrals_count).filter(User.id == user_id))
        return int(v or 0)


async def list_tasks() -> List[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Task))
        return [
            {
                "id": t.id,
                "title": t.title,
                "reward": t.reward,
                "task_type": t.task_type,
                "target_count": t.target_count,
                "channel_url": t.channel_url,
            }
            for t in res.scalars().all()
        ]


async def add_task(title: str, reward: int, task_type: str = "custom", target_count: int = 1,
                   channel_id: Optional[str] = None, channel_url: Optional[str] = None) -> int:
    async with AsyncSessionLocal() as db:
        t = Task(
            title=title,
            reward=reward,
            task_type=task_type,
            target_count=target_count,
            channel_id=channel_id,
            channel_url=channel_url,
        )
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id


async def delete_task(task_id: int) -> bool:
    from sqlalchemy import delete as sql_delete
    async with AsyncSessionLocal() as db:
        await db.execute(sql_delete(UserTask).where(UserTask.task_id == task_id))
        res = await db.execute(sql_delete(Task).where(Task.id == task_id))
        await db.commit()
        return res.rowcount > 0
