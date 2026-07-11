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
    auth_key = decrypt_secret(row.get("auth_key_enc") or "").strip()
    if not auth_key:
        auth_key = (row.get("client_id") or "").strip()
    secret_key = decrypt_secret(row.get("secret_key_enc") or "").strip()
    if not secret_key:
        secret_key = decrypt_secret(row.get("client_secret_enc") or "").strip()
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


def enqueue_submission(
    cur,
    *,
    invoice_id: int | None,
    return_id: int | None,
    document_type: str,
    idempotency_key: str,
) -> int | None:
    """Insert a pending submission. Returns id or None if duplicate."""
    cur.execute(
        """
        INSERT INTO eta_submissions
            (invoice_id, return_id, document_type, idempotency_key, status)
        VALUES (%s, %s, %s, %s, 'pending')
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
        """,
        (invoice_id, return_id, document_type, idempotency_key),
    )
    row = cur.fetchone()
    return int(row["id"]) if row else None


def claim_pending_submissions(cur, *, limit: int = 20) -> list[dict]:
    cur.execute(
        """
        SELECT id FROM eta_submissions
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT %s
        FOR UPDATE SKIP LOCKED
        """,
        (limit,),
    )
    ids = [int(r["id"]) for r in cur.fetchall()]
    if not ids:
        return []
    cur.execute(
        """
        UPDATE eta_submissions
        SET status = 'processing', updated_at = NOW()
        WHERE id = ANY(%s)
        RETURNING *
        """,
        (ids,),
    )
    return [dict(r) for r in cur.fetchall()]


def count_submission_attempts(cur, submission_id: int) -> int:
    cur.execute(
        "SELECT COUNT(*) AS cnt FROM eta_submission_attempts WHERE submission_id = %s",
        (submission_id,),
    )
    return int(cur.fetchone()["cnt"])


def record_submission_attempt(
    cur,
    *,
    submission_id: int,
    attempt_no: int,
    http_status: int | None,
    response_body: Any,
    error_message: str | None,
) -> None:
    cur.execute(
        """
        INSERT INTO eta_submission_attempts
            (submission_id, attempt_no, http_status, response_body, error_message)
        VALUES (%s, %s, %s, %s::jsonb, %s)
        """,
        (
            submission_id,
            attempt_no,
            http_status,
            json.dumps(response_body, default=str) if response_body is not None else None,
            error_message,
        ),
    )


def mark_submission_accepted(
    cur,
    submission_id: int,
    *,
    eta_uuid: str | None,
    qr_url: str | None,
    request_payload: dict | None,
    response_payload: dict | None,
) -> None:
    cur.execute(
        """
        UPDATE eta_submissions SET
            status = 'accepted',
            eta_uuid = %s,
            qr_url = %s,
            request_payload = COALESCE(%s::jsonb, request_payload),
            response_payload = %s::jsonb,
            error_message = NULL,
            submitted_at = COALESCE(submitted_at, NOW()),
            accepted_at = NOW(),
            updated_at = NOW()
        WHERE id = %s
        """,
        (
            eta_uuid,
            qr_url,
            json.dumps(request_payload, default=str) if request_payload else None,
            json.dumps(response_payload, default=str) if response_payload else None,
            submission_id,
        ),
    )


def mark_submission_failed(
    cur,
    submission_id: int,
    *,
    error_message: str,
    response_payload: dict | None = None,
    retry: bool = False,
) -> None:
    status = "pending" if retry else "failed"
    cur.execute(
        """
        UPDATE eta_submissions SET
            status = %s,
            error_message = %s,
            response_payload = COALESCE(%s::jsonb, response_payload),
            updated_at = NOW()
        WHERE id = %s
        """,
        (
            status,
            error_message[:2000] if error_message else None,
            json.dumps(response_payload, default=str) if response_payload else None,
            submission_id,
        ),
    )


def reset_stale_processing(cur, *, minutes: int = 15) -> int:
    """Return stuck processing rows to pending after worker crash."""
    cur.execute(
        """
        UPDATE eta_submissions SET status = 'pending', updated_at = NOW()
        WHERE status = 'processing'
          AND updated_at < NOW() - (%s || ' minutes')::interval
        """,
        (str(int(minutes)),),
    )
    return cur.rowcount
