import asyncio
import itertools
import json
import logging
import os
import time
from typing import Any, Dict, List, Set

import httpx
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import update
from sqlalchemy.future import select

from .auth import SECRET_KEY
from .database import AsyncSessionLocal
from .models import MatchHistory, User

logger = logging.getLogger(__name__)
router = APIRouter()

# --- IN-MEMORY STATE ---
# connections[user_id] = {"ws": WebSocket, "info": {"id": int, "name": str},
#                         "spectating": Optional[str]}
connections: Dict[int, Dict[str, Any]] = {}

# Atomic bot id allocator (negative ids).
_bot_id_iter = itertools.count(-1, -1)
_bot_id_lock = asyncio.Lock()

waiting_queue: List[int] = []
_queue_lock = asyncio.Lock()

# active_matches[match_id] = {
#     "players": [id1, id2], "scores": {id1: 0, id2: 0},
#     "names": {id1: "A", id2: "B"}, "spent_rockets": {...},
#     "spectators": set[int], "start_time": float, "ended": bool
# }
active_matches: Dict[str, Dict[str, Any]] = {}

MATCH_DURATION_SECONDS = 180
MAX_LEVEL_PER_END = 50  # Hard cap on level-ups processed in one end_match call


def get_user_from_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return int(payload.get("sub"))
    except Exception:
        return None


async def _next_bot_id() -> int:
    async with _bot_id_lock:
        return next(_bot_id_iter)


def _match_audience(match: Dict[str, Any]) -> Set[int]:
    """Players (real users only) plus active spectators."""
    audience: Set[int] = {uid for uid in match["players"] if uid > 0}
    audience |= match.get("spectators", set())
    return audience


async def _send_to(uid: int, payload: Dict[str, Any]) -> None:
    conn = connections.get(uid)
    if not conn:
        return
    try:
        await conn["ws"].send_json(payload)
    except Exception:
        # Drop broken connection so we don't keep retrying.
        connections.pop(uid, None)


async def _broadcast_to_match(match: Dict[str, Any], payload: Dict[str, Any]) -> None:
    targets = _match_audience(match)
    for uid in list(targets):
        await _send_to(uid, payload)


async def broadcast_state():
    online_users = [
        {"id": uid, "name": data["info"]["name"]}
        for uid, data in connections.items()
        if "name" in data["info"]
    ]
    matches_info = [
        {
            "id": mid,
            "p1_id": m["players"][0],
            "p2_id": m["players"][1],
            "p1": m["names"].get(m["players"][0], "P1"),
            "p2": m["names"].get(m["players"][1], "P2"),
            "s1": m["scores"][m["players"][0]],
            "s2": m["scores"][m["players"][1]],
            "time_remaining": max(
                0,
                MATCH_DURATION_SECONDS - int(time.time() - m.get("start_time", time.time())),
            ),
        }
        for mid, m in active_matches.items()
    ]

    payload = {"type": "global_state", "online_users": online_users, "active_matches": matches_info}
    msg = json.dumps(payload)
    for uid, data in list(connections.items()):
        try:
            await data["ws"].send_text(msg)
        except Exception:
            connections.pop(uid, None)


