"""Tenant feature + sub-option checks for pharmacy app code."""
from __future__ import annotations

from typing import Optional

from platform_db import get_tenant_by_slug, tenant_option_enabled, resolve_feature_options


def tenant_for_user(user: dict | None) -> Optional[dict]:
    if not user:
        return None
    slug = user.get("tenant_slug")
    if not slug:
        return None
    return get_tenant_by_slug(slug)


def user_feature_option(user: dict | None, feature: str, option: str) -> bool:
    """True if parent feature and sub-option are enabled for this user's tenant."""
    tenant = tenant_for_user(user)
    if not tenant:
        return True
    return tenant_option_enabled(tenant, feature, option)


def resolved_options_for_user(user: dict | None) -> dict:
    tenant = tenant_for_user(user)
    if not tenant:
        return {}
    return resolve_feature_options(tenant)
