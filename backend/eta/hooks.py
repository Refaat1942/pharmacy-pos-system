"""Post-commit hooks — enqueue ETA submissions (must never raise)."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_SALE_TYPES = frozenset({"cash", "delivery", "digital", "insurance", "on_account"})


def _branch_has_eta_device(cur, branch_id: int | None) -> bool:
    if not branch_id:
        return False
    from eta.db import get_branch_device

    device = get_branch_device(cur, branch_id)
    return bool(
        device
        and device.get("active")
        and (device.get("branch_code") or "").strip()
        and (device.get("pos_serial") or "").strip()
    )


def enqueue_sale(cur, invoice_id: int, user: dict, *, sale_type: str = "cash") -> None:
    """Enqueue ETA submission after sale commit."""
    try:
        from eta.db import enqueue_submission
        from eta.readiness import is_eta_operational

        if sale_type == "return" or sale_type not in _SALE_TYPES:
            return
        if not is_eta_operational(cur, user):
            return
        cur.execute(
            "SELECT status, type, branch_id FROM invoices WHERE id = %s",
            (invoice_id,),
        )
        row = cur.fetchone()
        if not row or row.get("status") != "completed":
            return
        if not _branch_has_eta_device(cur, row.get("branch_id")):
            return
        enqueue_submission(
            cur,
            invoice_id=invoice_id,
            return_id=None,
            document_type="SR",
            idempotency_key=f"SR-{invoice_id}",
        )
    except Exception:
        logger.exception("ETA enqueue_sale failed for invoice %s", invoice_id)


def enqueue_return(cur, return_id: int, invoice_id: int, user: dict) -> None:
    """Enqueue ETA return submission after return commit."""
    try:
        from eta.db import enqueue_submission
        from eta.readiness import is_eta_operational

        if not is_eta_operational(cur, user):
            return
        cur.execute("SELECT branch_id FROM invoices WHERE id = %s", (invoice_id,))
        inv = cur.fetchone()
        if not inv or not _branch_has_eta_device(cur, inv.get("branch_id")):
            return
        enqueue_submission(
            cur,
            invoice_id=invoice_id,
            return_id=return_id,
            document_type="RR",
            idempotency_key=f"RR-{return_id}",
        )
    except Exception:
        logger.exception("ETA enqueue_return failed for return %s", return_id)
