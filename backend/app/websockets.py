import asyncio
import json
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any
import time

from .auth import SECRET_KEY
from .database import AsyncSessionLocal
from .models import MatchHistory

router = APIRouter()

# --- IN-MEMORY STATE ---
# connections[user_id] = {"ws": WebSocket, "info": {"id": int, "name": str}}
connections: Dict[int, Dict[str, Any]] = {}
waiting_queue: List[int] = []
# active_matches[match_id] = {"players": [id1, id2], "scores": {id1: 0, id2: 0}, "names": {id1: "A", id2: "B"}, "start_time": float}
active_matches: Dict[str, Dict[str, Any]] = {}

def get_user_from_token(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return int(payload.get("sub"))
    except Exception:
        return None

async def broadcast_state():
    online_users = [{"id": uid, "name": data["info"]["name"]} for uid, data in connections.items() if "name" in data["info"]]
    matches_info = [{"id": mid, "p1_id": m["players"][0], "p2_id": m["players"][1], "p1": m["names"].get(m["players"][0], "P1"), "p2": m["names"].get(m["players"][1], "P2"), "s1": m["scores"][m["players"][0]], "s2": m["scores"][m["players"][1]]} for mid, m in active_matches.items()]
    
    msg = json.dumps({"type": "global_state", "online_users": online_users, "active_matches": matches_info})
    for uid, data in connections.items():
        try:
            await data["ws"].send_text(msg)
        except:
            pass

async def start_match(user1_id: int, user2_id: int):
    match_id = f"match_{user1_id}_{user2_id}_{int(time.time())}"
    
    name1 = connections.get(user1_id, {}).get("info", {}).get("name", f"User {user1_id}")
    name2 = connections.get(user2_id, {}).get("info", {}).get("name", f"User {user2_id}")

    active_matches[match_id] = {
        "players": [user1_id, user2_id],
        "scores": {user1_id: 0, user2_id: 0},
        "names": {user1_id: name1, user2_id: name2},
        "spent_rockets": {},
        "start_time": time.time()
    }
    
    # Notify both players
    for uid in (user1_id, user2_id):
        if uid in connections:
            opponent_id = user2_id if uid == user1_id else user1_id
            opponent_name = name2 if uid == user1_id else name1
            await connections[uid]["ws"].send_json({
                "type": "match_found",
                "match_id": match_id,
                "opponent_id": opponent_id,
                "opponent_name": opponent_name
            })
            
    await broadcast_state()
    asyncio.create_task(end_match_after_timeout(match_id, 180))

async def end_match(match_id: str):
    """End a match: save stats to DB, notify players, clean up."""
    if match_id not in active_matches:
        return
    
    match = active_matches[match_id]
    p1, p2 = match["players"]
    s1, s2 = match["scores"][p1], match["scores"][p2]
    
    winner_id = p1 if s1 > s2 else (p2 if s2 > s1 else None)
    
    # Save to DB
    try:
        async with AsyncSessionLocal() as db:
            from .models import User
            from sqlalchemy.future import select
            
            # Update user stats and deduct rockets
            for uid, spent in match.get("spent_rockets", {}).items():
                res = await db.execute(select(User).filter(User.id == uid))
                u = res.scalars().first()
                if u:
                    u.rockets_balance = max(0, u.rockets_balance - spent)
                    
            # Update match stats for players
            for uid in (p1, p2):
                res = await db.execute(select(User).filter(User.id == uid))
                u = res.scalars().first()
                if u:
                    u.total_played += 1
                    if uid == winner_id:
                        u.wins += 1

            history = MatchHistory(
                player1_id=p1,
                player2_id=p2,
                player1_score=s1,
                player2_score=s2,
                winner_id=winner_id
            )
            db.add(history)
            await db.commit()
    except Exception as e:
        print("Error saving match history:", e)
    
    for uid in (p1, p2):
        if uid in connections:
            is_win = None if winner_id is None else (uid == winner_id)
            try:
                await connections[uid]["ws"].send_json({
                    "type": "match_end",
                    "my_score": match["scores"][uid],
                    "opponent_score": match["scores"][p2 if uid == p1 else p1],
                    "is_win": is_win
                })
            except:
                pass
    del active_matches[match_id]
    await broadcast_state()

async def end_match_after_timeout(match_id: str, timeout: int):
    await asyncio.sleep(timeout)
    await end_match(match_id)

@router.websocket("/ws/battle")
async def battle_websocket(websocket: WebSocket, token: str):
    user_id = get_user_from_token(token)
    if not user_id:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    connections[user_id] = {"ws": websocket, "info": {"id": user_id, "name": f"User {user_id}"}}
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
                if user_id not in waiting_queue:
                    waiting_queue.append(user_id)
                if len(waiting_queue) >= 2:
                    p1 = waiting_queue.pop(0)
                    p2 = waiting_queue.pop(0)
                    await start_match(p1, p2)
            
            elif action == "challenge_user":
                target_id = int(data.get("target_id"))
                if target_id in connections:
                    await connections[target_id]["ws"].send_json({
                        "type": "challenge_received",
                        "challenger_id": user_id,
                        "challenger_name": connections[user_id]["info"]["name"]
                    })
            
            elif action == "accept_challenge":
                challenger_id = int(data.get("challenger_id"))
                if challenger_id in connections:
                    if challenger_id in waiting_queue: waiting_queue.remove(challenger_id)
                    if user_id in waiting_queue: waiting_queue.remove(user_id)
                    await start_match(challenger_id, user_id)

            elif action == "decline_challenge":
                challenger_id = int(data.get("challenger_id"))
                if challenger_id in connections:
                    await connections[challenger_id]["ws"].send_json({
                        "type": "challenge_declined",
                        "target_name": connections[user_id]["info"]["name"]
                    })

            elif action == "leave_match":
                match_id = data.get("match_id")
                if match_id and match_id in active_matches:
                    await end_match(match_id)

            elif action == "tap" or action == "spectator_tap":
                match_id = data.get("match_id")
                target_player = data.get("target_player", user_id) # default to self if 'tap'
                amount = int(data.get("amount", 1))
                if amount <= 0: amount = 1
                
                if match_id and match_id in active_matches:
                    match = active_matches[match_id]
                    if target_player in match["players"]:
                        match["scores"][target_player] += amount
                        match["spent_rockets"][user_id] = match["spent_rockets"].get(user_id, 0) + amount
                        
                        # Broadcast score update to players and everyone for global state
                        p1, p2 = match["players"]
                        for uid in (p1, p2):
                            if uid in connections:
                                await connections[uid]["ws"].send_json({
                                    "type": "score_update",
                                    "scores": match["scores"]
                                })
                        await broadcast_state()
            
    except WebSocketDisconnect:
        # If user was in an active match, end it properly
        for mid, m in list(active_matches.items()):
            if user_id in m["players"]:
                await end_match(mid)
                break
        if user_id in connections:
            del connections[user_id]
        if user_id in waiting_queue:
            waiting_queue.remove(user_id)
        await broadcast_state()
