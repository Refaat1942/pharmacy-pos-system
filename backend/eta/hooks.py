"""Post-commit hooks — enqueue ETA submissions (must never raise)."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_SALE_TYPES = frozenset({"cash", "delivery", "digital", "insurance", "on_account"})


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
            "SELECT status, type FROM invoices WHERE id = %s",
            (invoice_id,),
        )
        row = cur.fetchone()
        if not row or row.get("status") != "completed":
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
        enqueue_submission(
            cur,
            invoice_id=invoice_id,
            return_id=return_id,
            document_type="RR",
            idempotency_key=f"RR-{return_id}",
        )
    except Exception:
        logger.exception("ETA enqueue_return failed for return %s", return_id)
