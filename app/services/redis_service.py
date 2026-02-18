"""Redis service — atomic vote limits, cooldowns, and locking.

All vote-limit operations use a Lua script to guarantee atomicity
even under high concurrency, preventing double-spending.
"""

from __future__ import annotations

import redis.asyncio as aioredis


# ── Lua Scripts ───────────────────────────────────────────────

# Atomically: if current >= amount then DECRBY else return -1.
_LUA_DECREMENT = """
local current = tonumber(redis.call('GET', KEYS[1]) or 0)
local amount  = tonumber(ARGV[1])
if current >= amount then
    return redis.call('DECRBY', KEYS[1], amount)
else
    return -1
end
"""


class RedisService:
    """Thread-safe wrapper around Redis for voting mechanics.

    Key schema
    ----------
    vote_limit:{user_id}   – remaining votes this cycle (int)
    cooldown:{user_id}     – exists while user is on cooldown (TTL)
    throttle:{user_id}     – per-user request throttle (TTL)
    """

    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis
        self._decrement_script = self._redis.register_script(_LUA_DECREMENT)

    # ── Vote Limit ────────────────────────────────────────────

    async def get_vote_limit(self, user_id: int) -> int | None:
        """Return the remaining vote limit, or ``None`` if unset."""
        val = await self._redis.get(f"vote_limit:{user_id}")
        return int(val) if val is not None else None

    async def init_vote_limit(self, user_id: int, limit: int) -> bool:
        """Set the vote limit only if it doesn't already exist (NX).

        Returns ``True`` if the key was set, ``False`` if it already existed.
        """
        return await self._redis.set(
            f"vote_limit:{user_id}", limit, nx=True,
        )

    async def decrement_vote_limit(self, user_id: int, amount: int) -> int:
        """Atomically decrement the vote limit.

        Returns the new value on success, or **-1** if the user has
        insufficient remaining votes.  Uses a Lua script so the
        check-and-decrement is a single atomic operation.
        """
        result = await self._decrement_script(
            keys=[f"vote_limit:{user_id}"],
            args=[amount],
        )
        return int(result)

    async def restore_vote_limit(self, user_id: int, amount: int) -> int:
        """Restore (INCRBY) vote limit — used on transaction rollback."""
        return await self._redis.incrby(f"vote_limit:{user_id}", amount)

    async def reset_vote_limit(self, user_id: int) -> None:
        """Delete the vote limit key (full reset)."""
        await self._redis.delete(f"vote_limit:{user_id}")

    # ── Cooldown ──────────────────────────────────────────────

    async def is_on_cooldown(self, user_id: int) -> bool:
        """Check whether the user is on a voting cooldown."""
        return await self._redis.exists(f"cooldown:{user_id}") > 0

    async def start_cooldown(self, user_id: int, seconds: int) -> None:
        """Start a cooldown timer for the user."""
        await self._redis.setex(f"cooldown:{user_id}", seconds, "1")

    async def get_cooldown_ttl(self, user_id: int) -> int:
        """Seconds remaining on cooldown, or -2 if expired / not set."""
        return await self._redis.ttl(f"cooldown:{user_id}")

    # ── Throttle (general-purpose) ────────────────────────────

    async def is_throttled(self, user_id: int) -> bool:
        """Return ``True`` if the user has been throttled."""
        return await self._redis.exists(f"throttle:{user_id}") > 0

    async def set_throttle(self, user_id: int, seconds: int = 1) -> None:
        """Set a short-lived throttle key (default 1 s)."""
        await self._redis.setex(f"throttle:{user_id}", seconds, "1")


# ── Module-level reference (set at startup) ──────────────────

_instance: RedisService | None = None


def setup_redis(url: str) -> RedisService:
    """Create the global ``RedisService`` instance."""
    global _instance
    pool = aioredis.from_url(url, decode_responses=True)
    _instance = RedisService(pool)
    return _instance


def get_redis() -> RedisService:
    """Return the current ``RedisService`` (raises if not initialised)."""
    if _instance is None:
        raise RuntimeError("RedisService has not been initialised — call setup_redis() first")
    return _instance


async def close_redis() -> None:
    """Close the underlying Redis connection pool."""
    global _instance
    if _instance is not None:
        await _instance._redis.aclose()     # type: ignore[union-attr]
        _instance = None
