"""Inline keyboards. The 'open app' button uses Mini App link when configured,
otherwise falls back to the WebApp button."""
from typing import Optional
from urllib.parse import quote

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)

from .config import BOT_USERNAME, MINI_APP_SHORT_NAME, WEBAPP_URL


def open_app_button(text: str = "🚀 O'yinni ochish", start_param: Optional[str] = None) -> InlineKeyboardButton:
    """Returns the best available "Open App" button.

    Priority:
      1. Mini App link (preserves start_param via Telegram natively).
      2. WebAppInfo button with start_param appended as URL query (?startapp=...).
    """
    if MINI_APP_SHORT_NAME and BOT_USERNAME:
        url = f"https://t.me/{BOT_USERNAME}/{MINI_APP_SHORT_NAME}"
        if start_param:
            url += f"?startapp={quote(start_param, safe='')}"
        return InlineKeyboardButton(text=text, url=url)

    if not WEBAPP_URL:
        # No WebApp configured — show plain text button that does nothing.
        return InlineKeyboardButton(text=text, callback_data="noop")

    web_url = WEBAPP_URL
    if start_param:
        sep = "&" if "?" in web_url else "?"
        web_url = f"{web_url}{sep}startapp={quote(start_param, safe='')}"
    return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=web_url))


def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [open_app_button("🚀 Jangga kirish")],
        [
            InlineKeyboardButton(text="👤 Profil", callback_data="menu:profile"),
            InlineKeyboardButton(text="🏆 Top 10", callback_data="menu:top"),
        ],
        [
            InlineKeyboardButton(text="🛒 Magazin", callback_data="menu:shop"),
            InlineKeyboardButton(text="👥 Taklif", callback_data="menu:invite"),
        ],
        [InlineKeyboardButton(text="ℹ️ Yordam", callback_data="menu:help")],
    ])


def back_to_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="◀️ Bosh menyu", callback_data="menu:back")]
    ])


def shop_keyboard(packages: dict[int, int]) -> InlineKeyboardMarkup:
    """packages: rockets -> stars cost"""
    rows: list[list[InlineKeyboardButton]] = []
    items = sorted(packages.items())
    for i in range(0, len(items), 2):
        chunk = items[i:i + 2]
        rows.append([
            InlineKeyboardButton(
                text=f"🚀 {amt} → {stars} ⭐",
                callback_data=f"buy:{amt}",
            )
            for amt, stars in chunk
        ])
    rows.append([InlineKeyboardButton(text="◀️ Bosh menyu", callback_data="menu:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def invite_keyboard(link: str) -> InlineKeyboardMarkup:
    share_url = (
        f"https://t.me/share/url?url={quote(link, safe='')}"
        f"&text={quote('⚔️ Rocket Battle — meni quvib yet, raketa jangida g`alaba qoz!')}"
    )
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📤 Telegramda ulashish", url=share_url)],
        [InlineKeyboardButton(text="◀️ Bosh menyu", callback_data="menu:back")],
    ])


def support_battle(start_param: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [open_app_button("⚔️ Yordamga kirish", start_param=start_param)],
        [InlineKeyboardButton(text="◀️ Bosh menyu", callback_data="menu:back")],
    ])


def admin_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="📊 Statistika", callback_data="adm:stats"),
            InlineKeyboardButton(text="📋 Vazifalar", callback_data="adm:tasks"),
        ],
        [
            InlineKeyboardButton(text="📢 Broadcast", callback_data="adm:bcast"),
            InlineKeyboardButton(text="🔍 Foydalanuvchi", callback_data="adm:find"),
        ],
        [InlineKeyboardButton(text="ℹ️ Buyruqlar", callback_data="adm:help")],
    ])


def admin_user_actions(target_id: int, is_admin: bool) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="➕10 🚀", callback_data=f"adm:give:{target_id}:10"),
            InlineKeyboardButton(text="➕100 🚀", callback_data=f"adm:give:{target_id}:100"),
            InlineKeyboardButton(text="➕1000 🚀", callback_data=f"adm:give:{target_id}:1000"),
        ],
        [
            InlineKeyboardButton(
                text=("⛔ Adminlikdan olish" if is_admin else "👑 Admin qilish"),
                callback_data=f"adm:toggle_admin:{target_id}",
            ),
        ],
        [InlineKeyboardButton(text="◀️ Admin menyu", callback_data="adm:back")],
    ])


def broadcast_confirm() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Yuborish", callback_data="adm:bcast:send"),
            InlineKeyboardButton(text="❌ Bekor qilish", callback_data="adm:bcast:cancel"),
        ],
    ])
