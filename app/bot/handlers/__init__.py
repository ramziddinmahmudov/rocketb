"""Bot handlers — aggregated router."""

from aiogram import Router

from .start import router as start_router
from .balance import router as balance_router
from .payment import router as payment_router

router = Router(name="main_router")
router.include_router(start_router)
router.include_router(balance_router)
router.include_router(payment_router)

__all__ = ["router"]
