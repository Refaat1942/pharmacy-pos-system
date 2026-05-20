"""Per-request tenant schema resolution using contextvars.

The current tenant's Postgres schema is stored in a ContextVar so that
get_db_connection() can transparently set search_path on every connection
without changing every callsite. The middleware in main.py populates this
from the JWT on each incoming request.
"""
from contextvars import ContextVar
from typing import Optional

_current_schema: ContextVar[Optional[str]] = ContextVar(
    "pharma_current_schema", default=None
)


def set_current_schema(schema: Optional[str]):
    """Set the current tenant schema and return the token used to reset it."""
    return _current_schema.set(schema)


def reset_current_schema(token) -> None:
    """Reset the contextvar to its previous value (use in a finally block)."""
    try:
        _current_schema.reset(token)
    except (ValueError, LookupError):
        # Token from a different context; fall back to clearing.
        _current_schema.set(None)


def get_current_schema() -> Optional[str]:
    return _current_schema.get()
