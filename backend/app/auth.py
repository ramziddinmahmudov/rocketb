import hashlib
import hmac
import os
import json
from datetime import datetime, timedelta
from urllib.parse import parse_qsl
import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-change-me-in-prod")
BOT_TOKEN = os.getenv("BOT_TOKEN", "mock-bot-token")

security = HTTPBearer()

def validate_telegram_data(init_data: str) -> dict:
    # For local development without a real bot token
    if init_data.startswith("mock_user_"):
        user_id = int(init_data.split("_")[2])
        return {
            "id": user_id,
            "first_name": f"Player {user_id}",
            "username": f"player_{user_id}"
        }

    try:
        parsed_data = dict(parse_qsl(init_data))
        if "hash" not in parsed_data:
            raise ValueError("No hash found")

        hash_str = parsed_data.pop("hash")
        
        # Sort keys
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(parsed_data.items())
        )
        
        secret_key = hmac.new(
            b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256
        ).digest()
        
        calculated_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()
        
        if calculated_hash != hash_str:
            raise ValueError("Invalid hash")
            
        user_data = json.loads(parsed_data.get("user", "{}"))
        if "start_param" in parsed_data:
            user_data["start_param"] = parsed_data["start_param"]
        return user_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate Telegram data",
        )

def create_access_token(user_id: int):
    expire = datetime.utcnow() + timedelta(days=7)
    to_encode = {"sub": str(user_id), "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")
    return encoded_jwt

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Security(security)) -> int:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return int(user_id)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# Admin check will be done inside the endpoint using the user_id + DB query
# This keeps auth.py independent of SQLAlchemy imports
