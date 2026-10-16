---
name: Negative-stock selling & dev tenant schema
description: Sales may drive stock negative (POS only); transfer/adjustment stay strict. Dev DB stores the fratelanza tenant in the public schema.
---

## Negative stock is allowed on the SALE path only
POS sales (`POST /api/sales`) decrement stock without any availability check — stock may go negative. Replenishment (purchases / positive adjustments) nets it out via normal arithmetic (`stock += delta`).

**Why:** the client (pharmacy) wants to keep selling when inventory hasn't been entered/replenished yet, then reconcile later. A negative balance is the running shortfall.

**How to apply:** do NOT re-add an "insufficient stock" block to the sale path or the POS UI. The branch-transfer endpoint and the manual stock-adjustment endpoint deliberately KEEP their negative-stock guards — relaxing those would create phantom stock instead of recording a real sale. Keep that boundary.

## Default tenant schema
The default pharmacy (`fratelanza`) now lives in **`tenant_fratelanza`**, like every other tenant. Older databases had it in `public`; `platform_db.migrate_default_tenant_out_of_public()` moves it on startup (one transaction, advisory lock, ALTER ... SET SCHEMA). After that `public` holds no tenant tables — only extensions (pg_trgm). Query `tenant_fratelanza.products` in raw psql.

**Why:** every tenant's search_path is "<schema>, public", so tenant data in public was a fallback every tenant could read.

**Gotcha:** `SET search_path` is transactional — a `conn.rollback()` silently resets it to public. Migration helpers in init_db use `_rollback_keep_search_path`; do the same anywhere you roll back after setting a tenant search_path.
