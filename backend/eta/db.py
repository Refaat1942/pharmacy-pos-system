"""Load and persist ETA credentials / branch device mappings."""
from __future__ import annotations

import json
from typing import Any, Optional

from eta.constants import DEFAULT_TEST_BASE_URL, DEFAULT_WALK_IN
from eta.crypto import decrypt_secret, encrypt_secret


def _merge_walk_in(raw: Any) -> dict[str, str]:
    out = dict(DEFAULT_WALK_IN)
    if isinstance(raw, dict):
        for k, v in raw.items():
            if k in out and v is not None:
                out[k] = str(v)
    return out


def load_credentials_row(cur, *, environment: str = "staging") -> Optional[dict]:
    cur.execute(
        """
        SELECT id, environment, base_url, auth_key_enc, secret_key_enc, client_id,
               client_secret_enc, issuer_rin, walk_in_defaults, active, updated_at
        FROM eta_credentials
        WHERE environment = %s
        LIMIT 1
        """,
        (environment,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def credentials_for_api(cur, *, environment: str = "staging") -> Optional[dict]:
    row = load_credentials_row(cur, environment=environment)
    if not row:
        return None
    auth_key = decrypt_secret(row.get("auth_key_enc") or "")
    if not auth_key:
        auth_key = (row.get("client_id") or "").strip()
    secret_key = decrypt_secret(row.get("secret_key_enc") or "")
    if not secret_key:
        secret_key = decrypt_secret(row.get("client_secret_enc") or "")
    base_url = (row.get("base_url") or "").strip()
    if not base_url:
        base_url = DEFAULT_TEST_BASE_URL if environment != "production" else ""
    return {
        **row,
        "auth_key": auth_key,
        "secret_key": secret_key,
        "base_url": base_url.rstrip("/"),
        "walk_in": _merge_walk_in(row.get("walk_in_defaults")),
        "has_secrets": bool(auth_key and secret_key),
    }


def save_credentials(
    cur,
    *,
    environment: str,
    base_url: str,
    auth_key: str | None,
    secret_key: str | None,
    issuer_rin: str | None,
    walk_in_defaults: dict | None,
    active: bool,
) -> None:
    existing = load_credentials_row(cur, environment=environment)
    auth_enc = existing.get("auth_key_enc") if existing else None
    secret_enc = existing.get("secret_key_enc") if existing else None
    if auth_key is not None and auth_key.strip():
        auth_enc = encrypt_secret(auth_key.strip())
    if secret_key is not None and secret_key.strip():
        secret_enc = encrypt_secret(secret_key.strip())

    walk_json = json.dumps(walk_in_defaults or DEFAULT_WALK_IN)
    cur.execute(
        """
        INSERT INTO eta_credentials
            (environment, base_url, auth_key_enc, secret_key_enc, issuer_rin,
             walk_in_defaults, active, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, NOW())
        ON CONFLICT (environment) DO UPDATE SET
            base_url = EXCLUDED.base_url,
            auth_key_enc = COALESCE(EXCLUDED.auth_key_enc, eta_credentials.auth_key_enc),
            secret_key_enc = COALESCE(EXCLUDED.secret_key_enc, eta_credentials.secret_key_enc),
            issuer_rin = EXCLUDED.issuer_rin,
            walk_in_defaults = EXCLUDED.walk_in_defaults,
            active = EXCLUDED.active,
            updated_at = NOW()
        """,
        (
            environment,
            (base_url or DEFAULT_TEST_BASE_URL).rstrip("/"),
            auth_enc,
            secret_enc,
            (issuer_rin or "").strip() or None,
            walk_json,
            bool(active),
        ),
    )


def list_branch_devices(cur) -> list[dict]:
    cur.execute(
        """
        SELECT d.id, d.branch_id, d.branch_code, d.pos_serial, d.device_label,
               d.activity_code, d.active,
               b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
        FROM eta_branch_devices d
        JOIN branches b ON b.id = d.branch_id
        ORDER BY b.name_en ASC
        """
    )
    return [dict(r) for r in cur.fetchall()]


def list_branches_without_device(cur) -> list[dict]:
    cur.execute(
        """
        SELECT b.id, b.name_en, b.name_ar
        FROM branches b
        WHERE NOT EXISTS (
            SELECT 1 FROM eta_branch_devices d WHERE d.branch_id = b.id AND d.active = true
        )
        ORDER BY b.name_en ASC
        """
    )
    return [dict(r) for r in cur.fetchall()]


def upsert_branch_device(
    cur,
    *,
    branch_id: int,
    branch_code: str,
    pos_serial: str,
    device_label: str | None = None,
    activity_code: str | None = None,
    active: bool = True,
) -> None:
    cur.execute(
        """
        INSERT INTO eta_branch_devices
            (branch_id, branch_code, pos_serial, device_label, activity_code, active)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (branch_id) DO UPDATE SET
            branch_code = EXCLUDED.branch_code,
            pos_serial = EXCLUDED.pos_serial,
            device_label = EXCLUDED.device_label,
            activity_code = EXCLUDED.activity_code,
            active = EXCLUDED.active
        """,
        (
            branch_id,
            (branch_code or "").strip(),
            (pos_serial or "").strip(),
            (device_label or "").strip() or None,
            (activity_code or "").strip() or None,
            bool(active),
        ),
    )


def get_submission_for_invoice(cur, invoice_id: int) -> Optional[dict]:
    cur.execute(
        """
        SELECT id, invoice_id, document_type, eta_uuid, qr_url, status, error_message,
               accepted_at, created_at, updated_at
        FROM eta_submissions
        WHERE invoice_id = %s
        ORDER BY id DESC
        LIMIT 1
        """,
        (invoice_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def get_branch_device(cur, branch_id: int) -> Optional[dict]:
    cur.execute(
        """
        SELECT id, branch_id, branch_code, pos_serial, device_label, activity_code, active
        FROM eta_branch_devices
        WHERE branch_id = %s AND active = true
        LIMIT 1
        """,
        (branch_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None
