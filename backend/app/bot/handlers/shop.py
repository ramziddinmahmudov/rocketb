"""Shop and Telegram Stars payments."""
import logging

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    LabeledPrice,
    Message,
    PreCheckoutQuery,
)

from .. import texts
from ..config import STAR_PACKAGES
from ..db import credit_rockets, ensure_user, get_user
from ..keyboards import back_to_menu, shop_keyboard

logger = logging.getLogger(__name__)
router = Router(name="shop")


@router.message(Command("shop"))
async def shop_cmd(message: Message):
    u = await get_user(message.from_user.id) or await ensure_user(message.from_user)
    await message.answer(
        texts.shop_text(u["rockets_balance"]),
        reply_markup=shop_keyboard(STAR_PACKAGES),
    )


@router.callback_query(F.data.startswith("buy:"))
async def cb_buy(query: CallbackQuery, bot: Bot):
    try:
        amount = int(query.data.split(":", 1)[1])
    except (IndexError, ValueError):
        await query.answer("Noto'g'ri paket", show_alert=True)
        return
    stars = STAR_PACKAGES.get(amount)
    if stars is None:
        await query.answer("Bu paket mavjud emas", show_alert=True)
        return

    await bot.send_invoice(
        chat_id=query.from_user.id,
        title=f"{amount} ta Raketa",
        description=f"{amount} ta raketa — Rocket Battle uchun yoqilg'i 🚀",
        payload=f"buy_{query.from_user.id}_{amount}",
        provider_token="",  # Empty = Telegram Stars
        currency="XTR",
        prices=[LabeledPrice(label=f"{amount} Rockets", amount=stars)],
    )
    await query.answer()


@router.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery, bot: Bot):
    # Validate payload before approving so a malformed payload doesn't take their money.
    payload = query.invoice_payload or ""
    parts = payload.split("_")
    valid = (
        len(parts) >= 3
        and parts[0] == "buy"
        and parts[1].isdigit()
        and parts[2].isdigit()
        and int(parts[2]) in STAR_PACKAGES
    )
    if not valid:
        await bot.answer_pre_checkout_query(query.id, ok=False, error_message="Invalid invoice payload")
        return
    await bot.answer_pre_checkout_query(query.id, ok=True)


@router.message(F.successful_payment)
async def payment_success(message: Message):
    payment = message.successful_payment
    payload = payment.invoice_payload or ""
    parts = payload.split("_")
    if len(parts) < 3 or parts[0] != "buy":
        logger.warning("Unknown payment payload: %s", payload)
        return
    try:
        target_id = int(parts[1])
        amount = int(parts[2])
    except ValueError:
        logger.warning("Bad numeric payload: %s", payload)
        return

    if target_id != message.from_user.id:
        logger.warning("Payment for %s but from %s — crediting from-user", target_id, message.from_user.id)
        target_id = message.from_user.id

    new_balance = await credit_rockets(target_id, amount)
    await message.answer(
        texts.payment_success_text(amount, payment.total_amount, new_balance),
        reply_markup=back_to_menu(),
    )
