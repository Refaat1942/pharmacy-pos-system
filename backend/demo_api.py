"""Public read-only API for shared POS demo access pages."""
from fastapi import APIRouter, HTTPException

import platform_demo

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/{token}")
def get_demo_access(token: str):
    """Return demo credentials for a share link (no auth — token is the secret)."""
    data = platform_demo.get_demo_pack_public(token)
    if not data:
        raise HTTPException(404, "Demo link not found or expired")
    return data
