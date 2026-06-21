"""Public read-only API for shared POS demo access pages."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import platform_demo

router = APIRouter(prefix="/api/demo", tags=["demo"])


class DemoStartIn(BaseModel):
    account_index: int = Field(default=0, ge=0, le=24)


@router.get("/{token}")
def get_demo_access(token: str):
    """Public demo link metadata (no credentials)."""
    data = platform_demo.get_demo_pack_public(token)
    if not data:
        raise HTTPException(404, "Demo link not found or expired")
    return data


@router.post("/{token}/start")
def start_demo_session(token: str, body: DemoStartIn):
    """One-click login as demo admin — credentials stay on the server."""
    try:
        return platform_demo.demo_auto_login(token, body.account_index)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Demo login failed: {e}")