async def start_match(user1_id: int, user2_id: int):
    match_id = f"match_{user1_id}_{user2_id}_{int(time.time())}"

    name1 = (
        connections.get(user1_id, {}).get("info", {}).get("name", f"User {user1_id}")
        if user1_id > 0
        else "Bot"
    )
    name2 = (
        connections.get(user2_id, {}).get("info", {}).get("name", f"User {user2_id}")
        if user2_id > 0
        else "Bot"
    )

    active_matches[match_id] = {
        "players": [user1_id, user2_id],
        "scores": {user1_id: 0, user2_id: 0},
        "names": {user1_id: name1, user2_id: name2},
        "spent_rockets": {},
        "spectators": set(),
        "start_time": time.time(),
        "last_human_tap": {},  # uid -> last tap timestamp; lets bots ease up when human is idle
        "ended": False,
    }

    for uid in (user1_id, user2_id):
        if uid in connections:
            opponent_id = user2_id if uid == user1_id else user1_id
            opponent_name = name2 if uid == user1_id else name1
            await _send_to(
                uid,
                {
                    "type": "match_found",
                    "match_id": match_id,
                    "opponent_id": opponent_id,
                    "opponent_name": opponent_name,
                },
            )

    await broadcast_state()
    asyncio.create_task(end_match_after_timeout(match_id, MATCH_DURATION_SECONDS))

    if user1_id < 0:
        asyncio.create_task(bot_worker(match_id, user1_id, user2_id))
    if user2_id < 0:
        asyncio.create_task(bot_worker(match_id, user2_id, user1_id))


async def bot_worker(match_id: str, bot_id: int, target_player: int):
    """Adaptive bot:
       - When the human is actively tapping, the bot keeps pace (~30 rockets/min).
       - When the human goes idle (>5s without tapping), the bot eases off to
         ~10 rockets/min (1 rocket per ~6s) so it doesn't blow them out.
    """
    import random

    while match_id in active_matches:
        match = active_matches.get(match_id)
        if not match or match.get("ended"):
            break

        last_tap = match.get("last_human_tap", {}).get(target_player, 0)
        idle_seconds = (time.time() - last_tap) if last_tap else 999

        if idle_seconds > 5:
            # Idle mode: ~10 rockets/minute.
            await asyncio.sleep(random.uniform(5.5, 6.5))
            amount = 1
        else:
            # Active mode: scale with score difference but stay reasonable (~30/min).
            await asyncio.sleep(random.uniform(1.5, 3.0))
            bot_score = match["scores"].get(bot_id, 0)
            player_score = match["scores"].get(target_player, 0)
            if player_score > bot_score + 20:
                amount = random.randint(3, 5)
            elif player_score > bot_score:
                amount = random.randint(2, 4)
            else:
                amount = random.randint(1, 3)

        # Re-check after sleep: match may have ended while we waited.
        match = active_matches.get(match_id)
        if not match or match.get("ended"):
            break

        current_score = match["scores"].get(bot_id, 0)
        if current_score >= 10:
            await asyncio.sleep(5)
            continue

        if current_score + amount > 10:
            amount = 10 - current_score

        match["scores"][bot_id] += amount

        await _broadcast_to_match(match, {"type": "score_update", "match_id": match_id, "scores": match["scores"]})
        await _broadcast_to_match(
            match,
            {
                "type": "attack_log",
                "match_id": match_id,
                "attacker_id": bot_id,
                "attacker_name": "Bot",
                "target_id": target_player,
                "target_name": match["names"].get(target_player, f"User {target_player}"),
                "amount": amount,
                "is_spectator": False,
                "timestamp": time.time(),
            },
        )


