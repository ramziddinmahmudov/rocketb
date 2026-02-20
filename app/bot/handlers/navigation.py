"""Navigation handlers — main menu and back buttons."""

from __future__ import annotations

import logging

from aiogram import F, Router, types
from aiogram.fsm.context import FSMContext

from app.bot.keyboards.inline import main_menu_kb

router = Router(name="navigation")
logger = logging.getLogger(__name__)


@router.callback_query(F.data == "main_menu")
async def cb_main_menu(
    callback: types.CallbackQuery,
    state: FSMContext,
) -> None:
    """Return to the main menu."""
    await state.clear()
    await callback.answer()
    
    # Check if we can edit the message (it might be a photo or different type)
    # For safety, we try to edit text. If it fails (e.g. caption), we might need delete/send.
    # But for now, assuming text messages (like Balance/Store).
    try:
        await callback.message.edit_text(
            text=(
                f"🚀 <b>Welcome back!</b>\n\n"
                f"Choose an option below:"
            ),
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )
    except Exception:
        # Fallback if editing fails (e.g. message usage limits or type mismatch)
        await callback.message.delete()
        await callback.message.answer(
            text="🚀 <b>Rocket Battle</b>",
            reply_markup=main_menu_kb(),
            parse_mode="HTML",
        )
