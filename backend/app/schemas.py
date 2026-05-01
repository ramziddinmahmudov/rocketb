from pydantic import BaseModel
from typing import Optional

class UserResponse(BaseModel):
    id: int
    username: Optional[str]
    first_name: str
    rockets_balance: int
    total_played: int
    wins: int
    is_admin: bool = False

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    init_data: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