async def end_match(match_id: str):
    """End a match: save stats to DB, notify players, clean up. Idempotent."""
    match = active_matches.get(match_id)
    if not match or match.get("ended"):
        return
    # Mark ended immediately so concurrent callers (timeout vs disconnect) bail out.
    match["ended"] = True

    p1, p2 = match["players"]
    s1, s2 = match["scores"][p1], match["scores"][p2]

    winner_id = p1 if s1 > s2 else (p2 if s2 > s1 else None)

    try:
        async with AsyncSessionLocal() as db:
            # Update stats for human players only (rockets already deducted during taps).
            for uid in (p1, p2):
                if uid < 0:
                    continue
                res = await db.execute(select(User).filter(User.id == uid))
                u = res.scalars().first()
                if not u:
                    continue
                u.total_played += 1
                if uid == winner_id:
                    u.wins += 1
                    u.xp += 50
                    u.coins += 10
                else:
                    u.xp += 10
                    u.coins += 2

                # Bounded level-up loop so a corrupt/inflated xp value can't spin forever.
                level_ups = 0
                while u.xp >= (u.level * 100) and level_ups < MAX_LEVEL_PER_END:
                    u.xp -= u.level * 100
                    u.level += 1
                    level_ups += 1

            # Save history for any match that had at least one human player (bots get a
            # negative id which is fine now that the FK is relaxed; the API renders
            # negative opponent ids as "🤖 Bot").
            if p1 > 0 or p2 > 0:
                history = MatchHistory(
                    player1_id=p1,
                    player2_id=p2,
                    player1_score=s1,
                    player2_score=s2,
                    winner_id=winner_id,
                )
                db.add(history)
            await db.commit()

            bot_token = os.getenv("BOT_TOKEN")
            if bot_token:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    for uid in (p1, p2):
                        if uid <= 0:
                            continue
                        is_win = None if winner_id is None else (uid == winner_id)
                        if is_win is True:
                            msg = "🏆 Tabriklaymiz! Siz jangda g'alaba qozondingiz!\n\nSovrin: +50 XP, +10 Coins"
                        elif is_win is False:
                            msg = "💀 Jangda mag'lub bo'ldingiz. Keyingi safar omad!\n\nSovrin: +10 XP, +2 Coins"
                        else:
                            msg = "🤝 Jang durang bilan yakunlandi."
                        try:
                            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                            await client.post(url, json={"chat_id": uid, "text": msg})
                        except Exception as e:
                            logger.warning("Failed to send TG result message to %s: %s", uid, e)
    except Exception as e:
        logger.error("Error saving match history for %s: %s", match_id, e)

    audience = _match_audience(match)
    for uid in audience:
        is_player = uid in match["players"]
        is_win = None
        if is_player and winner_id is not None:
            is_win = uid == winner_id
        await _send_to(
            uid,
            {
                "type": "match_end",
                "match_id": match_id,
                "my_score": match["scores"].get(uid, s1 if is_player and uid == p1 else s2 if is_player else 0),
                "opponent_score": (
                    match["scores"][p2 if uid == p1 else p1]
                    if is_player
                    else 0
                ),
                "p1_score": s1,
                "p2_score": s2,
                "is_win": is_win,
                "is_spectator": not is_player,
            },
        )

    # Clear spectator pointers for everyone watching this match.
    for uid in list(match.get("spectators", set())):
        conn = connections.get(uid)
        if conn and conn.get("spectating") == match_id:
            conn["spectating"] = None

    active_matches.pop(match_id, None)
    await broadcast_state()


async def end_match_after_timeout(match_id: str, timeout: int):
    interval = 60
    elapsed = 0
    bot_token = os.getenv("BOT_TOKEN")

    while elapsed < timeout:
        await asyncio.sleep(min(interval, timeout - elapsed))
        elapsed += interval

        match = active_matches.get(match_id)
        if not match or match.get("ended"):
            return

        if elapsed < timeout:
            p1, p2 = match["players"]
            s1, s2 = match["scores"][p1], match["scores"][p2]

            losing_player = None
            if s1 < s2:
                losing_player = p1
            elif s2 < s1:
                losing_player = p2

            if losing_player and losing_player > 0 and bot_token:
                try:
                    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                    msg = "⚠️ Siz yutqazyapsiz! Tezroq o'yinga qaytib, raqibga hujum qiling!"
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        await client.post(url, json={"chat_id": losing_player, "text": msg})
                except Exception as e:
                    logger.warning("Failed to send losing notification: %s", e)

    await end_match(match_id)


