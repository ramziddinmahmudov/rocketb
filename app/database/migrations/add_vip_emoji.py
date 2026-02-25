import asyncio
import logging
from sqlalchemy import text
from app.database.base import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_migration():
    """Add vip_emoji column to users table."""
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN vip_emoji VARCHAR(10);"))
            logger.info("Successfully added vip_emoji column to users table.")
        except Exception as e:
            logger.error("Error adding column (might already exist): %s", e)

if __name__ == "__main__":
    asyncio.run(run_migration())
