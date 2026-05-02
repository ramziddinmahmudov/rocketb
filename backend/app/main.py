from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager
import logging

from .database import engine, Base
import os
import sqlalchemy
from dotenv import load_dotenv

# Load .env file
load_dotenv()
from . import api, websockets
from .models import Task, User
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

def run_alembic_upgrade():
    """Run alembic migrations automatically on startup."""
    try:
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config("/app/alembic.ini")
        alembic_cfg.set_main_option("script_location", "/app/alembic")
        command.upgrade(alembic_cfg, "head")
        logger.info("Alembic migrations applied successfully.")
    except Exception as e:
        logger.warning(f"Alembic migration skipped or failed: {e}")

async def ensure_columns(conn):
    """Add any missing columns to existing tables using raw SQL."""
    # List of (table, column, type) to ensure exist
    columns_to_add = [
        ("users", "referred_by", "BIGINT"),
    ]
    for table, column, col_type in columns_to_add:
        try:
            await conn.execute(
                sqlalchemy.text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type};"
                )
            )
            logger.info(f"Ensured column {table}.{column} exists.")
        except Exception as e:
            logger.warning(f"Column check {table}.{column}: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create any new tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Ensure all columns exist (for existing tables)
    async with engine.begin() as conn:
        await ensure_columns(conn)
        
    # Seed initial tasks if none exist
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionLocal() as db:
        from sqlalchemy.future import select
        result = await db.execute(select(Task))
        if not result.scalars().first():
            db.add_all([
                Task(title="Use 300 Rockets", reward=20, task_type="use_rockets", target_count=300),
                Task(title="Join Telegram Channel", reward=50, task_type="join_channel", target_count=1),
                Task(title="Invite 1 Friend", reward=10, task_type="invite_friends", target_count=1)
            ])
            await db.commit()
            
        # Make admin users from ADMIN_IDS env var
        try:
            admin_ids_str = os.getenv("ADMIN_IDS", "")
            if admin_ids_str:
                for aid in admin_ids_str.split(","):
                    aid = aid.strip()
                    if aid.isdigit():
                        result = await db.execute(select(User).filter(User.id == int(aid)))
                        admin_user = result.scalars().first()
                        if admin_user and not admin_user.is_admin:
                            admin_user.is_admin = True
                await db.commit()
        except Exception as e:
            logger.warning(f"Admin setup skipped: {e}")
    yield
    # Cleanup if needed

app = FastAPI(title="Rocket Battle API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router, prefix="/api", tags=["API"])
app.include_router(websockets.router, tags=["WebSockets"])

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
