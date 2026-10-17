"""Exactly-once writes for requests that may be sent twice.

Offline tills queue changes and upload them when the network returns; a change can
also be re-sent after a timeout although the server already saved it. Clients put a
random X-Idempotency-Key on every write. The first request with a key is processed
and its answer stored; any later request with the same key gets the stored answer
instead of being applied again.
"""
import hashlib
import random
from typing import Optional

from fastapi import Request
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse, Response

from db import _raw_connect

HEADER = "x-idempotency-key"
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_table_ready = False


def _ensure_table(cur) -> None:
    global _table_ready
    if _table_ready:
        return
    cur.execute(
        """CREATE TABLE IF NOT EXISTS public.idempotency_keys (
               key        VARCHAR(80) PRIMARY KEY,
               scope      VARCHAR(64) NOT NULL,
               status     INTEGER,
               body       BYTEA,
               media_type VARCHAR(100),
               created_at TIMESTAMP NOT NULL DEFAULT now()
           )"""
    )
    _table_ready = True


def _scope(request: Request, body: bytes = b"") -> str:
    # Bind a key to the person (tenant + user), not to one login token: a change queued
    # offline may be uploaded after the cashier logs in again with a new token.
    who = ""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        from auth import verify_token
        payload = verify_token(auth[7:]) or {}
        who = f"{payload.get('tenant_slug')}:{payload.get('user_id')}"
    # The body is part of the scope: the same key re-sent with different content is a
    # client bug and is refused (409) instead of silently returning the first answer.
    h = hashlib.sha256(f"{request.method} {request.url.path} {who}".encode())
    h.update(hashlib.sha256(body or b"").digest())
    return h.hexdigest()[:64]


def _claim(key: str, scope: str) -> Optional[tuple]:
    """Reserve the key. Returns None if this request should run, else the stored row."""
    conn = _raw_connect()
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        if random.random() < 0.01:
            cur.execute("DELETE FROM public.idempotency_keys WHERE created_at < now() - interval '7 days'")
        # A reservation left by a crashed request is released after 2 minutes.
        cur.execute(
            "DELETE FROM public.idempotency_keys WHERE key=%s AND status IS NULL "
            "AND created_at < now() - interval '2 minutes'",
            (key,),
        )
        cur.execute(
            "INSERT INTO public.idempotency_keys (key, scope) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
            (key, scope),
        )
        claimed = cur.rowcount == 1
        row = None
        if not claimed:
            cur.execute("SELECT scope, status, body, media_type FROM public.idempotency_keys WHERE key=%s", (key,))
            row = cur.fetchone()
        conn.commit()
        return None if claimed else (row or ("", None, None, None))
    finally:
        conn.close()


def _finish(key: str, status: Optional[int], body: bytes, media_type: Optional[str]) -> None:
    conn = _raw_connect()
    try:
        cur = conn.cursor()
        if status is None:
            cur.execute("DELETE FROM public.idempotency_keys WHERE key=%s", (key,))
        else:
            cur.execute(
                "UPDATE public.idempotency_keys SET status=%s, body=%s, media_type=%s WHERE key=%s",
                (status, body, media_type, key),
            )
        conn.commit()
    finally:
        conn.close()


async def idempotency_middleware(request: Request, call_next):
    key = (request.headers.get(HEADER) or "").strip()[:80]
    if not key or request.method not in WRITE_METHODS:
        return await call_next(request)
    try:
        raw = await request.body()  # cached by Starlette for the endpoint
    except Exception:
        raw = b""
    scope = _scope(request, raw)
    try:
        stored = await run_in_threadpool(_claim, key, scope)
    except Exception:
        return await call_next(request)  # never block a write because of this table
    if stored is not None:
        st_scope, status, body, media_type = stored
        if st_scope and st_scope != scope:
            return JSONResponse({"detail": "Idempotency key already used"}, status_code=409)
        if status is None:
            return JSONResponse({"detail": "Request in progress, retry shortly"}, status_code=409,
                                headers={"X-Idempotency-Pending": "1"})
        return Response(content=bytes(body or b""), status_code=status, media_type=media_type,
                        headers={"X-Idempotency-Replayed": "1"})

    try:
        response = await call_next(request)
    except Exception:
        await run_in_threadpool(_finish, key, None, b"", None)
        raise
    body = b"".join([chunk async for chunk in response.body_iterator])
    # Not final: server errors and login/permission/rate refusals — release the key so
    # the change can be retried (e.g. after the cashier logs in again).
    keep = response.status_code < 500 and response.status_code not in (401, 403, 408, 409, 429)
    await run_in_threadpool(_finish, key, response.status_code if keep else None, body if keep else b"",
                            response.media_type or response.headers.get("content-type"))
    headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
    return Response(content=body, status_code=response.status_code, headers=headers,
                    media_type=response.media_type)
