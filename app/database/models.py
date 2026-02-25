"""SQLAlchemy 2.0 ORM models for Antigravity (Rocket Battle).

16-player tournament bracket system with rooms, rounds, daily tasks, and gifting.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, date

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


# ── Enums ─────────────────────────────────────────────────────


class BattleStatus(str, enum.Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    FINISHED = "finished"


class TransactionType(str, enum.Enum):
    PURCHASE = "purchase"
    VOTE = "vote"
    REFERRAL = "referral"
    REWARD = "reward"
    VIP = "vip"
    GIFT_SENT = "gift_sent"
    GIFT_RECEIVED = "gift_received"
    DAILY_TASK = "daily_task"
    BATTLE_WIN = "battle_win"


class DailyTaskType(str, enum.Enum):
    PLAY_BATTLE = "play_battle"
    WIN_ROUND = "win_round"
    GIFT_ROCKETS = "gift_rockets"
    INVITE_FRIEND = "invite_friend"


class RoundStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    FINISHED = "finished"


# ── Models ────────────────────────────────────────────────────


class User(Base):
    """Telegram user profile and game state."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, doc="Telegram user_id"
    )
    username: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    first_name: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    balance: Mapped[int] = mapped_column(
        Integer, default=10, server_default="10",
        doc="Current rocket balance",
    )
    is_vip: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false",
    )
    vip_expire_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    vip_emoji: Mapped[str | None] = mapped_column(
        String(10), nullable=True,
        doc="Custom emoji/sticker for VIP users",
    )
    daily_rockets_remaining: Mapped[int] = mapped_column(
        Integer, default=300, server_default="300",
        doc="Rockets available to use today (resets daily)",
    )
    daily_rockets_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        doc="When daily rockets were last reset",
    )
    referrer_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────
    referrer: Mapped[User | None] = relationship(
        "User",
        remote_side="User.id",
        lazy="selectin",
    )
    referrals_made: Mapped[list[Referral]] = relationship(
        "Referral",
        foreign_keys="Referral.referrer_id",
        back_populates="referrer",
        lazy="selectin",
    )
    transactions: Mapped[list[Transaction]] = relationship(
        "Transaction",
        back_populates="user",
        lazy="selectin",
    )
    battle_participations: Mapped[list[BattleParticipant]] = relationship(
        "BattleParticipant",
        back_populates="user",
        lazy="selectin",
    )
    daily_tasks: Mapped[list[UserDailyTask]] = relationship(
        "UserDailyTask",
        back_populates="user",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} balance={self.balance}>"


class BattleRoom(Base):
    """A lobby/room that players join before a battle starts."""

    __tablename__ = "battle_rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    invite_code: Mapped[str] = mapped_column(
        String(12), unique=True, nullable=False,
        doc="Short shareable invite code",
    )
    name: Mapped[str] = mapped_column(
        String(64), nullable=False, default="Battle Room",
    )
    creator_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    max_players: Mapped[int] = mapped_column(
        Integer, default=16, server_default="16",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────
    creator: Mapped[User] = relationship("User", lazy="selectin")
    battles: Mapped[list[Battle]] = relationship(
        "Battle",
        back_populates="room",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<BattleRoom id={self.id} code={self.invite_code!r}>"


class Battle(Base):
    """A battle instance — 16-player tournament bracket."""

    __tablename__ = "battles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("battle_rooms.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[BattleStatus] = mapped_column(
        Enum(BattleStatus, name="battle_status", create_constraint=True),
        default=BattleStatus.WAITING,
    )
    current_round: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0",
        doc="Current bracket round (1-4 for 16 players)",
    )
    total_rounds: Mapped[int] = mapped_column(
        Integer, default=4, server_default="4",
        doc="Total rounds in bracket (log2 of players)",
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────
    room: Mapped[BattleRoom | None] = relationship(
        "BattleRoom", back_populates="battles",
    )
    participants: Mapped[list[BattleParticipant]] = relationship(
        "BattleParticipant",
        back_populates="battle",
        lazy="selectin",
    )
    rounds: Mapped[list[BattleRound]] = relationship(
        "BattleRound",
        back_populates="battle",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Battle id={self.id} status={self.status.value} round={self.current_round}>"


class BattleParticipant(Base):
    """Links a user to a battle and tracks their bracket position."""

    __tablename__ = "battle_participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    battle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("battles.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    score: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0",
        doc="Total rockets scored in this battle",
    )
    bracket_position: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0",
        doc="Seeding position 0-15 in bracket",
    )
    is_eliminated: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false",
    )
    eliminated_at_round: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
    )
    rockets_earned: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0",
        doc="Rockets won during this battle",
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────
    battle: Mapped[Battle] = relationship(
        "Battle", back_populates="participants",
    )
    user: Mapped[User] = relationship(
        "User", back_populates="battle_participations",
    )

    def __repr__(self) -> str:
        return (
            f"<BattleParticipant user={self.user_id} "
            f"battle={self.battle_id} pos={self.bracket_position} elim={self.is_eliminated}>"
        )


