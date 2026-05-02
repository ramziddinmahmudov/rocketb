from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, BigInteger
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, index=True) # Telegram User ID
    username = Column(String, nullable=True)
    first_name = Column(String)
    rockets_balance = Column(Integer, default=20)
    total_played = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    referrals_count = Column(Integer, default=0)
    is_admin = Column(Boolean, default=False)
    last_login_date = Column(String, nullable=True)
    level = Column(Integer, default=1)
    xp = Column(Integer, default=0)
    coins = Column(Integer, default=0)
    referred_by = Column(BigInteger, ForeignKey("users.id"), nullable=True)

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    reward = Column(Integer)
    task_type = Column(String) # "use_rockets", "join_channel", "invite_friends"
    target_count = Column(Integer, nullable=True) # e.g. 300 for use_rockets
    channel_id = Column(String, nullable=True) # For "join_channel" e.g. "@mychannel"
    channel_url = Column(String, nullable=True) # For "join_channel" e.g. "https://t.me/mychannel"

class UserTask(Base):
    __tablename__ = "user_tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"))
    task_id = Column(Integer, ForeignKey("tasks.id"))
    progress = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)

class Follower(Base):
    __tablename__ = "followers"
    
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(BigInteger, ForeignKey("users.id"), index=True)
    following_id = Column(BigInteger, ForeignKey("users.id"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class MatchHistory(Base):
    __tablename__ = "match_history"
    
    id = Column(Integer, primary_key=True, index=True)
    player1_id = Column(BigInteger, ForeignKey("users.id"), index=True)
    player2_id = Column(BigInteger, ForeignKey("users.id"), index=True)
    player1_score = Column(Integer, default=0)
    player2_score = Column(Integer, default=0)
    winner_id = Column(BigInteger, ForeignKey("users.id"), nullable=True) # None if draw
    created_at = Column(DateTime(timezone=True), server_default=func.now())
