"""Pre-flight checks before ETA sandbox certification."""
from __future__ import annotations

from typing import Any

from eta.constants import DEFAULT_WALK_IN
from eta.db import credentials_for_api, list_branch_devices, list_branches_without_device


def tenant_has_eta_feature(user: dict) -> bool:
    from platform_db import get_tenant_by_slug, normalize_features

    slug = user.get("tenant_slug")
    if not slug:
        return False
    tenant = get_tenant_by_slug(slug)
    if not tenant:
        return False
    return "eta" in normalize_features(tenant.get("features"))


def is_eta_operational(cur, user: dict, *, environment: str = "staging") -> bool:
    if not tenant_has_eta_feature(user):
        return False
    creds = credentials_for_api(cur, environment=environment)
    if not creds or not creds.get("active") or not creds.get("has_secrets"):
        return False
    if not (creds.get("base_url") or "").strip():
        return False
    devices = list_branch_devices(cur)
    if not any(d.get("active") and d.get("pos_serial") and d.get("branch_code") for d in devices):
        return False
    return True


def readiness_report(cur, *, environment: str = "staging") -> dict[str, Any]:
    creds = credentials_for_api(cur, environment=environment)
    devices = list_branch_devices(cur)
    missing_devices = list_branches_without_device(cur)

    cur.execute(
        """
        SELECT COUNT(*) AS cnt FROM products
        WHERE active = true
          AND COALESCE(NULLIF(TRIM(eta_item_code), ''), NULLIF(TRIM(international_barcode), ''), NULLIF(TRIM(barcode), '')) IS NULL
        """
    )
    products_missing_code = int(cur.fetchone()["cnt"])

    cur.execute("SELECT COUNT(*) AS cnt FROM products WHERE active = true")
    active_products = int(cur.fetchone()["cnt"])

    cur.execute(
        """
        SELECT COUNT(*) AS cnt FROM eta_submissions
        WHERE status IN ('pending', 'failed')
        """
    )
    queue_backlog = int(cur.fetchone()["cnt"])

    blockers: list[str] = []
    warnings: list[str] = []

    if not creds:
        blockers.append("ETA credentials not configured")
    else:
        if not creds.get("has_secrets"):
            blockers.append("EtaAuthentication / SecretKey missing")
        if not creds.get("active"):
            warnings.append("ETA submission is disabled (active=false)")
        if not (creds.get("base_url") or "").strip():
            blockers.append("Base URL not set")

    if not devices:
        blockers.append("No branch POS devices mapped")
    elif missing_devices:
        warnings.append(f"{len(missing_devices)} branch(es) without ETA device mapping")

    for d in devices:
        if not (d.get("branch_code") or "").strip():
            blockers.append(f"Branch '{d.get('branch_name_en')}' missing BranchCode")
        if not (d.get("pos_serial") or "").strip():
            blockers.append(f"Branch '{d.get('branch_name_en')}' missing PosSerial")

    if active_products and products_missing_code:
        pct = round(100.0 * products_missing_code / active_products, 1)
        warnings.append(f"{products_missing_code}/{active_products} active products missing ItemCode ({pct}%)")

    walk_in = (creds or {}).get("walk_in") or DEFAULT_WALK_IN
    for field in ("CustomerName", "CustomerGovernate", "CustomerCity", "CustomerStreet", "CustomerCountryCode"):
        if not (walk_in.get(field) or "").strip():
            warnings.append(f"Walk-in default missing: {field}")

    ready = len(blockers) == 0

    return {
        "ready": ready,
        "environment": environment,
        "blockers": blockers,
        "warnings": warnings,
        "credentials_configured": bool(creds and creds.get("has_secrets")),
        "credentials_active": bool(creds and creds.get("active")),
        "base_url": (creds or {}).get("base_url"),
        "devices_mapped": len([d for d in devices if d.get("active")]),
        "branches_missing_device": missing_devices,
        "products_missing_item_code": products_missing_code,
        "active_products": active_products,
        "queue_backlog": queue_backlog,
    }
