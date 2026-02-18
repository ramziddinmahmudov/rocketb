"""Payment handlers — Rocket Store & VIP purchases (Telegram Stars)."""

from __future__ import annotations

import logging

from aiogram import F, Router, types
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.keyboards.inline import main_menu_kb, store_kb
from app.config.settings import settings
from app.services import payment_service

router = Router(name="payment")
logger = logging.getLogger(__name__)


# ── Store Menu ────────────────────────────────────────────────


@router.callback_query(F.data == "store")
async def cb_store(callback: types.CallbackQuery) -> None:
    """Show the rocket store with available packages."""
    await callback.answer()
    await callback.message.edit_text(
        "🏪 <b>Rocket Store</b>\n\n"
        "Choose a package to buy rockets with Telegram Stars ⭐:",
        parse_mode="HTML",
        reply_markup=store_kb(),
    )


# ── Rocket Package Invoice ───────────────────────────────────


@router.callback_query(F.data.startswith("buy_rockets:"))
async def cb_buy_rockets(callback: types.CallbackQuery) -> None:
    """Send a Telegram Stars invoice for the selected rocket package."""
    await callback.answer()

    stars = int(callback.data.split(":")[1])
    rockets = payment_service.rockets_for_stars(stars)
    if rockets is None:
        await callback.message.answer("⚠️ Invalid package.")
        return

    await callback.message.answer_invoice(
        title=f"🚀 {rockets} Rockets",
        description=f"Purchase {rockets} rockets for {stars} Telegram Stars.",
        payload=f"rockets:{stars}",
        currency="XTR",  # Telegram Stars currency code
        prices=[types.LabeledPrice(label=f"{rockets} Rockets", amount=stars)],
    )


# ── VIP Invoice ──────────────────────────────────────────────


@router.callback_query(F.data == "buy_vip")
async def cb_buy_vip(callback: types.CallbackQuery) -> None:
    """Send a Telegram Stars invoice for VIP status."""
    await callback.answer()

    await callback.message.answer_invoice(
        title="👑 VIP Status",
        description=(
            f"VIP for {settings.VIP_DURATION_DAYS} days!\n"
            f"• Max votes: {settings.VIP_VOTE_LIMIT}\n"
            f"• Cooldown: {settings.VIP_COOLDOWN // 3600}h (instead of "
            f"{settings.STANDARD_COOLDOWN // 3600}h)"
        ),
        payload="vip",
        currency="XTR",
        prices=[
            types.LabeledPrice(
                label="VIP Status",
                amount=settings.VIP_PRICE_STARS,
            ),
        ],
    )


# ── Pre-Checkout Handler ─────────────────────────────────────


@router.pre_checkout_query()
async def on_pre_checkout(pre_checkout: types.PreCheckoutQuery) -> None:
    """Validate the payment before Telegram processes it."""
    payload = pre_checkout.invoice_payload

    if payload.startswith("rockets:"):
        stars = int(payload.split(":")[1])
        if payment_service.rockets_for_stars(stars) is not None:
            await pre_checkout.answer(ok=True)
            return
    elif payload == "vip":
        await pre_checkout.answer(ok=True)
        return

    await pre_checkout.answer(
        ok=False,
        error_message="Invalid payment. Please try again.",
    )


# ── Successful Payment Handler ───────────────────────────────


@router.message(F.successful_payment)
async def on_successful_payment(
    message: types.Message,
    session: AsyncSession,
) -> None:
    """Process the completed payment — credit rockets or activate VIP."""
    payment = message.successful_payment
    payload = payment.invoice_payload
    user_id = message.from_user.id

    try:
        if payload.startswith("rockets:"):
            stars = int(payload.split(":")[1])
            rockets = await payment_service.process_rocket_purchase(
                session, user_id, stars,
            )
            await session.commit()
            await message.answer(
                f"✅ <b>Payment successful!</b>\n\n"
                f"🚀 +{rockets} rockets added to your balance.",
                parse_mode="HTML",
                reply_markup=main_menu_kb(),
            )

        elif payload == "vip":
            user = await payment_service.process_vip_purchase(
                session, user_id,
            )
            await session.commit()
            await message.answer(
                f"✅ <b>VIP Activated!</b> 👑\n\n"
                f"Expires: {user.vip_expire_date:%Y-%m-%d}\n"
                f"• Max votes: {settings.VIP_VOTE_LIMIT}\n"
                f"• Cooldown: {settings.VIP_COOLDOWN // 3600} hour(s)",
                parse_mode="HTML",
                reply_markup=main_menu_kb(),
            )

        else:
            logger.error("Unknown payload: %s", payload)
            await message.answer("⚠️ Payment processed but payload unknown.")

    except Exception:
        logger.exception("Payment processing failed for user %d", user_id)
        await session.rollback()
        await message.answer(
            "❌ Something went wrong processing your payment. "
            "Please contact support."
        )
