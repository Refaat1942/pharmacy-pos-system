"""ETA settings, readiness, and sandbox test API."""
from __future__ import annotations

from typing import Any, Literal, Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_db_connection
from deps import get_current_user, requires_feature, requires_feature_option
from eta.client import EtaMiddlewareClient, EtaMiddlewareError
from eta.constants import DEFAULT_TEST_BASE_URL, DEFAULT_WALK_IN
from eta.db import (
    credentials_for_api,
    get_submission_for_invoice,
    list_branch_devices,
    list_branches_without_device,
    load_credentials_row,
    save_credentials,
    upsert_branch_device,
)
from eta.mapper import build_sales_document, load_invoice_bundle
from eta.readiness import is_eta_operational, readiness_report, tenant_has_eta_feature

router = APIRouter(prefix="/api/eta", tags=["eta"])


def _admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


class WalkInDefaults(BaseModel):
    CustomerName: Optional[str] = None
    CustomerCode: Optional[str] = None
    CustomerTaxId: Optional[str] = None
    CustomerPhone: Optional[str] = None
    CustomerCountryCode: Optional[str] = None
    CustomerGovernate: Optional[str] = None
    CustomerCity: Optional[str] = None
    CustomerStreet: Optional[str] = None
    CustomerBuilding: Optional[str] = None


class CredentialsPatch(BaseModel):
    environment: Literal["staging", "production"] = "staging"
    base_url: Optional[str] = None
    auth_key: Optional[str] = None
    secret_key: Optional[str] = None
    issuer_rin: Optional[str] = None
    walk_in_defaults: Optional[WalkInDefaults] = None
    active: Optional[bool] = None


class BranchDevicePatch(BaseModel):
    branch_code: str = Field(..., min_length=1, max_length=20)
    pos_serial: str = Field(..., min_length=1, max_length=100)
    device_label: Optional[str] = None
    activity_code: Optional[str] = None
    active: bool = True


def _public_credentials(cur, environment: str) -> dict[str, Any]:
    row = load_credentials_row(cur, environment=environment)
    creds = credentials_for_api(cur, environment=environment)
    walk_in = (creds or {}).get("walk_in") or DEFAULT_WALK_IN
    return {
        "environment": environment,
        "base_url": (row.get("base_url") if row else None) or DEFAULT_TEST_BASE_URL,
        "issuer_rin": (row.get("issuer_rin") if row else None) or "",
        "active": bool(row.get("active")) if row else False,
        "has_auth_key": bool(creds and creds.get("auth_key")),
        "has_secret_key": bool(creds and creds.get("secret_key")),
        "walk_in_defaults": walk_in,
        "updated_at": row.get("updated_at").isoformat() if row and row.get("updated_at") else None,
    }


