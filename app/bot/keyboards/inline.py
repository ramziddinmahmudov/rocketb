"""Inline keyboard builders."""

from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.config.settings import settings


def main_menu_kb(start_param: str | None = None) -> InlineKeyboardMarkup:
    """Main menu keyboard shown after /start and in profiles."""
    url = settings.WEBAPP_URL
    if start_param:
        url = f"{url}?start={start_param}"

    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(
            text="🐶 Play 🐶",
            web_app=WebAppInfo(url=url),
        ),
    )
    builder.row(
        InlineKeyboardButton(
            text="Join Community ↗",
            url="https://t.me/rocketbattleebot",  # Placeholder link
        ),
    )
    builder.row(
        InlineKeyboardButton(
            text="Follow on X ↗",
            url="https://x.com",  # Placeholder link
        ),
    )
    return builder.as_markup()


def store_kb() -> InlineKeyboardMarkup:
    """Rocket store with all available packages."""
    builder = InlineKeyboardBuilder()
    for stars, rockets in sorted(settings.ROCKET_PACKAGES.items()):
        bonus = rockets - stars
        label = f"⭐ {stars} → 🚀 {rockets}"
        if bonus > 0:
            label += f" (+{bonus} bonus)"
        builder.row(
            InlineKeyboardButton(
                text=label,
                callback_data=f"buy_rockets:{stars}",
            ),
        )
    builder.row(
        InlineKeyboardButton(text="🔙 Back", callback_data="main_menu"),
    )
    return builder.as_markup()


def battle_info_kb(battle_id: str) -> InlineKeyboardMarkup:
    """Buttons shown during an active battle."""
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(
            text="🏆 Leaderboard",
            callback_data=f"leaderboard:{battle_id}",
        ),
    )
    builder.row(
        InlineKeyboardButton(text="🔙 Main Menu", callback_data="main_menu"),
    )
    return builder.as_markup()
