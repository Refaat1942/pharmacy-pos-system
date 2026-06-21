"""Restrict sensitive actions on demo / trial pharmacy tenants."""
from __future__ import annotations

from fastapi import HTTPException, Request

DEMO_BLOCK_MESSAGE = "This action is disabled on demo accounts. Contact Fratelanza for a full subscription."


def _path_is_demo_blocked(path: str, method: str) -> bool:
    p = (path or "").lower()
    m = (method or "GET").upper()
    if "/export" in p:
        return True
    if "bulk-template" in p or "bulk-upload" in p or "bulk_upload" in p:
        return True
    if "/import" in p and m in ("GET", "POST"):
        return True
    if "reset-password" in p or "reset_password" in p:
        return True
    if p.endswith("/auth/change-password") or "/change-password" in p:
        return True
    if "/manual" in p and m == "GET":
        return True
    if "replenishment/export" in p:
        return True
    return False


def tenant_is_demo(tenant: dict | None) -> bool:
    return bool(tenant and tenant.get("is_demo"))


def assert_not_demo_tenant(tenant: dict | None, *, action: str = "This action") -> None:
    if tenant_is_demo(tenant):
        raise HTTPException(status_code=403, detail=DEMO_BLOCK_MESSAGE)


def assert_not_demo_user(current_user: dict) -> None:
    from platform_db import get_tenant_by_slug

    slug = current_user.get("tenant_slug")
    if not slug:
        return
    tenant = get_tenant_by_slug(slug)
    assert_not_demo_tenant(tenant)


def demo_guard_for_request(request: Request) -> HTTPException | None:
    """Return an HTTPException to short-circuit, or None to continue."""
    path = request.url.path
    if not path.startswith("/api/"):
        return None
    if path.startswith("/api/auth/login") or path.startswith("/api/demo/"):
        return None
    if not _path_is_demo_blocked(path, request.method):
        return None

    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None

    from auth import verify_token
    from platform_db import get_tenant_by_slug

    payload = verify_token(auth[7:])
    if not payload or payload.get("scope") != "tenant":
        return None
    tenant = get_tenant_by_slug(payload.get("tenant_slug") or "")
    if tenant_is_demo(tenant):
        return HTTPException(status_code=403, detail=DEMO_BLOCK_MESSAGE)
    return None
