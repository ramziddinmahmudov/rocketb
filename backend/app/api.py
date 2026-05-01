from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, or_, and_, func
import os
import httpx

from .database import get_db
from .models import User, Task, UserTask, Follower, MatchHistory
from .schemas import UserResponse, LoginRequest, TokenResponse
from .auth import validate_telegram_data, create_access_token, get_current_user_id

router = APIRouter()

@router.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    tg_user = validate_telegram_data(request.init_data)
    
    # Check if user exists
    result = await db.execute(select(User).filter(User.id == tg_user["id"]))
    user = result.scalars().first()
    
    # Load ADMIN_IDS from .env
    admin_ids_str = os.getenv("ADMIN_IDS", "")
    ADMIN_IDS = [int(x.strip()) for x in admin_ids_str.split(",") if x.strip().isdigit()]

    if not user:
        # Create new user
        user = User(
            id=tg_user["id"],
            username=tg_user.get("username"),
            first_name=tg_user.get("first_name", "Player"),
            is_admin=(tg_user["id"] in ADMIN_IDS)
        )
        db.add(user)
        
        start_param = tg_user.get("start_param")
        if start_param and start_param.startswith("ref_"):
            try:
                referrer_id = int(start_param.split("_")[1])
                if referrer_id != user.id:
                    ref_res = await db.execute(select(User).filter(User.id == referrer_id))
                    referrer = ref_res.scalars().first()
                    if referrer:
                        referrer.referrals_count += 1
            except Exception as e:
                pass

        await db.commit()
        await db.refresh(user)
        
    access_token = create_access_token(user.id)
    return TokenResponse(access_token=access_token)

