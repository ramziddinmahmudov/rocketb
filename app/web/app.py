"""FastAPI application factory."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.web.routes import battle, battle_ws, profile, vote, payment


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    app = FastAPI(
        title="Antigravity — Rocket Battle API",
        description="WebApp backend for the Rocket Battle Telegram Mini App",
        version="1.0.0",
    )

    # ── CORS ──────────────────────────────────────────────────
    # In production, set CORS_ORIGINS to your domain(s):
    #   CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
    # Default "*" allows all origins (fine for development).
    # Dynamic CORS: Allow any HTTP/HTTPS origin with credentials
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex="https?://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ────────────────────────────────────────────────
    app.include_router(profile.router)
    app.include_router(vote.router)
    app.include_router(battle.router)
    app.include_router(battle_ws.router)
    app.include_router(payment.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