async def handle_matchmaking(uid: int):
    async with _queue_lock:
        if uid not in waiting_queue:
            waiting_queue.append(uid)
        # Try to pair immediately if someone else is waiting.
        if len(waiting_queue) >= 2:
            p1 = waiting_queue.pop(0)
            p2 = waiting_queue.pop(0)
            pair = (p1, p2)
        else:
            pair = None

    if pair:
        await start_match(*pair)
        return

    # Wait briefly for a real opponent before falling back to a bot.
    await asyncio.sleep(3)

    async with _queue_lock:
        if uid not in waiting_queue:
            return  # Cancelled or already matched.
        # Re-check pairing under the lock (someone might have joined in the meantime).
        if len(waiting_queue) >= 2 and uid == waiting_queue[0]:
            p1 = waiting_queue.pop(0)
            p2 = waiting_queue.pop(0)
            pair = (p1, p2)
            bot_pair = None
        else:
            waiting_queue.remove(uid)
            pair = None
            bot_pair = uid

    if pair:
        await start_match(*pair)
    elif bot_pair is not None:
        bot_id = await _next_bot_id()
        await start_match(bot_pair, bot_id)


async def _try_deduct_rockets(user_id: int, amount: int) -> bool:
    """Atomic balance check + deduct. Returns True if deducted, False if not enough."""
    try:
        async with AsyncSessionLocal() as db:
            # Atomic conditional update — ensures we never go negative under concurrency.
            stmt = (
                update(User)
                .where(User.id == user_id, User.rockets_balance >= amount)
                .values(
                    rockets_balance=User.rockets_balance - amount,
                    rockets_used=(User.rockets_used + amount),
                )
            )
            result = await db.execute(stmt)
            await db.commit()
            return result.rowcount > 0
    except Exception as e:
        logger.error("Error deducting rockets for user %s: %s", user_id, e)
        return False


