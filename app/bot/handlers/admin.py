"""Admin panel handlers for the bot."""

from __future__ import annotations

import logging

from aiogram import F, Router, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.bot.common import get_session
from app.config.settings import settings
from app.database import base
from app.database.models import User
from app.services import admin_service
from app.services.redis_service import get_redis

logger = logging.getLogger(__name__)
router = Router()


# ── States ────────────────────────────────────────────────────


class AdminStates(StatesGroup):
    waiting_for_user_input = State()  # ID or Username
    waiting_for_broadcast_message = State()


# ── Filters & Middleware ──────────────────────────────────────


def is_admin(user_id: int) -> bool:
    return user_id in settings.ADMIN_IDS


# ── Keyboards ─────────────────────────────────────────────────


def get_admin_keyboard():
    builder = InlineKeyboardBuilder()
    builder.button(text="🔍 Find User", callback_data="admin_find_user")
    builder.button(text="📢 Broadcast", callback_data="admin_broadcast")
    builder.button(text="📊 Stats", callback_data="admin_stats")
    builder.adjust(2)
    return builder.as_markup()


def get_user_actions_keyboard(user_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="💎 Grant VIP (30d)", callback_data=f"admin_vip_{user_id}")
    builder.button(text="🚀 +100 Rockets", callback_data=f"admin_rocket_100_{user_id}")
    builder.button(text="🚀 +1000 Rockets", callback_data=f"admin_rocket_1000_{user_id}")
    builder.button(text="🔙 Back", callback_data="admin_home")
    builder.adjust(1)
    return builder.as_markup()


# ── Handlers ──────────────────────────────────────────────────


@router.message(Command("admin"))
async def cmd_admin(message: types.Message, state: FSMContext):
    """Show admin panel."""
    if not is_admin(message.from_user.id):
        return  # Silent ignore for non-admins

    await state.clear()
    await message.answer(
        "🛠 **Admin Panel**\n\nChoose an action:",
        reply_markup=get_admin_keyboard(),
    )


@router.callback_query(F.data == "admin_home")
async def cb_admin_home(callback: types.CallbackQuery, state: FSMContext):
    if not is_admin(callback.from_user.id):
        return

    await state.clear()
    await callback.message.edit_text(
        "🛠 **Admin Panel**\n\nChoose an action:",
        reply_markup=get_admin_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "admin_stats")
async def cb_admin_stats(callback: types.CallbackQuery):
    if not is_admin(callback.from_user.id):
        return

    async with base.async_session_factory() as session:
        total_users = await admin_service.get_total_users(session)

    text = (
        f"📊 **Statistics**\n\n"
        f"Total Users: **{total_users}**\n"
        f"Active Battles: (Check logs)\n"
    )
    
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Back", callback_data="admin_home")

    await callback.message.edit_text(text, reply_markup=builder.as_markup())
    await callback.answer()


# ── Find User ─────────────────────────────────────────────────


@router.callback_query(F.data == "admin_find_user")
async def cb_find_user(callback: types.CallbackQuery, state: FSMContext):
    if not is_admin(callback.from_user.id):
        return

    await callback.message.edit_text(
        "🔍 Send me the **User ID** or **Username** (e.g. @username):",
        reply_markup=None
    )
    await state.set_state(AdminStates.waiting_for_user_input)
    await callback.answer()


@router.message(AdminStates.waiting_for_user_input)
async def process_find_user(message: types.Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return

    input_str = message.text.strip()
    
    async with base.async_session_factory() as session:
        user = await admin_service.get_user_by_input(session, input_str)

        if not user:
            await message.answer(
                "❌ User not found. Try again or /admin.",
            )
            return

        vip_status = "✅ YES" if user.is_vip else "❌ NO"
        balance = user.balance
        
        text = (
            f"👤 **User Found**\n\n"
            f"ID: `{user.id}`\n"
            f"Username: @{user.username}\n"
            f"Balance: {balance} 🚀\n"
            f"VIP: {vip_status}\n"
        )
        
        await message.answer(text, reply_markup=get_user_actions_keyboard(user.id))
        await state.clear()


# ── Actions ───────────────────────────────────────────────────


@router.callback_query(F.data.startswith("admin_vip_"))
async def cb_admin_vip(callback: types.CallbackQuery):
    if not is_admin(callback.from_user.id):
        return

    user_id = int(callback.data.split("_")[-1])

    async with base.async_session_factory() as session:
        await admin_service.grant_vip(session, user_id)
        await session.commit()
        
        # Invalidate cache if needed
        redis = get_redis()
        # await redis.delete(f"user:{user_id}")

    await callback.answer("✅ VIP Granted!", show_alert=True)
    # Refresh view? simplified for now
    await callback.message.answer(f"✅ User {user_id} is now VIP for 30 days.")


@router.callback_query(F.data.startswith("admin_rocket_"))
async def cb_admin_rocket(callback: types.CallbackQuery):
    if not is_admin(callback.from_user.id):
        return

    parts = callback.data.split("_")
    amount = int(parts[2])
    user_id = int(parts[3])

    async with base.async_session_factory() as session:
        await admin_service.add_balance(session, user_id, amount)
        await session.commit()

    await callback.answer(f"✅ Added {amount} Rockets!", show_alert=True)
    await callback.message.answer(f"✅ Added {amount} rockets to {user_id}.")


# ── Broadcast ─────────────────────────────────────────────────


@router.callback_query(F.data == "admin_broadcast")
async def cb_broadcast(callback: types.CallbackQuery, state: FSMContext):
    if not is_admin(callback.from_user.id):
        return

    await callback.message.edit_text(
        "📢 Send the message you want to broadcast to ALL users:",
        reply_markup=None 
        # Add Back button ideally
    )
    await state.set_state(AdminStates.waiting_for_broadcast_message)
    await callback.answer()


@router.message(AdminStates.waiting_for_broadcast_message)
async def process_broadcast(message: types.Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return

    text = message.text  # or message.html_text
    # Better to ask for confirmation
    
    await message.answer("🚀 Broadcasting started... (This might take a while)")
    
    async with base.async_session_factory() as session:
        user_ids = await admin_service.get_all_users_for_broadcast(session)
    
    count = 0
    blocked = 0
    
    for uid in user_ids:
        try:
            await message.bot.send_message(uid, text)
            count += 1
        except Exception:
            blocked += 1
            
    await message.answer(
        f"✅ Broadcast finished.\n"
        f"Sent: {count}\n"
        f"Failed/Blocked: {blocked}"
    )
    await state.clear()
