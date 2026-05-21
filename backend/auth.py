import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os

_DEV_FALLBACK = "pharma-pos-secret-key-2024-change-in-prod"
SECRET_KEY = os.getenv("SECRET_KEY") or _DEV_FALLBACK

# In production, refuse to start with the dev fallback or a too-short secret —
# forged JWTs would otherwise grant attacker-controlled access.
if os.getenv("ENVIRONMENT") == "production":
    if not os.getenv("SECRET_KEY") or SECRET_KEY == _DEV_FALLBACK or len(SECRET_KEY) < 32:
        raise RuntimeError(
            "SECRET_KEY is missing, weak, or set to the dev fallback in production. "
            "Set a 32+ character random secret in /etc/pharmapos.env and restart."
        )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
