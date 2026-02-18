"""WebSocket endpoint for real-time battle score updates."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter(tags=["battle_ws"])


# ── Connection Manager ────────────────────────────────────────


class ConnectionManager:
    """Manage WebSocket connections grouped by battle_id."""

    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, list[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, battle_id: uuid.UUID, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[battle_id].append(ws)
        logger.info("WS connected: battle=%s", battle_id)

    async def disconnect(self, battle_id: uuid.UUID, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(battle_id, [])
            if ws in conns:
                conns.remove(ws)
            if not conns:
                self._connections.pop(battle_id, None)
        logger.info("WS disconnected: battle=%s", battle_id)

    async def broadcast(self, battle_id: uuid.UUID, data: dict) -> None:
        """Send a JSON message to all connections watching this battle."""
        message = json.dumps(data)
        async with self._lock:
            conns = list(self._connections.get(battle_id, []))

        stale: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                stale.append(ws)

        # Clean up broken connections
        if stale:
            async with self._lock:
                for ws in stale:
                    conns_list = self._connections.get(battle_id, [])
                    if ws in conns_list:
                        conns_list.remove(ws)


# Module-level singleton
manager = ConnectionManager()


# ── WebSocket Route ──────────────────────────────────────────


@router.websocket("/api/ws/battle/{battle_id}")
async def battle_ws(websocket: WebSocket, battle_id: uuid.UUID) -> None:
    """WebSocket endpoint for live battle score streaming.

    Clients connect and receive JSON broadcasts whenever scores change.
    Clients can send a JSON ``{"type": "ping"}`` to keep alive.
    """
    await manager.connect(battle_id, websocket)
    try:
        while True:
            # Keep the connection alive by reading incoming messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(battle_id, websocket)


# ── Helper for services to broadcast ─────────────────────────


async def broadcast_score_update(
    battle_id: uuid.UUID,
    user_id: int,
    new_score: int,
    username: str | None = None,
) -> None:
    """Broadcast a score update to all WebSocket clients watching this battle.

    Call this from the voting service after a successful vote.
    """
    await manager.broadcast(battle_id, {
        "type": "score_update",
        "user_id": user_id,
        "username": username,
        "score": new_score,
        "battle_id": str(battle_id),
    })
