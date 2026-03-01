import asyncio
from sqlalchemy import text
from app.database.base import engine

async def update_rooms():
    async with engine.begin() as conn:
        print("Updating active rooms to max 4 players...")
        await conn.execute(text("UPDATE battle_rooms SET max_players = 4 WHERE is_active = true;"))
        print("Updating active battles to max 2 rounds...")
        await conn.execute(text("UPDATE battles SET total_rounds = 2 WHERE status IN ('waiting', 'active');"))
        print("Done.")

if __name__ == "__main__":
    asyncio.run(update_rooms())
