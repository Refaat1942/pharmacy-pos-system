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
    if payload.get("scope") == "platform":
        raise HTTPException(
            status_code=403,
            detail="Platform admin token cannot be used for tenant endpoints",
        )
    return payload


def requires_feature(key: str):
    """Server-side feature gate. Use as a router dependency:
        app.include_router(hr_router, dependencies=[Depends(requires_feature('hr'))])
    Returns 403 if the tenant has the feature disabled. Falls open if the
    tenant row has NULL features (legacy rows; defaults apply via login).
    """
    def _dep(current_user=Depends(get_current_user)):
        from platform_db import get_tenant_by_slug, normalize_features
        slug = current_user.get("tenant_slug")
        if not slug:
            raise HTTPException(status_code=401, detail="Missing tenant context")
        tenant = get_tenant_by_slug(slug)
        if not tenant:
            raise HTTPException(status_code=401, detail="Tenant not found")
        enabled = normalize_features(tenant.get("features"))
        if key not in enabled:
            raise HTTPException(
                status_code=403,
                detail=f"This feature ('{key}') is not enabled for your plan.",
            )
        return current_user
    return _dep


def get_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_token(token)
    if not payload or payload.get("scope") != "platform":
        raise HTTPException(status_code=403, detail="Platform admin access required")
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
