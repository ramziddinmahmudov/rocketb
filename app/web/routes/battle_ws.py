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
    Messages include:
    - score_update: round scores updated
    - round_started: new round begins
    - round_finished: round ended with winner
    - battle_finished: entire battle completed
    - player_joined: new player entered the room
    """
    await manager.connect(battle_id, websocket)
    try:
        while True:
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


# ── Helper functions for services to broadcast ───────────────


async def broadcast_round_scores(
    battle_id: uuid.UUID,
    round_number: int,
    player1_score: int,
    player2_score: int,
) -> None:
    """Broadcast updated round scores to all clients."""
    await manager.broadcast(battle_id, {
        "type": "score_update",
        "round_number": round_number,
        "player1_score": player1_score,
        "player2_score": player2_score,
        "battle_id": str(battle_id),
    })


async def broadcast_round_started(
    battle_id: uuid.UUID,
    round_number: int,
    player1_id: int,
    player2_id: int,
    player1_username: str,
    player2_username: str,
    duration_seconds: int,
) -> None:
    """Broadcast that a new round has started."""
    await manager.broadcast(battle_id, {
        "type": "round_started",
        "round_number": round_number,
        "player1_id": player1_id,
        "player2_id": player2_id,
        "player1_username": player1_username,
        "player2_username": player2_username,
        "duration_seconds": duration_seconds,
        "battle_id": str(battle_id),
    })


async def broadcast_round_finished(
    battle_id: uuid.UUID,
    round_number: int,
    winner_id: int,
    player1_score: int,
    player2_score: int,
) -> None:
    """Broadcast round result."""
    await manager.broadcast(battle_id, {
        "type": "round_finished",
        "round_number": round_number,
        "winner_id": winner_id,
        "player1_score": player1_score,
        "player2_score": player2_score,
        "battle_id": str(battle_id),
    })


async def broadcast_battle_finished(
    battle_id: uuid.UUID,
    winner_id: int | None,
) -> None:
    """Broadcast that the entire battle is finished."""
    await manager.broadcast(battle_id, {
        "type": "battle_finished",
        "winner_id": winner_id,
        "battle_id": str(battle_id),
    })


async def broadcast_player_joined(
    battle_id: uuid.UUID,
    user_id: int,
    username: str,
    current_count: int,
    max_count: int,
) -> None:
    """Broadcast that a new player joined the room."""
    await manager.broadcast(battle_id, {
        "type": "player_joined",
        "user_id": user_id,
        "username": username,
        "current_count": current_count,
        "max_count": max_count,
        "battle_id": str(battle_id),
    })


# Keep backward compatibility
async def broadcast_battle_scores(
    battle_id: uuid.UUID,
    blue_score: int,
    red_score: int,
) -> None:
    """Legacy: Broadcast team scores."""
    await manager.broadcast(battle_id, {
        "type": "score_update",
        "blue": blue_score,
        "red": red_score,
        "battle_id": str(battle_id),
    })
