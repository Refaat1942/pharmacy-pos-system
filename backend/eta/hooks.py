"""Post-commit hooks (Phase 2). No-op until ETA is active — must never raise."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def enqueue_sale(cur, invoice_id: int, user: dict) -> None:
    """Enqueue ETA submission after sale commit. Phase 2 implementation."""
    try:
        from eta.readiness import is_eta_operational

        if not is_eta_operational(cur, user):
            return
        # Phase 2: INSERT INTO eta_submissions ...
    except Exception:
        logger.exception("ETA enqueue_sale failed for invoice %s", invoice_id)


def enqueue_return(cur, return_id: int, invoice_id: int, user: dict) -> None:
    """Enqueue ETA return submission after return commit. Phase 2 implementation."""
    try:
        from eta.readiness import is_eta_operational

        if not is_eta_operational(cur, user):
            return
        # Phase 2: INSERT INTO eta_submissions ...
    except Exception:
        logger.exception("ETA enqueue_return failed for return %s", return_id)
