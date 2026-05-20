"""Shared FastAPI dependencies."""
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth import verify_token

security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


def get_active_branch_id(request: Request, current_user=Depends(get_current_user)):
    """
    Resolve the branch the request should operate on.
    - Admins may pass X-Active-Branch header to switch context (or omit for ALL).
    - Non-admins are always pinned to their own branch_id.
    Returns None when an admin wants to see across all branches.
    """
    user_branch = current_user.get("branch_id")
    raw = request.headers.get("X-Active-Branch")
    requested = None
    if raw and raw not in ("0", "all", "ALL"):
        try:
            requested = int(raw)
        except ValueError:
            requested = None

    if current_user.get("role") == "admin":
        if raw in ("0", "all", "ALL"):
            return None
        return requested if requested is not None else user_branch
    return user_branch
