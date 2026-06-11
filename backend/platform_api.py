"""Control-plane API: super-admin login + tenant management."""
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import create_token, verify_password, verify_token
from deps import get_super_admin
import platform_db

router = APIRouter(prefix="/api/platform", tags=["platform"])


# ─── Auth ───────────────────────────────────────────────────────────────────

class PlatformLoginIn(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
def platform_login(req: PlatformLoginIn, request: Request):
    from main import _login_throttle_check, _login_throttle_record_failure, _login_throttle_clear
    throttle_key = f"{request.client.host if request.client else 'unknown'}|platform|{req.username.lower()}"
    _login_throttle_check(throttle_key)
    admin = platform_db.get_super_admin_by_username(req.username)
    if not admin or not verify_password(req.password, admin["password_hash"]):
        _login_throttle_record_failure(throttle_key)
        raise HTTPException(401, "Invalid credentials")
    _login_throttle_clear(throttle_key)
    platform_db.touch_super_admin_login(admin["id"])
    token = create_token({
        "scope": "platform",
        "sa_id": admin["id"],
        "username": admin["username"],
    })
    return {
        "token": token,
        "admin": {
            "id": admin["id"],
            "username": admin["username"],
            "name": admin.get("name"),
        },
    }


@router.get("/auth/me")
def platform_me(admin=Depends(get_super_admin)):
    full = platform_db.get_super_admin_by_id(admin["sa_id"])
    return full


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


@router.post("/auth/change-password")
def change_password(body: ChangePasswordIn, admin=Depends(get_super_admin)):
    full = platform_db.get_super_admin_by_username(admin["username"])
    if not full or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    platform_db.change_super_admin_password(admin["sa_id"], body.new_password)
    return {"ok": True}


# ─── Tenants ────────────────────────────────────────────────────────────────

@router.get("/tenants")
def list_tenants(admin=Depends(get_super_admin)):
    return platform_db.list_tenants()


class TenantCreateIn(BaseModel):
    slug: str
    name: str
    plan: str = "basic"
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    admin_username: str = "admin"
    admin_password: str = Field(min_length=6)
    features: Optional[list[str]] = None
    feature_options: Optional[dict] = None
    subscription_start: Optional[str] = None  # ISO date 'YYYY-MM-DD'
    subscription_end: Optional[str] = None
    max_users: Optional[int] = None
    max_branches: Optional[int] = None
    price_le: Optional[int] = None


@router.post("/tenants")
def create_tenant(body: TenantCreateIn, admin=Depends(get_super_admin)):
    try:
        return platform_db.create_tenant(
            slug=body.slug,
            name=body.name,
            plan=body.plan,
            contact_name=body.contact_name,
            contact_email=body.contact_email,
            contact_phone=body.contact_phone,
            notes=body.notes,
            admin_username=body.admin_username,
            admin_password=body.admin_password,
            features=body.features,
            feature_options=body.feature_options,
            subscription_start=body.subscription_start,
            subscription_end=body.subscription_end,
            max_users=body.max_users,
            max_branches=body.max_branches,
            price_le=body.price_le,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Provisioning failed: {e}")


class TenantUpdateIn(BaseModel):
    name: Optional[str] = None
    status: Optional[Literal["active", "suspended"]] = None
    plan: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    features: Optional[list[str]] = None
    feature_options: Optional[dict] = None
    subscription_start: Optional[str] = None
    subscription_end: Optional[str] = None
    max_users: Optional[int] = None
    max_branches: Optional[int] = None
    price_le: Optional[int] = None


@router.patch("/tenants/{tid}")
def update_tenant(tid: int, body: TenantUpdateIn, admin=Depends(get_super_admin)):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "No fields provided")
    try:
        return platform_db.update_tenant(tid, fields)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/tenants/{tid}")
def delete_tenant(tid: int, confirm_slug: str, admin=Depends(get_super_admin)):
    """Permanently drop a tenant and its schema. Pass `?confirm_slug=<slug>`
    to confirm. Refuses to delete the default tenant (`public` schema)."""
    t = platform_db.get_tenant_by_id(tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    if t["slug"] != confirm_slug:
        raise HTTPException(400, "confirm_slug does not match tenant slug")
    try:
        platform_db.delete_tenant(tid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.get("/tenants/{tid}")
def get_tenant(tid: int, admin=Depends(get_super_admin)):
    t = platform_db.get_tenant_by_id(tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


@router.get("/tenants/{tid}/stats")
def tenant_stats(tid: int, admin=Depends(get_super_admin)):
    t = platform_db.get_tenant_by_id(tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    return platform_db.get_tenant_stats(t)


@router.get("/features-catalog")
def features_catalog(admin=Depends(get_super_admin)):
    return {
        "features": platform_db.FEATURES_CATALOG,
        "defaults": platform_db.DEFAULT_FEATURES,
        "feature_options": platform_db.FEATURE_OPTIONS_CATALOG,
    }


@router.get("/blueprint")
def sales_blueprint(admin=Depends(get_super_admin)):
    """Product blueprint for customer sign-off and sales demo videos."""
    import platform_blueprint
    return platform_blueprint.get_blueprint()


@router.get("/blueprint/tenant/{tid}")
def sales_blueprint_for_tenant(tid: int, admin=Depends(get_super_admin)):
    """Blueprint filtered to a pharmacy customer's actual enabled modules."""
    import platform_blueprint
    t = platform_db.get_tenant_by_id(tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    if t.get("schema_name") == "public":
        raise HTTPException(400, "Cannot build blueprint for the platform default tenant")
    return platform_blueprint.get_blueprint_for_tenant(t)


@router.get("/blueprint/video-script/download")
def download_pos_video_script(admin=Depends(get_super_admin)):
    """Download bilingual POS video script as Markdown."""
    from fastapi.responses import Response
    import platform_blueprint
    from datetime import date

    body = platform_blueprint.video_script_markdown()
    filename = f"fratelanza_pos_video_script_{date.today().isoformat()}.md"
    return Response(
        content=body.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/plans")
def list_plans(admin=Depends(get_super_admin)):
    return platform_db.list_plans()


@router.get("/plans/export")
def export_plans(admin=Depends(get_super_admin)):
    """Download current subscription plans, pricing, and feature matrix as Excel."""
    from datetime import date
    from excel_utils import xlsx_multi_sheet

    filename = f"fratelanza_plans_{date.today().isoformat()}.xlsx"
    return xlsx_multi_sheet(platform_db.plans_export_sheets(), filename)


class PlanUpdateIn(BaseModel):
    label: Optional[str] = None
    max_users: Optional[int] = None
    max_branches: Optional[int] = None
    price_le: Optional[int] = None
    notes: Optional[str] = None
    features: Optional[list[str]] = None
    sort_order: Optional[int] = None


@router.patch("/plans/{plan_key}")
def update_plan(plan_key: str, body: PlanUpdateIn, admin=Depends(get_super_admin)):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "No fields provided")
    try:
        return platform_db.update_plan(plan_key, fields)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/migrate-all")
def migrate_all(admin=Depends(get_super_admin)):
    """Re-apply init_db.SQL to every tenant schema (idempotent)."""
    return platform_db.apply_schema_to_all_tenants()
