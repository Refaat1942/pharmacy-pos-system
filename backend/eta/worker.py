"""Background worker: process pending ETA submissions."""
from __future__ import annotations

import logging
from typing import Any

import psycopg2.extras
from psycopg2 import sql

from db import get_raw_connection
from eta.client import EtaMiddlewareClient, EtaMiddlewareError
from eta.constants import DEFAULT_WALK_IN
from eta.db import (
    claim_pending_submissions,
    count_submission_attempts,
    credentials_for_api,
    get_branch_device,
    mark_submission_accepted,
    mark_submission_failed,
    record_submission_attempt,
    reset_stale_processing,
)
from eta.mapper import (
    build_return_document,
    build_sales_document,
    build_unique_id,
    load_invoice_bundle,
    load_return_bundle,
)
from eta.readiness import is_eta_operational
from eta.response_parser import parse_accepted_document, response_error_summary
from platform_db import list_tenants

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
DEFAULT_ENVIRONMENT = "staging"


def _products_map_from_items(items: list[dict]) -> dict[int, dict]:
    products_by_id: dict[int, dict] = {}
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
    return products_by_id


def _fetch_qr_if_needed(
    client: EtaMiddlewareClient,
    *,
    unique_id: str,
    eta_uuid: str | None,
    qr_url: str | None,
) -> str | None:
    if qr_url:
        return qr_url
    try:
        data = client.get_qr_url(unique_id)
        _, qr = parse_accepted_document(data, unique_id=unique_id)
        return qr
    except EtaMiddlewareError as exc:
        logger.warning("ETA QrCode fetch failed for %s: %s", unique_id, exc)
        return None


def _process_one(cur, submission: dict, *, environment: str = DEFAULT_ENVIRONMENT) -> None:
    sub_id = int(submission["id"])
    attempts = count_submission_attempts(cur, sub_id)
    if attempts >= MAX_ATTEMPTS:
        mark_submission_failed(cur, sub_id, error_message="Max retry attempts exceeded", retry=False)
        return

    creds = credentials_for_api(cur, environment=environment)
    if not creds or not creds.get("has_secrets"):
        mark_submission_failed(cur, sub_id, error_message="ETA credentials missing", retry=False)
        return

    walk_in = creds.get("walk_in") or DEFAULT_WALK_IN
    doc_type = (submission.get("document_type") or "SR").upper()
    client = EtaMiddlewareClient(
        base_url=creds["base_url"],
        auth_key=creds["auth_key"],
        secret_key=creds["secret_key"],
    )

    try:
        if doc_type == "SR":
            invoice_id = int(submission["invoice_id"])
            invoice, items, customer, device = load_invoice_bundle(cur, invoice_id)
            doc = build_sales_document(
                invoice,
                items,
                branch_device=device,
                customer=customer,
                walk_in=walk_in,
                products_by_id=_products_map_from_items(items),
            )
        elif doc_type == "RR":
            return_id = int(submission["return_id"])
            ret, items, customer, device, original_uuid, original_unique_id, partial = load_return_bundle(
                cur, return_id
            )
            if not original_uuid and not original_unique_id:
                mark_submission_failed(
                    cur,
                    sub_id,
                    error_message="Original sale not yet accepted by ETA — will retry",
                    retry=True,
                )
                return
            doc = build_return_document(
                ret,
                items,
                branch_device=device,
                original_unique_id=original_unique_id,
                original_uuid=original_uuid,
                customer=customer,
                walk_in=walk_in,
                products_by_id=_products_map_from_items(items),
                partial=partial,
            )
        else:
            mark_submission_failed(cur, sub_id, error_message=f"Unknown document type {doc_type}", retry=False)
            return
    except ValueError as exc:
        mark_submission_failed(cur, sub_id, error_message=str(exc), retry=False)
        return

    unique_id = doc.get("UniqueId") or ""
    payload = {"Documents": [doc]}
    attempt_no = attempts + 1

    try:
        response = client.submit_documents([doc])
        eta_uuid, qr_url = parse_accepted_document(response, unique_id=unique_id)
        is_success = response.get("IsSuccess") if isinstance(response, dict) else None
        err_summary = response_error_summary(response)

        if is_success is False or (is_success is None and not eta_uuid and err_summary):
            val_error = any(
                token in err_summary.upper()
                for token in ("VAL_", "ERR_AUTH", "ERR_HMAC", "ERR_IP")
            )
            retry = not val_error and attempt_no < MAX_ATTEMPTS
            record_submission_attempt(
                cur,
                submission_id=sub_id,
                attempt_no=attempt_no,
                http_status=200,
                response_body=response,
                error_message=err_summary,
            )
            mark_submission_failed(cur, sub_id, error_message=err_summary, response_payload=response, retry=retry)
            return

        qr_url = _fetch_qr_if_needed(client, unique_id=unique_id, eta_uuid=eta_uuid, qr_url=qr_url)
        record_submission_attempt(
            cur,
            submission_id=sub_id,
            attempt_no=attempt_no,
            http_status=200,
            response_body=response,
            error_message=None,
        )
        mark_submission_accepted(
            cur,
            sub_id,
            eta_uuid=eta_uuid,
            qr_url=qr_url,
            request_payload=payload,
            response_payload=response if isinstance(response, dict) else {"raw": response},
        )
    except EtaMiddlewareError as exc:
        body = exc.body if isinstance(exc.body, dict) else {"raw": exc.body}
        summary = response_error_summary(body) or str(exc)
        dup_ok = "ERR_DUP" in summary.upper() or "DUPLICATE" in summary.upper()
        if dup_ok:
            eta_uuid, qr_url = parse_accepted_document(body, unique_id=unique_id)
            qr_url = _fetch_qr_if_needed(client, unique_id=unique_id, eta_uuid=eta_uuid, qr_url=qr_url)
            mark_submission_accepted(
                cur,
                sub_id,
                eta_uuid=eta_uuid,
                qr_url=qr_url,
                request_payload=payload,
                response_payload=body,
            )
            return
        retry = (exc.http_status or 0) >= 500 or attempt_no < MAX_ATTEMPTS
        record_submission_attempt(
            cur,
            submission_id=sub_id,
            attempt_no=attempt_no,
            http_status=exc.http_status,
            response_body=body,
            error_message=summary,
        )
        mark_submission_failed(cur, sub_id, error_message=summary, response_payload=body, retry=retry)


