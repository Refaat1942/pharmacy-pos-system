"""Shared FastAPI dependencies."""
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth import verify_token

security = HTTPBearer()


# Role / branch / permissions / status are re-read from the database (cached briefly),
# so deactivating, demoting or moving a user takes effect within seconds instead of
# when their 12-hour token expires.
_USER_TTL = 20.0
_user_cache: dict = {}


def _live_user(payload: dict) -> Optional[dict]:
    import time
    from db import get_db_connection
    key = (payload.get("tenant_slug"), payload.get("user_id"))
    hit = _user_cache.get(key)
    if hit and time.monotonic() - hit[0] < _USER_TTL:
        return hit[1]
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT role, branch_id, permissions, COALESCE(status, 'active') FROM users WHERE id=%s",
                    (payload.get("user_id"),))
        row = cur.fetchone()
    finally:
        conn.close()
    live = {"role": row[0], "branch_id": row[1], "permissions": row[2], "status": row[3]} if row else None
    _user_cache[key] = (time.monotonic(), live)
    if len(_user_cache) > 5000:
        _user_cache.clear()
    return live


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
    if payload.get("tenant_slug") and payload.get("user_id"):
        try:
            live = _live_user(payload)
        except Exception:
            live = {}  # never lock everyone out because of this check
        if live is None or (live and live["status"] != "active"):
            raise HTTPException(status_code=401, detail="Account is inactive or was removed")
        if live:
            payload = {**payload, "role": live["role"], "branch_id": live["branch_id"],
                       "permissions": live["permissions"]}
    return payload


def _non_admin_branch(current_user) -> int:
    """A non-admin always works in one branch; with none assigned they get nothing
    (None would mean "all branches" to the callers)."""
    b = current_user.get("branch_id")
    if b is None:
        raise HTTPException(status_code=403, detail="No branch assigned to this user — ask an admin")
    return b


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


def requires_feature_option(feature: str, option: str):
    """Gate an endpoint by a sub-option inside a parent feature."""
    def _dep(current_user=Depends(get_current_user)):
        from feature_access import user_feature_option
        if not user_feature_option(current_user, feature, option):
            raise HTTPException(
                status_code=403,
                detail=f"This capability ('{feature}.{option}') is not enabled for your plan.",
            )
        return current_user
    return _dep


def check_tenant_quota(slug: str, resource: str, current_count: int) -> None:
    """Raise 403 if tenant is at or over quota. resource is 'users' or 'branches'."""
    from platform_db import get_tenant_by_slug, get_tenant_limits
    tenant = get_tenant_by_slug(slug)
    if not tenant:
        raise HTTPException(status_code=401, detail="Tenant not found")
    limits = get_tenant_limits(tenant)
    cap = limits.get("max_users" if resource == "users" else "max_branches")
    if cap is None:
        return
    if current_count >= cap:
        label = "users" if resource == "users" else "branches"
        plan = tenant.get("plan") or "basic"
        raise HTTPException(
            status_code=403,
            detail=f"{label.capitalize()} limit reached ({current_count}/{cap} on {plan} plan). Contact support to upgrade.",
        )


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
    return _non_admin_branch(current_user)


def resolve_analytics_branch(request: Request, current_user) -> Optional[int]:
    """Dashboard / reports scope: admin may view all branches (None) or one branch via header.

    Unlike get_active_branch_id, admins default to ALL when the header is omitted or 'all'.
    Non-admins are always pinned to their branch.
    """
    if current_user.get("role") != "admin":
        return _non_admin_branch(current_user)
    raw = request.headers.get("X-Active-Branch")
    if not raw or raw in ("0", "all", "ALL"):
        return None
    try:
        return int(raw)
    except ValueError:
        return None


# Same rules as the menu (frontend/src/lib/routeAccess.ts canAccessFeature), enforced on
# the server for actions that change stock, prices or purchases — so a user the menu
# hides a page from can't do it by calling the API directly.
_BRANCH_ROLE_FEATURES = {"pos", "sales", "expiry", "shifts", "hr", "transfers", "branches_stock"}


def user_can_feature(user: dict, *features: str) -> bool:
    role = user.get("role")
    if role == "admin":
        return True
    perms = user.get("permissions")
    for f in features:
        if f in ("settings", "clinics"):
            continue
        if role == "branch" and f not in _BRANCH_ROLE_FEATURES:
            continue
        if isinstance(perms, list) and f not in perms:
            continue
        return True
    return False


def require_user_feature(user: dict, *features: str) -> None:
    if not user_can_feature(user, *features):
        raise HTTPException(status_code=403, detail="You are not allowed to do this")