@router.get("/users/me", response_model=UserResponse)
async def get_me(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("/users/{target_id}/profile")
async def get_user_profile(target_id: int, db: AsyncSession = Depends(get_db), current_user_id: int = Depends(get_current_user_id)):
    result = await db.execute(select(User).filter(User.id == target_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    followers_count = await db.scalar(select(func.count(Follower.id)).filter(Follower.following_id == target_id))
    following_count = await db.scalar(select(func.count(Follower.id)).filter(Follower.follower_id == target_id))
    
    is_following = await db.scalar(select(Follower).filter(Follower.follower_id == current_user_id, Follower.following_id == target_id)) is not None
    
    return {
        "id": user.id,
        "first_name": user.first_name,
        "rockets_balance": user.rockets_balance,
        "wins": user.wins,
        "total_played": user.total_played,
        "is_admin": user.is_admin,
        "followers": followers_count,
        "following": following_count,
        "is_following": is_following
    }

@router.post("/users/{target_id}/follow")
async def toggle_follow(target_id: int, db: AsyncSession = Depends(get_db), current_user_id: int = Depends(get_current_user_id)):
    if target_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
        
    result = await db.execute(select(User).filter(User.id == target_id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="User not found")
        
    result = await db.execute(select(Follower).filter(Follower.follower_id == current_user_id, Follower.following_id == target_id))
    existing = result.scalars().first()
    
    if existing:
        await db.delete(existing)
        action = "unfollowed"
    else:
        new_follow = Follower(follower_id=current_user_id, following_id=target_id)
        db.add(new_follow)
        action = "followed"
        
    await db.commit()
    return {"status": "success", "action": action}

@router.get("/users/{target_id}/matches")
async def get_user_matches(target_id: int, db: AsyncSession = Depends(get_db), current_user_id: int = Depends(get_current_user_id)):
    result = await db.execute(
        select(MatchHistory)
        .filter(or_(MatchHistory.player1_id == target_id, MatchHistory.player2_id == target_id))
        .order_by(desc(MatchHistory.created_at))
        .limit(20)
    )
    matches = result.scalars().all()
    response = []
    for m in matches:
        opponent_id = m.player2_id if m.player1_id == target_id else m.player1_id
        my_score = m.player1_score if m.player1_id == target_id else m.player2_score
        op_score = m.player2_score if m.player1_id == target_id else m.player1_score
        
        res2 = await db.execute(select(User.first_name).filter(User.id == opponent_id))
        op_name = res2.scalar() or "Unknown"
        
        is_win = (m.winner_id == target_id)
        is_draw = (m.winner_id == None)
        
        response.append({
            "id": m.id,
            "opponent_id": opponent_id,
            "opponent_name": op_name,
            "my_score": my_score,
            "opponent_score": op_score,
            "result": "draw" if is_draw else ("win" if is_win else "loss"),
            "created_at": m.created_at
        })
    return response

@router.get("/leaderboard", response_model=list[UserResponse])
async def get_leaderboard(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(desc(User.wins), desc(User.rockets_balance)).limit(50))
    return result.scalars().all()

@router.get("/tasks")
async def get_tasks(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    # Returns all tasks and the user's progress on them
    tasks_result = await db.execute(select(Task))
    tasks = tasks_result.scalars().all()
    
    user_tasks_result = await db.execute(select(UserTask).filter(UserTask.user_id == user_id))
    user_tasks = {ut.task_id: ut for ut in user_tasks_result.scalars().all()}
    
    response = []
    for task in tasks:
        ut = user_tasks.get(task.id)
        response.append({
            "id": task.id,
            "title": task.title,
            "reward": task.reward,
            "task_type": task.task_type,
            "target_count": task.target_count,
            "progress": ut.progress if ut else 0,
            "is_completed": ut.is_completed if ut else False
        })
    return response

@router.post("/tasks/{task_id}/claim")
async def claim_task(task_id: int, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    # Get user
    user_res = await db.execute(select(User).filter(User.id == user_id))
    user = user_res.scalars().first()
    
    # Get task
    task_res = await db.execute(select(Task).filter(Task.id == task_id))
    task = task_res.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    # Get user task progress
    ut_res = await db.execute(select(UserTask).filter(UserTask.user_id == user_id, UserTask.task_id == task_id))
    ut = ut_res.scalars().first()
    
    if ut and ut.is_completed:
        raise HTTPException(status_code=400, detail="Already claimed")
        
    # Validation logic
    if task.task_type == "invite_friends":
        if user.referrals_count < (task.target_count or 1):
            raise HTTPException(status_code=400, detail=f"You need to invite at least {task.target_count} friends. You have invited {user.referrals_count}.")

    if task.task_type == "join_channel" and task.channel_id:
        bot_token = os.getenv("BOT_TOKEN")
        if not bot_token:
            # For local testing if no bot token is provided, just simulate success
            # To make it strict, you can remove this fallback
            print("WARNING: No BOT_TOKEN found. Simulating channel join success.")
            pass
        else:
            try:
                # Telegram API call to verify membership
                url = f"https://api.telegram.org/bot{bot_token}/getChatMember"
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, params={"chat_id": task.channel_id, "user_id": user_id})
                    data = resp.json()
                    
                if not data.get("ok"):
                    raise HTTPException(status_code=400, detail="Could not verify membership (API error)")
                    
                status = data.get("result", {}).get("status")
                if status not in ["member", "administrator", "creator"]:
                    raise HTTPException(status_code=400, detail="You have not joined the channel yet")
            except httpx.RequestError:
                raise HTTPException(status_code=500, detail="Failed to contact Telegram API")

    if not ut:
        ut = UserTask(user_id=user_id, task_id=task_id, progress=task.target_count or 0, is_completed=True)
        db.add(ut)
    else:
        ut.is_completed = True
        ut.progress = task.target_count or 0
        
    user.rockets_balance += task.reward
    
    await db.commit()
    return {"message": "Claimed successfully", "new_balance": user.rockets_balance}

# =================== ADMIN ENDPOINTS ===================

async def require_admin(user_id: int, db: AsyncSession):
    """Helper to check if user is admin"""
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

@router.get("/admin/users")
async def admin_get_users(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    await require_admin(user_id, db)
    result = await db.execute(select(User))
    users = result.scalars().all()
    return [
        {
            "id": u.id, "username": u.username, "first_name": u.first_name,
            "rockets_balance": u.rockets_balance, "total_played": u.total_played,
            "wins": u.wins, "is_admin": u.is_admin
        }
        for u in users
    ]

@router.put("/admin/users/{target_user_id}")
async def admin_update_user(
    target_user_id: int,
    updates: dict,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    await require_admin(user_id, db)
    result = await db.execute(select(User).filter(User.id == target_user_id))
    target = result.scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    if "rockets_balance" in updates:
        target.rockets_balance = int(updates["rockets_balance"])
    if "wins" in updates:
        target.wins = int(updates["wins"])
    if "total_played" in updates:
        target.total_played = int(updates["total_played"])
    
    await db.commit()
    return {"message": "User updated"}

@router.post("/admin/tasks")
async def admin_create_task(
    task_data: dict,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    await require_admin(user_id, db)
    new_task = Task(
        title=task_data["title"],
        reward=int(task_data["reward"]),
        task_type=task_data.get("task_type", "custom"),
        target_count=int(task_data.get("target_count", 1)),
        channel_id=task_data.get("channel_id"),
        channel_url=task_data.get("channel_url")
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return {"message": "Task created", "id": new_task.id}

@router.delete("/admin/tasks/{task_id}")
async def admin_delete_task(
    task_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    await require_admin(user_id, db)
    
    # Delete related user_tasks first
    await db.execute(select(UserTask).filter(UserTask.task_id == task_id))
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(UserTask).where(UserTask.task_id == task_id))
    
    result = await db.execute(select(Task).filter(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
    return {"message": "Task deleted"}

@router.post("/admin/clear-stuck")
async def clear_stuck(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    await require_admin(user_id, db)
    from .websockets import connections, waiting_queue, active_matches
    count = len(waiting_queue)
    waiting_queue.clear()
    active_matches.clear()
    return {"message": f"Cleared {count} from queue, all matches reset"}
