from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

from .database import engine, Base
import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()
from . import api, websockets
from .models import Task, User
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
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
            
        # Make user ID 1 admin if exists
        result = await db.execute(select(User).filter(User.id == 1))
        admin_user = result.scalars().first()
        if admin_user and not admin_user.is_admin:
            admin_user.is_admin = True
            await db.commit()
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
