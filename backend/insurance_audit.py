"""Audit logging for insurance and discount-card admin actions."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

import psycopg2.extras


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def log_insurance_audit(
    cur,
    *,
    entity_type: str,
    entity_id: Optional[int],
    action: str,
    user_id: Optional[int],
    branch_id: Optional[int] = None,
    old_value: Any = None,
    new_value: Any = None,
) -> None:
    cur.execute(
        """INSERT INTO insurance_audit_log
           (entity_type, entity_id, action, user_id, branch_id, old_value, new_value)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (
            entity_type,
            entity_id,
            action,
            user_id,
            branch_id,
            psycopg2.extras.Json(_json_safe(old_value)) if old_value is not None else None,
            psycopg2.extras.Json(_json_safe(new_value)) if new_value is not None else None,
        ),
    )
