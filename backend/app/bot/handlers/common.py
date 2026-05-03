"""Top-level commands: /start (deep links), /menu, /help, plus generic callback router."""
import logging

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import CallbackQuery, Message

from .. import texts
from ..db import (
    count_referrals,
    ensure_user,
    get_global_stats,
    get_top_players,
    get_user,
    register_referral,
)
from ..config import BOT_USERNAME, STAR_PACKAGES
from ..keyboards import (
    back_to_menu,
    invite_keyboard,
    main_menu,
    shop_keyboard,
    support_battle,
)

logger = logging.getLogger(__name__)
router = Router(name="common")


@router.message(CommandStart(deep_link=True))
async def start_with_arg(message: Message, command: CommandObject):
    arg = (command.args or "").strip()
    user = await ensure_user(message.from_user)
    ref_granted = False

    if arg.startswith("ref_"):
        try:
            referrer_id = int(arg.split("_", 1)[1])
            ref_granted = await register_referral(message.from_user.id, referrer_id)
        except (ValueError, IndexError):
            pass
        await message.answer(
            texts.welcome(user, daily_bonus=user.get("_daily_bonus", False), ref_granted=ref_granted),
            reply_markup=main_menu(),
        )
        return

    if arg.startswith("support_"):
        await message.answer(texts.support_battle_text(), reply_markup=support_battle(arg))
        return

    # Unknown deep link: just show welcome.
    await message.answer(
        texts.welcome(user, daily_bonus=user.get("_daily_bonus", False)),
        reply_markup=main_menu(),
    )


@router.message(CommandStart())
async def start_no_arg(message: Message):
    user = await ensure_user(message.from_user)
    await message.answer(
        texts.welcome(user, daily_bonus=user.get("_daily_bonus", False)),
        reply_markup=main_menu(),
    )


@router.message(Command("menu"))
async def menu_cmd(message: Message):
    await ensure_user(message.from_user)
    await message.answer(texts.menu_text(), reply_markup=main_menu())


@router.message(Command("help"))
async def help_cmd(message: Message):
    await message.answer(texts.help_text(), reply_markup=back_to_menu())


# ----- Menu callbacks -------------------------------------------------------


@router.callback_query(F.data == "menu:back")
async def cb_back(query: CallbackQuery):
    try:
        await query.message.edit_text(texts.menu_text(), reply_markup=main_menu())
    except Exception:
        await query.message.answer(texts.menu_text(), reply_markup=main_menu())
    await query.answer()


@router.callback_query(F.data == "menu:profile")
async def cb_profile(query: CallbackQuery):
    u = await get_user(query.from_user.id)
    if not u:
        u = await ensure_user(query.from_user)
    # Compute place (cheap for small leaderboard).
    top = await get_top_players(limit=100)
    place = next((i + 1 for i, t in enumerate(top) if t["id"] == u["id"]), None)
    stats = await get_global_stats()
    await query.message.edit_text(
        texts.profile_text(u, place=place, total_users=stats["total_users"]),
        reply_markup=back_to_menu(),
    )
    await query.answer()


@router.callback_query(F.data == "menu:top")
async def cb_top(query: CallbackQuery):
    top = await get_top_players(limit=10)
    await query.message.edit_text(
        texts.leaderboard_text(top, me_id=query.from_user.id),
        reply_markup=back_to_menu(),
    )
    await query.answer()


@router.callback_query(F.data == "menu:shop")
async def cb_shop(query: CallbackQuery):
    u = await get_user(query.from_user.id) or await ensure_user(query.from_user)
    await query.message.edit_text(
        texts.shop_text(u["rockets_balance"]),
        reply_markup=shop_keyboard(STAR_PACKAGES),
    )
    await query.answer()


@router.callback_query(F.data == "menu:invite")
async def cb_invite(query: CallbackQuery, bot: Bot):
    username = BOT_USERNAME
    if not username:
        me = await bot.me()
        username = me.username or "your_bot"
    link = f"https://t.me/{username}?start=ref_{query.from_user.id}"
    cnt = await count_referrals(query.from_user.id) or 0
    await query.message.edit_text(
        texts.invite_text(link, cnt),
        reply_markup=invite_keyboard(link),
    )
    await query.answer()


@router.callback_query(F.data == "menu:help")
async def cb_help(query: CallbackQuery):
    await query.message.edit_text(texts.help_text(), reply_markup=back_to_menu())
    await query.answer()


@router.callback_query(F.data == "noop")
async def cb_noop(query: CallbackQuery):
    await query.answer()
