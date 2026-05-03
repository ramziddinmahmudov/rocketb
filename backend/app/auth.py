import hashlib
import hmac
import logging
import os
import json
from datetime import datetime, timedelta
from urllib.parse import parse_qsl
import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

_DEFAULT_SECRET = "super-secret-key-change-me-in-prod"
SECRET_KEY = os.getenv("JWT_SECRET", _DEFAULT_SECRET)
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ALLOW_MOCK_AUTH = os.getenv("ALLOW_MOCK_AUTH", "false").lower() in ("1", "true", "yes")

if SECRET_KEY == _DEFAULT_SECRET:
    logger.warning(
        "JWT_SECRET is not set — using insecure default. Set JWT_SECRET in env for production."
    )
if not BOT_TOKEN:
    logger.warning("BOT_TOKEN is not set — Telegram auth and notifications are disabled.")

security = HTTPBearer()

def validate_telegram_data(init_data: str) -> dict:
    # Mock login is only enabled when explicitly allowed (dev/CI).
    if init_data.startswith("mock_user_"):
        if not ALLOW_MOCK_AUTH:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Mock auth is disabled",
            )
        try:
            user_id = int(init_data.split("_")[2])
        except (IndexError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid mock user id",
            )
        return {
            "id": user_id,
            "first_name": f"Player {user_id}",
            "username": f"player_{user_id}"
        }

    if not BOT_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram auth is not configured",
        )

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
