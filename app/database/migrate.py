"""Database migration — add new columns and tables for v2 (tournament bracket).

This module runs raw ALTER TABLE / CREATE TABLE IF NOT EXISTS statements
to migrate the production database from the v1 schema to v2.
``create_all`` only creates *new* tables; it cannot add columns to
existing ones.  This migration handles that.

Usage:
    from app.database.migrate import run_migrations
    await run_migrations(engine)
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# Each statement is idempotent — safe to run multiple times.
MIGRATION_STATEMENTS: list[str] = [
    # ── users: new columns ────────────────────────────────────
    """
    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
    """,
    """
    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS daily_rockets_remaining INTEGER DEFAULT 300;
    """,
    """
    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS daily_rockets_reset_at TIMESTAMPTZ;
    """,

    # ── battle_participants: new columns ──────────────────────
    """
    ALTER TABLE battle_participants
        ADD COLUMN IF NOT EXISTS bracket_position INTEGER DEFAULT 0;
    """,
    """
    ALTER TABLE battle_participants
        ADD COLUMN IF NOT EXISTS is_eliminated BOOLEAN DEFAULT FALSE;
    """,
    """
    ALTER TABLE battle_participants
        ADD COLUMN IF NOT EXISTS eliminated_at_round INTEGER;
    """,
    """
    ALTER TABLE battle_participants
        ADD COLUMN IF NOT EXISTS rockets_earned INTEGER DEFAULT 0;
    """,

    # ── battles: new columns ──────────────────────────────────
    """
    ALTER TABLE battles
        ADD COLUMN IF NOT EXISTS room_id UUID;
    """,
    """
    ALTER TABLE battles
        ADD COLUMN IF NOT EXISTS current_round INTEGER DEFAULT 0;
    """,
    """
    ALTER TABLE battles
        ADD COLUMN IF NOT EXISTS total_rounds INTEGER DEFAULT 4;
    """,

    # ── Create new enum types (if not exists) ─────────────────
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'roundstatus') THEN
            CREATE TYPE roundstatus AS ENUM ('pending', 'active', 'finished');
        END IF;
    END$$;
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dailytasktype') THEN
            CREATE TYPE dailytasktype AS ENUM ('play_battle', 'win_round', 'gift_rockets', 'invite_friend');
        END IF;
    END$$;
    """,

    # ── battle_rooms ──────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS battle_rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invite_code VARCHAR(16) NOT NULL UNIQUE,
        name VARCHAR(128) DEFAULT 'Battle Room',
        creator_id BIGINT NOT NULL REFERENCES users(id),
        max_players INTEGER DEFAULT 16,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,

    # ── FK battles → battle_rooms ─────────────────────────────
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_battles_room_id'
        ) THEN
            ALTER TABLE battles
                ADD CONSTRAINT fk_battles_room_id
                FOREIGN KEY (room_id) REFERENCES battle_rooms(id);
        END IF;
    END$$;
    """,

    # ── battle_rounds ─────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS battle_rounds (
        id SERIAL PRIMARY KEY,
        battle_id UUID NOT NULL REFERENCES battles(id),
        round_number INTEGER NOT NULL,
        player1_id BIGINT NOT NULL REFERENCES users(id),
        player2_id BIGINT NOT NULL REFERENCES users(id),
        player1_score INTEGER DEFAULT 0,
        player2_score INTEGER DEFAULT 0,
        winner_id BIGINT REFERENCES users(id),
        status roundstatus DEFAULT 'pending',
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        duration_seconds INTEGER DEFAULT 60
    );
    """,

    # ── daily_tasks ───────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS daily_tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        rocket_reward INTEGER DEFAULT 0,
        task_type dailytasktype NOT NULL,
        target_count INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE
    );
    """,

    # ── user_daily_tasks ──────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS user_daily_tasks (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id),
        task_id INTEGER NOT NULL REFERENCES daily_tasks(id),
        task_date DATE NOT NULL DEFAULT CURRENT_DATE,
        progress INTEGER DEFAULT 0,
        completed BOOLEAN DEFAULT FALSE,
        claimed BOOLEAN DEFAULT FALSE,
        UNIQUE(user_id, task_id, task_date)
    );
    """,

    # ── rocket_gifts ──────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS rocket_gifts (
        id SERIAL PRIMARY KEY,
        sender_id BIGINT NOT NULL REFERENCES users(id),
        receiver_id BIGINT NOT NULL REFERENCES users(id),
        amount INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,

    # ── Update transaction_type enum if needed ────────────────
    """
    DO $$
    BEGIN
        -- Add new enum values for transaction types
        ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'daily_task';
        ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'gift_sent';
        ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'gift_received';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END$$;
    """,
]


async def run_migrations(engine: AsyncEngine) -> None:
    """Execute all migration statements (idempotent)."""
    logger.info("Running database migrations…")
    async with engine.begin() as conn:
        for i, stmt in enumerate(MIGRATION_STATEMENTS, 1):
            try:
                await conn.execute(text(stmt))
                logger.debug("Migration %d/%d OK", i, len(MIGRATION_STATEMENTS))
            except Exception as exc:
                logger.warning("Migration %d/%d skipped: %s", i, len(MIGRATION_STATEMENTS), exc)

    logger.info("Database migrations complete (%d statements)", len(MIGRATION_STATEMENTS))