@router.websocket("/ws/battle")
async def battle_websocket(websocket: WebSocket, token: str):
    user_id = get_user_from_token(token)
    if not user_id:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    # Replace any stale connection for this user.
    old = connections.get(user_id)
    if old and old.get("ws") is not websocket:
        try:
            await old["ws"].close()
        except Exception:
            pass
    connections[user_id] = {
        "ws": websocket,
        "info": {"id": user_id, "name": f"User {user_id}"},
        "spectating": None,
    }
    await broadcast_state()

    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            action = data.get("type")

            if action == "init":
                connections[user_id]["info"]["name"] = data.get("name", f"User {user_id}")
                await broadcast_state()

            elif action == "find_match":
                asyncio.create_task(handle_matchmaking(user_id))

            elif action == "cancel_find":
                async with _queue_lock:
                    if user_id in waiting_queue:
                        waiting_queue.remove(user_id)
                await websocket.send_json({"type": "search_cancelled"})

            elif action == "spectate":
                match_id = data.get("match_id")
                match = active_matches.get(match_id) if match_id else None
                if match:
                    # Leave previous match if any.
                    prev = connections[user_id].get("spectating")
                    if prev and prev in active_matches:
                        active_matches[prev].get("spectators", set()).discard(user_id)
                    match.setdefault("spectators", set()).add(user_id)
                    connections[user_id]["spectating"] = match_id

            elif action == "leave_spectate":
                prev = connections[user_id].get("spectating")
                if prev and prev in active_matches:
                    active_matches[prev].get("spectators", set()).discard(user_id)
                connections[user_id]["spectating"] = None

            elif action == "challenge_user":
                target_id = int(data.get("target_id"))
                if target_id in connections:
                    await _send_to(
                        target_id,
                        {
                            "type": "challenge_received",
                            "challenger_id": user_id,
                            "challenger_name": connections[user_id]["info"]["name"],
                        },
                    )

            elif action == "accept_challenge":
                challenger_id = int(data.get("challenger_id"))
                if challenger_id in connections:
                    async with _queue_lock:
                        if challenger_id in waiting_queue:
                            waiting_queue.remove(challenger_id)
                        if user_id in waiting_queue:
                            waiting_queue.remove(user_id)
                    await start_match(challenger_id, user_id)

            elif action == "decline_challenge":
                challenger_id = int(data.get("challenger_id"))
                if challenger_id in connections:
                    await _send_to(
                        challenger_id,
                        {
                            "type": "challenge_declined",
                            "target_name": connections[user_id]["info"]["name"],
                        },
                    )

            elif action in ("tap", "spectator_tap"):
                match_id = data.get("match_id")
                target_player = data.get("target_player", user_id)  # default to self if 'tap'
                amount = int(data.get("amount", 1))
                if amount <= 0:
                    amount = 1
                # Hard cap to prevent griefing/typos draining a balance in one click.
                amount = min(amount, 1000)

                match = active_matches.get(match_id) if match_id else None
                if not match or target_player not in match["players"]:
                    continue

                # For 'tap', user must be one of the players. For 'spectator_tap', they
                # must be a registered spectator (so a non-spectator can't burn rockets
                # by tapping into a stranger's match).
                if action == "tap" and user_id not in match["players"]:
                    continue
                if action == "spectator_tap":
                    if user_id in match["players"]:
                        # Players use the regular 'tap' path.
                        continue
                    if user_id not in match.get("spectators", set()):
                        # Auto-register as spectator if they're tapping with intent.
                        match.setdefault("spectators", set()).add(user_id)
                        connections[user_id]["spectating"] = match_id

                if not await _try_deduct_rockets(user_id, amount):
                    await websocket.send_json({"type": "error", "message": "Not enough rockets"})
                    continue

                match["scores"][target_player] += amount
                match["spent_rockets"][user_id] = match["spent_rockets"].get(user_id, 0) + amount
                # Track human activity so bots can ease off when their opponent is idle.
                if action == "tap" and user_id > 0:
                    match.setdefault("last_human_tap", {})[user_id] = time.time()

                await _broadcast_to_match(
                    match,
                    {"type": "score_update", "match_id": match_id, "scores": match["scores"]},
                )

                attacker_name = connections.get(user_id, {}).get("info", {}).get("name", f"User {user_id}")
                target_name = match["names"].get(target_player, f"User {target_player}")
                await _broadcast_to_match(
                    match,
                    {
                        "type": "attack_log",
                        "match_id": match_id,
                        "attacker_id": user_id,
                        "attacker_name": attacker_name,
                        "target_id": target_player,
                        "target_name": target_name,
                        "amount": amount,
                        "is_spectator": action == "spectator_tap",
                        "timestamp": time.time(),
                    },
                )

                # Tell the tapper their new balance so the UI doesn't drift.
                try:
                    async with AsyncSessionLocal() as db:
                        res = await db.execute(select(User.rockets_balance).filter(User.id == user_id))
                        new_bal = res.scalar()
                except Exception:
                    new_bal = None
                if new_bal is not None:
                    await websocket.send_json({"type": "balance_update", "rockets_balance": new_bal})

            elif action == "chat":
                match_id = data.get("match_id")
                text = data.get("text", "")[:150]
                match = active_matches.get(match_id) if match_id else None
                if match and text.strip():
                    # Only players or registered spectators can chat in a match.
                    if user_id not in match["players"] and user_id not in match.get("spectators", set()):
                        continue
                    sender_name = connections.get(user_id, {}).get("info", {}).get("name", "User")
                    await _broadcast_to_match(
                        match,
                        {
                            "type": "chat_message",
                            "match_id": match_id,
                            "sender_id": user_id,
                            "sender_name": sender_name,
                            "text": text.strip(),
                            "timestamp": time.time(),
                        },
                    )

    except WebSocketDisconnect:
        pass
    finally:
        # Only remove if this is still the active connection (defensive against reconnects).
        if connections.get(user_id, {}).get("ws") is websocket:
            spectating = connections[user_id].get("spectating")
            if spectating and spectating in active_matches:
                active_matches[spectating].get("spectators", set()).discard(user_id)
            del connections[user_id]
        async with _queue_lock:
            if user_id in waiting_queue:
                waiting_queue.remove(user_id)
        await broadcast_state()
