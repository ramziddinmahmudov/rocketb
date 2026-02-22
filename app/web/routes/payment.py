"""Payment API endpoint — create invoice links for WebApp."""

from __future__ import annotations

import logging
from typing import Literal

from aiogram import Bot
from aiogram.types import LabeledPrice
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config.settings import settings
from app.services import payment_service

router = APIRouter(prefix="/api/payment", tags=["payment"])
logger = logging.getLogger(__name__)


class CreateInvoiceRequest(BaseModel):
    items: int | None = None  # Number of stars for rockets
    type: Literal["rocket", "vip"]


class CreateInvoiceResponse(BaseModel):
    invoice_link: str


@router.post("/create-invoice", response_model=CreateInvoiceResponse)
async def create_invoice(request: CreateInvoiceRequest) -> CreateInvoiceResponse:
    """Generate a Telegram invoice link for the selected item."""
    bot = Bot(token=settings.BOT_TOKEN)
    
    try:
        if request.type == "rocket":
            stars = request.items
            if not stars:
                raise HTTPException(status_code=400, detail="Amount of stars required for rocket purchase")
            
            rockets = payment_service.rockets_for_stars(stars)
            if rockets is None:
                raise HTTPException(status_code=400, detail=f"Invalid rocket package: {stars} stars")
            
            title = f"🚀 {rockets} Rockets"
            description = f"Purchase {rockets} rockets for {stars} Telegram Stars."
            payload = f"rockets:{stars}"
            prices = [LabeledPrice(label=f"{rockets} Rockets", amount=stars)]

        elif request.type == "vip":
            title = "👑 VIP Status"
            description = (
                f"VIP for {settings.VIP_DURATION_DAYS} days! "
                f"Max votes: {settings.VIP_VOTE_LIMIT}, "
                f"Cooldown: {settings.VIP_COOLDOWN // 3600}h."
            )
            payload = "vip"
            prices = [LabeledPrice(label="VIP Status", amount=settings.VIP_PRICE_STARS)]
        
        else:
             raise HTTPException(status_code=400, detail="Invalid purchase type")

        logger.info("Creating invoice: type=%s title=%s prices=%s", request.type, title, prices)

        link = await bot.create_invoice_link(
            title=title,
            description=description,
            payload=payload,
            provider_token="",  # Required for Telegram Stars (XTR)
            currency="XTR",
            prices=prices,
        )
        return CreateInvoiceResponse(invoice_link=link)

    except HTTPException:
        raise  # Don't catch HTTPException — let FastAPI handle it
    except Exception as e:
        logger.error("Failed to create invoice: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create invoice: {e}")
    finally:
        await bot.session.close()