class BattleRound(Base):
    """A single 1v1 matchup within a battle bracket."""

    __tablename__ = "battle_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    battle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("battles.id", ondelete="CASCADE"),
        nullable=False,
    )
    round_number: Mapped[int] = mapped_column(
        Integer, nullable=False,
        doc="Bracket round (1=R16, 2=QF, 3=SF, 4=Final)",
    )
    player1_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    player2_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    player1_score: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0",
    )
    player2_score: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0",
    )
    winner_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[RoundStatus] = mapped_column(
        Enum(RoundStatus, name="round_status", create_constraint=True),
        default=RoundStatus.PENDING,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    duration_seconds: Mapped[int] = mapped_column(
        Integer, default=60, server_default="60",
    )

    # ── Relationships ─────────────────────────────────────────
    battle: Mapped[Battle] = relationship(
        "Battle", back_populates="rounds",
    )
    player1: Mapped[User] = relationship(
        "User", foreign_keys=[player1_id], lazy="selectin",
    )
    player2: Mapped[User] = relationship(
        "User", foreign_keys=[player2_id], lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<BattleRound battle={self.battle_id} "
            f"round={self.round_number} p1={self.player1_id} p2={self.player2_id}>"
        )


class Transaction(Base):
    """Immutable ledger of all balance changes."""

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount: Mapped[int] = mapped_column(
        Integer, nullable=False,
        doc="Positive = credit, negative = debit",
    )
    type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name="transaction_type", create_constraint=True),
        nullable=False,
    )
    stars_paid: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
        doc="Telegram Stars spent (only for purchase/vip txns)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────
    user: Mapped[User] = relationship(
        "User", back_populates="transactions",
    )

    def __repr__(self) -> str:
        return (
            f"<Transaction id={self.id} user={self.user_id} "
            f"amount={self.amount} type={self.type.value}>"
        )


class Referral(Base):
    """Tracks referral relationships and bonus payouts."""

    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    referrer_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    referred_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        doc="Each user can only be referred once",
    )
    bonus_given: Mapped[int] = mapped_column(
        Integer, default=10,
        doc="Rockets awarded to each party",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────
    referrer: Mapped[User] = relationship(
        "User",
        foreign_keys=[referrer_id],
        back_populates="referrals_made",
    )
    referred: Mapped[User] = relationship(
        "User",
        foreign_keys=[referred_id],
    )

    def __repr__(self) -> str:
        return (
            f"<Referral referrer={self.referrer_id} "
            f"referred={self.referred_id}>"
        )


class DailyTask(Base):
    """Template for daily tasks players can complete for rockets."""

    __tablename__ = "daily_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(String(256), nullable=False)
    rocket_reward: Mapped[int] = mapped_column(
        Integer, nullable=False, doc="Rockets earned on completion",
    )
    task_type: Mapped[DailyTaskType] = mapped_column(
        Enum(DailyTaskType, name="daily_task_type", create_constraint=True),
        nullable=False,
    )
    target_count: Mapped[int] = mapped_column(
        Integer, default=1,
        doc="How many times the action must be performed",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true",
    )

    def __repr__(self) -> str:
        return f"<DailyTask id={self.id} title={self.title!r}>"


class UserDailyTask(Base):
    """Tracks a user's progress on a daily task for a specific day."""

    __tablename__ = "user_daily_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("daily_tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    progress: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0",
    )
    completed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false",
    )
    claimed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false",
    )
    task_date: Mapped[date] = mapped_column(
        Date, nullable=False, doc="Which day this task is for",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "task_id", "task_date", name="uq_user_task_date"),
    )

    # ── Relationships ─────────────────────────────────────────
    user: Mapped[User] = relationship(
        "User", back_populates="daily_tasks",
    )
    task: Mapped[DailyTask] = relationship(
        "DailyTask", lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<UserDailyTask user={self.user_id} task={self.task_id} "
            f"progress={self.progress}/{self.task.target_count if self.task else '?'}>"
        )


class RocketGift(Base):
    """Record of rockets gifted between users."""

    __tablename__ = "rocket_gifts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sender_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    receiver_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────
    sender: Mapped[User] = relationship(
        "User", foreign_keys=[sender_id], lazy="selectin",
    )
    receiver: Mapped[User] = relationship(
        "User", foreign_keys=[receiver_id], lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<RocketGift sender={self.sender_id} "
            f"receiver={self.receiver_id} amount={self.amount}>"
        )
