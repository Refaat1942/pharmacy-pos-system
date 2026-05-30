---
name: Negative-stock selling & dev tenant schema
description: Sales may drive stock negative (POS only); transfer/adjustment stay strict. Dev DB stores the fratelanza tenant in the public schema.
---

## Negative stock is allowed on the SALE path only
POS sales (`POST /api/sales`) decrement stock without any availability check — stock may go negative. Replenishment (purchases / positive adjustments) nets it out via normal arithmetic (`stock += delta`).

**Why:** the client (pharmacy) wants to keep selling when inventory hasn't been entered/replenished yet, then reconcile later. A negative balance is the running shortfall.

**How to apply:** do NOT re-add an "insufficient stock" block to the sale path or the POS UI. The branch-transfer endpoint and the manual stock-adjustment endpoint deliberately KEEP their negative-stock guards — relaxing those would create phantom stock instead of recording a real sale. Keep that boundary.

## Dev DB schema quirk
In the dev environment the `products` (and related) tables live in the **`public`** schema, not `tenant_fratelanza`. `SET search_path TO tenant_fratelanza, public` silently falls back to `public` because `tenant_fratelanza` does not exist (the only tenant schema present is `tenant_raceb`). When writing raw psql test queries, target `public.products` directly.

**Why:** cost ~3 failed attempts assuming a `tenant_fratelanza` schema existed.
