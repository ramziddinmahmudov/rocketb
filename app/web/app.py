"""FastAPI application factory."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.web.routes import battle_ws, profile, vote


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
    raw_origins = os.getenv("CORS_ORIGINS", "*")
    if raw_origins == "*":
        origins = ["*"]
    else:
        origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ────────────────────────────────────────────────
    app.include_router(profile.router)
    app.include_router(vote.router)
    app.include_router(battle_ws.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
