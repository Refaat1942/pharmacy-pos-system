import os
import re
from typing import Optional

import psycopg2
import psycopg2.extras
from psycopg2 import sql

from tenant_ctx import get_current_schema

_SCHEMA_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,62}$")


def _raw_connect():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        conn = psycopg2.connect(database_url)
    else:
        conn = psycopg2.connect(
            host=os.getenv("PGHOST", "localhost"),
            port=int(os.getenv("PGPORT", "5432")),
            database=os.getenv("PGDATABASE", "pharmacy"),
            user=os.getenv("PGUSER", "postgres"),
            password=os.getenv("PGPASSWORD", ""),
        )
    conn.autocommit = False
    return conn


def _apply_search_path(conn, schema: str) -> None:
    if not _SCHEMA_RE.match(schema):
        raise ValueError(f"Invalid schema name: {schema!r}")
    cur = conn.cursor()
    # Always include public as fallback (extensions, citext, etc).
    cur.execute(
        sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema))
    )
    cur.close()


def get_db_connection(schema: Optional[str] = None):
    """Return a tenant-scoped Postgres connection.

    If `schema` is provided, search_path is set to that schema. Otherwise the
    contextvar set by the tenant middleware is used, falling back to 'public'
    (the default tenant) when no request context is active (e.g. startup).
    """
    conn = _raw_connect()
    target = schema or get_current_schema() or "public"
    _apply_search_path(conn, target)
    return conn


def get_platform_connection():
    """Connection scoped to the 'platform' control-plane schema."""
    conn = _raw_connect()
    _apply_search_path(conn, "platform")
    return conn


def get_raw_connection():
    """Connection with no search_path mutation (for CREATE SCHEMA, etc)."""
    return _raw_connect()