def process_tenant_schema(schema_name: str, *, tenant_slug: str, limit: int = 20) -> dict[str, int]:
    stats = {"claimed": 0, "accepted": 0, "failed": 0, "skipped": 0}
    conn = get_raw_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema_name)))
        user = {"tenant_slug": tenant_slug}
        if not is_eta_operational(cur, user, environment=DEFAULT_ENVIRONMENT):
            stats["skipped"] = 1
            conn.commit()
            return stats

        reset_stale_processing(cur, minutes=15)
        claimed = claim_pending_submissions(cur, limit=limit)
        stats["claimed"] = len(claimed)
        for row in claimed:
            _process_one(cur, dict(row), environment=DEFAULT_ENVIRONMENT)
            cur.execute("SELECT status FROM eta_submissions WHERE id = %s", (row["id"],))
            status_row = cur.fetchone()
            status = status_row["status"] if status_row else "failed"
            if status == "accepted":
                stats["accepted"] += 1
            elif status == "failed":
                stats["failed"] += 1
        conn.commit()
    except Exception:
        conn.rollback()
        logger.exception("ETA worker failed for schema %s", schema_name)
        raise
    finally:
        conn.close()
    return stats


def process_all_tenants(*, limit_per_tenant: int = 20) -> dict[str, Any]:
    totals = {"tenants": 0, "claimed": 0, "accepted": 0, "failed": 0, "skipped": 0, "errors": []}
    for tenant in list_tenants():
        if tenant.get("status") != "active":
            continue
        schema = tenant.get("schema_name")
        slug = tenant.get("slug")
        if not schema or not slug:
            continue
        totals["tenants"] += 1
        try:
            stats = process_tenant_schema(schema, tenant_slug=slug, limit=limit_per_tenant)
            for key in ("claimed", "accepted", "failed", "skipped"):
                totals[key] += stats.get(key, 0)
        except Exception as exc:
            totals["errors"].append({"tenant": slug, "error": str(exc)})
            logger.exception("ETA worker error tenant=%s", slug)
    return totals


def process_tenant_with_user(cur, user: dict, *, limit: int = 20) -> dict[str, int]:
    stats = {"claimed": 0, "accepted": 0, "failed": 0}
    if not is_eta_operational(cur, user, environment=DEFAULT_ENVIRONMENT):
        return stats
    reset_stale_processing(cur, minutes=15)
    claimed = claim_pending_submissions(cur, limit=limit)
    stats["claimed"] = len(claimed)
    for row in claimed:
        _process_one(cur, dict(row), environment=DEFAULT_ENVIRONMENT)
        cur.execute("SELECT status FROM eta_submissions WHERE id = %s", (row["id"],))
        status_row = cur.fetchone()
        status = status_row["status"] if status_row else "failed"
        if status == "accepted":
            stats["accepted"] += 1
        elif status == "failed":
            stats["failed"] += 1
    return stats
