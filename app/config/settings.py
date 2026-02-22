"""Application settings — loaded from .env via pydantic-settings."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for the Antigravity bot."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Telegram ──────────────────────────────────────────────
    BOT_TOKEN: str
    WEBAPP_URL: str = "https://google.com"  # Default if not set
    WEBAPP_SECRET: str = ""  # Falls back to Globals
    ADMIN_IDS: list[int] = [7324509440, 5478948637]  # Hardcoded for now as per plan

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost:5432/antigravity"

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── VIP ───────────────────────────────────────────────────
    VIP_PRICE_STARS: int = 1000
    VIP_DURATION_DAYS: int = 30

    # ── Battle (16-player tournament) ─────────────────────────
    BATTLE_PLAYERS: int = 16          # Players needed to auto-start
    ROUND_DURATION: int = 60          # Seconds per 1v1 round
    BATTLE_TOTAL_ROUNDS: int = 4      # log2(16) = 4 bracket rounds

    # ── Vote Limits (per battle round) ────────────────────────
    STANDARD_VOTE_LIMIT: int = 100
    VIP_VOTE_LIMIT: int = 300

    # ── Cooldowns (seconds) ───────────────────────────────────
    STANDARD_COOLDOWN: int = 3 * 3600   # 3 hours
    VIP_COOLDOWN: int = 1 * 3600        # 1 hour

    # ── Daily Rockets ─────────────────────────────────────────
    DAILY_ROCKETS_STANDARD: int = 300   # Free rockets per day (standard)
    DAILY_ROCKETS_VIP: int = 1000       # Free rockets per day (VIP)

    # ── Rocket Gifting ────────────────────────────────────────
    GIFT_LIMIT_STANDARD: int = 100      # Max rockets per friend (standard)
    GIFT_LIMIT_VIP: int = 900           # Max rockets per friend (VIP)

    # ── Rocket Store (stars → rockets) ────────────────────────
    ROCKET_PACKAGES: dict[int, int] = {
        10: 10,
        100: 100,
        500: 550,
        1000: 1150,
    }

    # ── Initial Balance ───────────────────────────────────────
    INITIAL_ROCKETS: int = 10
    REFERRAL_BONUS: int = 10

    @property
    def hmac_secret(self) -> str:
        """Secret used for Telegram WebApp initData HMAC validation."""
        return self.WEBAPP_SECRET or self.BOT_TOKEN


settings = Settings()  # type: ignore[call-arg]
