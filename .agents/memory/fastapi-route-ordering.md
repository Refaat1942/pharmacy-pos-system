---
name: FastAPI literal vs path-param route shadowing
description: Why literal sub-routes get swallowed by /{id} routes and how to prevent it
---

# Literal routes vs `/{id}` routes

In this FastAPI app, routes are matched in registration order. A dynamic route like
`GET /purchase-orders/{po_id}` (with `po_id: int`) registered **before** a literal
route like `GET /purchase-orders/replenishment` will capture the literal path:
`{po_id}` binds to the string `"replenishment"`, int parsing fails, and the request
422s — so the literal endpoint silently never runs (frontend `.catch` then shows an
empty/"all OK" state, masking the bug).

**Fix used:** add the Starlette int path converter — `@router.get("/purchase-orders/{po_id:int}")`
(also on `/{po_id:int}/receive`, `/{po_id:int}/cancel`). With `:int`, non-numeric
paths no longer match the dynamic route and fall through to the literal route, so
registration order stops mattering for numeric-vs-literal collisions.

**Why:** safer than reordering large route blocks and self-documents that the id is numeric.
**How to apply:** any time you add a literal sub-path under a resource that already has a
`/{id}` route, either register the literal first OR type-constrain the id with `{id:int}`.
Watch for this whenever a list/action endpoint "returns nothing" but throws no visible error.
