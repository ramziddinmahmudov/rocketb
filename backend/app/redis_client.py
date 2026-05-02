import os
import redis.asyncio as redis

# Create a global redis connection pool
redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Use decode_responses=True so that strings are returned instead of bytes
redis_client = redis.from_url(redis_url, decode_responses=True)

async def get_redis():
    """Dependency for fastapi if needed"""
    return redis_client
