import asyncio
from sqlalchemy import select
from app.database import base
from app.database.models import User, Transaction

async def main():
    # await base.init_models() # not needed/doesn't exist
    # from app.main import lifespan # Removed
    from contextlib import asynccontextmanager
    from contextlib import asynccontextmanager
    
    # We need to init the DB connection. Ideally reuse app's logic.
    # But for a script, we can just call init_db directly if exposed, or manually create engine.
    from app.config.settings import settings
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    
    # Hardcode for debugging to ensure we use the right credentials/port
    # postgresql+asyncpg://antigravity:secret@localhost:5434/antigravity
    db_url = "postgresql+asyncpg://antigravity:secret@localhost:5434/antigravity"
    print(f"Connecting to: {db_url}")
    engine = create_async_engine(db_url)
    base.async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with base.async_session_factory() as session:
        # List all users
        print("Listing all users:")
        result = await session.execute(select(User))
        users = result.scalars().all()
        for u in users:
            print(f"ID: {u.id} | User: {u.username} | Balance: {u.balance}")

if __name__ == "__main__":
    asyncio.run(main())
