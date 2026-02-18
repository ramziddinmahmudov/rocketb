"""SQLAlchemy 2.0 ORM models for Antigravity (Rocket Battle)."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
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

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} balance={self.balance}>"


class Battle(Base):
    """A battle instance grouping multiple participants."""

    __tablename__ = "battles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    status: Mapped[BattleStatus] = mapped_column(
        Enum(BattleStatus, name="battle_status", create_constraint=True),
        default=BattleStatus.WAITING,
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
    participants: Mapped[list[BattleParticipant]] = relationship(
        "BattleParticipant",
        back_populates="battle",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Battle id={self.id} status={self.status.value}>"


class BattleParticipant(Base):
    """Links a user to a battle and tracks their score."""

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
            f"battle={self.battle_id} score={self.score}>"
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