@router.get("/status", dependencies=[Depends(requires_feature("eta"))])
def eta_status(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        staging = readiness_report(cur, environment="staging")
        return {
            "feature_enabled": tenant_has_eta_feature(current_user),
            "operational": is_eta_operational(cur, current_user),
            "readiness": staging,
        }
    finally:
        conn.close()


@router.get("/settings", dependencies=[Depends(requires_feature("eta")), Depends(requires_feature_option("eta", "settings"))])
def get_eta_settings(current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        return {
            "staging": _public_credentials(cur, "staging"),
            "production": _public_credentials(cur, "production"),
            "devices": list_branch_devices(cur),
            "branches_missing_device": list_branches_without_device(cur),
        }
    finally:
        conn.close()


@router.put("/settings", dependencies=[Depends(requires_feature("eta")), Depends(requires_feature_option("eta", "settings"))])
def update_eta_settings(body: CredentialsPatch, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        existing = load_credentials_row(cur, environment=body.environment)
        walk_in = None
        if body.walk_in_defaults is not None:
            base = dict(DEFAULT_WALK_IN)
            if existing and existing.get("walk_in_defaults"):
                base.update({k: v for k, v in dict(existing["walk_in_defaults"]).items() if v})
            base.update(body.walk_in_defaults.model_dump(exclude_unset=True))
            walk_in = base

        base_url = (body.base_url or (existing.get("base_url") if existing else DEFAULT_TEST_BASE_URL) or DEFAULT_TEST_BASE_URL).strip().rstrip("/")
        if not base_url.lower().startswith("https://"):
            raise HTTPException(status_code=400, detail="Base URL must start with https://")

        save_credentials(
            cur,
            environment=body.environment,
            base_url=base_url,
            auth_key=body.auth_key,
            secret_key=body.secret_key,
            issuer_rin=body.issuer_rin if body.issuer_rin is not None else (existing.get("issuer_rin") if existing else None),
            walk_in_defaults=walk_in,
            active=body.active if body.active is not None else bool(existing.get("active")) if existing else False,
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.put(
    "/devices/{branch_id}",
    dependencies=[Depends(requires_feature("eta")), Depends(requires_feature_option("eta", "settings"))],
)
def update_branch_device(branch_id: int, body: BranchDevicePatch, current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM branches WHERE id = %s", (branch_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Branch not found")
        upsert_branch_device(
            cur,
            branch_id=branch_id,
            branch_code=body.branch_code,
            pos_serial=body.pos_serial,
            device_label=body.device_label,
            activity_code=body.activity_code,
            active=body.active,
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/test-connection", dependencies=[Depends(requires_feature("eta")), Depends(requires_feature_option("eta", "settings"))])
def test_connection(environment: str = "staging", current_user=Depends(get_current_user)):
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        creds = credentials_for_api(cur, environment=environment)
        if not creds or not creds.get("has_secrets"):
            raise HTTPException(status_code=400, detail="Configure auth key and secret key first")
        client = EtaMiddlewareClient(
            base_url=creds["base_url"],
            auth_key=creds["auth_key"],
            secret_key=creds["secret_key"],
        )
        return client.test_connection()
    finally:
        conn.close()


@router.get("/readiness", dependencies=[Depends(requires_feature("eta"))])
def get_readiness(environment: str = "staging", current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        return readiness_report(cur, environment=environment)
    finally:
        conn.close()


@router.get("/invoice/{invoice_id}/receipt", dependencies=[Depends(requires_feature("eta")), Depends(requires_feature_option("eta", "receipts"))])
def get_invoice_eta_receipt(invoice_id: int, current_user=Depends(get_current_user)):
    """QR URL and status for printing on the customer receipt."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, type FROM invoices WHERE id = %s", (invoice_id,))
        inv = cur.fetchone()
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if inv.get("type") == "return":
            return {"active": False, "reason": "return"}

        submission = get_submission_for_invoice(cur, invoice_id)
        if not submission:
            operational = is_eta_operational(cur, current_user)
            return {
                "active": operational,
                "status": "not_submitted",
                "qr_url": None,
                "eta_uuid": None,
            }

        accepted = submission.get("status") == "accepted"
        return {
            "active": True,
            "status": submission.get("status"),
            "qr_url": submission.get("qr_url") if accepted else None,
            "eta_uuid": submission.get("eta_uuid") if accepted else None,
            "error_message": submission.get("error_message"),
            "accepted_at": submission.get("accepted_at").isoformat() if submission.get("accepted_at") else None,
        }
    finally:
        conn.close()


@router.get("/preview/{invoice_id}", dependencies=[Depends(requires_feature("eta")), Depends(requires_feature_option("eta", "receipts"))])
def preview_invoice_document(invoice_id: int, current_user=Depends(get_current_user)):
    """Build ETA JSON for a sale without submitting — for developer certification."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        creds = credentials_for_api(cur, environment="staging")
        walk_in = (creds or {}).get("walk_in") or DEFAULT_WALK_IN
        invoice, items, customer, device = load_invoice_bundle(cur, invoice_id)
        products_by_id = {}
        for it in items:
            pid = it.get("product_id")
            if pid:
                products_by_id[pid] = {
                    "id": pid,
                    "unit": it.get("unit"),
                    "vat_rate": it.get("vat_rate"),
                    "eta_item_code": it.get("eta_item_code"),
                    "eta_egs_code": it.get("eta_egs_code"),
                    "international_barcode": it.get("international_barcode"),
                    "barcode": it.get("product_barcode"),
                }
        doc = build_sales_document(
            invoice,
            items,
            branch_device=device,
            customer=customer,
            walk_in=walk_in,
            products_by_id=products_by_id,
        )
        return {"Documents": [doc]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()


@router.post("/submit-preview/{invoice_id}", dependencies=[Depends(requires_feature("eta")), Depends(requires_feature_option("eta", "receipts"))])
def submit_preview_invoice(invoice_id: int, environment: str = "staging", current_user=Depends(get_current_user)):
    """Submit a single invoice to sandbox — admin only, for certification."""
    _admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        creds = credentials_for_api(cur, environment=environment)
        if not creds or not creds.get("has_secrets"):
            raise HTTPException(status_code=400, detail="Configure credentials first")
        walk_in = creds.get("walk_in") or DEFAULT_WALK_IN
        invoice, items, customer, device = load_invoice_bundle(cur, invoice_id)
        products_by_id = {}
        for it in items:
            pid = it.get("product_id")
            if pid:
                products_by_id[pid] = {
                    "id": pid,
                    "unit": it.get("unit"),
                    "vat_rate": it.get("vat_rate"),
                    "eta_item_code": it.get("eta_item_code"),
                    "eta_egs_code": it.get("eta_egs_code"),
                    "international_barcode": it.get("international_barcode"),
                    "barcode": it.get("product_barcode"),
                }
        doc = build_sales_document(
            invoice,
            items,
            branch_device=device,
            customer=customer,
            walk_in=walk_in,
            products_by_id=products_by_id,
        )
        client = EtaMiddlewareClient(
            base_url=creds["base_url"],
            auth_key=creds["auth_key"],
            secret_key=creds["secret_key"],
        )
        try:
            return client.submit_documents([doc])
        except EtaMiddlewareError as exc:
            raise HTTPException(status_code=502, detail={"message": str(exc), "body": exc.body}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()
