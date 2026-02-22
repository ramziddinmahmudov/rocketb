"""Room API — create, join, list battle rooms."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.database import base
from app.services import room_service, battle_service
from app.web.auth import AuthError, validate_init_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/room", tags=["rooms"])


# ── Schemas ───────────────────────────────────────────────────


class CreateRoomRequest(BaseModel):
    name: str = "Battle Room"


class ParticipantSchema(BaseModel):
    user_id: int
    username: str
    first_name: str | None = None
    avatar_url: str | None = None
    bracket_position: int = 0
    is_eliminated: bool = False
    score: int = 0


class RoomResponse(BaseModel):
    room_id: uuid.UUID
    invite_code: str
    name: str
    max_players: int
    current_players: int
    battle_id: uuid.UUID | None = None
    battle_status: str | None = None
    participants: list[ParticipantSchema] = []
    is_creator: bool = False


class RoomListItem(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    invite_code: str
    name: str
    max_players: int
    player_count: int = 0
    creator_id: int | None = None
    creator_username: str | None = None


class ErrorResponse(BaseModel):
    detail: str


# ── Endpoints ─────────────────────────────────────────────────


@router.post("/create", response_model=RoomResponse)
async def create_room(
    body: CreateRoomRequest,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> RoomResponse:
    """Create a new battle room."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        try:
            room = await room_service.create_room(session, user_id, body.name)
            battle = await room_service.get_room_battle(session, room.id)
            await session.commit()

            return RoomResponse(
                room_id=room.id,
                invite_code=room.invite_code,
                name=room.name,
                max_players=room.max_players,
                current_players=0,
                battle_id=battle.id if battle else None,
                battle_status=battle.status.value if battle else None,
                is_creator=True,
            )
        except Exception as exc:
            await session.rollback()
            logger.error("Failed to create room: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to create room")


@router.post("/join/{invite_code}", response_model=RoomResponse)
async def join_room(
    invite_code: str,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> RoomResponse:
    """Join a room via invite code."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        try:
            room, battle, already_joined = await room_service.join_room(
                session, invite_code, user_id
            )
            await session.commit()

            # Re-fetch battle with participants
            battle = await room_service.get_room_battle(session, room.id)
            participants = _build_participants(battle) if battle else []

            return RoomResponse(
                room_id=room.id,
                invite_code=room.invite_code,
                name=room.name,
                max_players=room.max_players,
                current_players=len(participants),
                battle_id=battle.id if battle else None,
                battle_status=battle.status.value if battle else None,
                participants=participants,
                is_creator=(room.creator_id == user_id),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            await session.rollback()
            logger.error("Failed to join room: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to join room")


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: uuid.UUID,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> RoomResponse:
    """Get room details and participants."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        room = await room_service.get_room(session, room_id)
        if room is None:
            raise HTTPException(status_code=404, detail="Room not found")

        battle = await room_service.get_room_battle(session, room.id)
        participants = _build_participants(battle) if battle else []

        return RoomResponse(
            room_id=room.id,
            invite_code=room.invite_code,
            name=room.name,
            max_players=room.max_players,
            current_players=len(participants),
            battle_id=battle.id if battle else None,
            battle_status=battle.status.value if battle else None,
            participants=participants,
            is_creator=(room.creator_id == user_id),
        )


@router.get("s/active", response_model=list[RoomListItem])
async def list_rooms(
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
) -> list[RoomListItem]:
    """List all active rooms."""
    try:
        validate_init_data(x_telegram_init_data)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        rooms = await room_service.list_active_rooms(session)
        items = []
        for room in rooms:
            battle = await room_service.get_room_battle(session, room.id)
            count = 0
            if battle:
                count = await room_service.get_room_participants_count(
                    session, battle.id
                )
            items.append(RoomListItem(
                id=room.id,
                room_id=room.id,
                invite_code=room.invite_code,
                name=room.name,
                max_players=room.max_players,
                player_count=count,
                creator_id=room.creator_id,
                creator_username=room.creator.username if room.creator else None,
            ))
        return items


@router.delete("/{room_id}")
async def delete_room(
    room_id: uuid.UUID,
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
):
    """Delete a room (only creator can delete)."""
    try:
        user_data = validate_init_data(x_telegram_init_data)
        user_id = user_data["id"]
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if base.async_session_factory is None:
        raise HTTPException(status_code=500, detail="Database not initialised")

    async with base.async_session_factory() as session:
        room = await room_service.get_room(session, room_id)
        if room is None:
            raise HTTPException(status_code=404, detail="Xona topilmadi")
        if room.creator_id != user_id:
            raise HTTPException(status_code=403, detail="Faqat yaratuvchi o'chira oladi")

        room.is_active = False
        await session.commit()
        return {"status": "deleted"}


# ── Helpers ───────────────────────────────────────────────────


def _build_participants(battle) -> list[ParticipantSchema]:
    """Build participant schema list from a battle."""
    participants = []
    for p in battle.participants:
        u = p.user
        avatar = f"https://ui-avatars.com/api/?name={u.username or u.first_name or 'Player'}&background=random"
        participants.append(ParticipantSchema(
            user_id=u.id,
            username=u.username or f"User {u.id}",
            first_name=u.first_name,
            avatar_url=avatar,
            bracket_position=p.bracket_position,
            is_eliminated=p.is_eliminated,
            score=p.score,
        ))
    return participants
