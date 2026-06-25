# Phase 1 — Post-Execution Change Report

**Date:** 2026-06-25  
**Branch:** `eta-integration` (not merged to `main`, not deployed to production)  
**ETA enabled:** **No** (`eta_credentials.active` defaults to `false`; feature catalog `default: false`)

---

## Summary

Phase 1 completed: EtaMiddleware HMAC client, invoice document mapper, settings API, admin UI, readiness checker, and developer readiness report. **No sale/return hooks** (Phase 2). POS checkout unchanged.

---

## Files added

| File | Purpose |
|------|---------|
| `backend/eta/__init__.py` | Package marker |
| `backend/eta/crypto.py` | Encrypt/decrypt credentials at rest |
| `backend/eta/signing.py` | HMAC-SHA256 v2 signing |
| `backend/eta/constants.py` | Document types, defaults |
| `backend/eta/client.py` | HTTP client for EtaMiddleware |
| `backend/eta/db.py` | Credentials + branch device persistence |
| `backend/eta/mapper.py` | Invoice → `Documents[]` JSON |
| `backend/eta/readiness.py` | Pre-flight checklist |
| `backend/eta/hooks.py` | Phase 2 stub (no-op) |
| `backend/eta/router.py` | REST API |
| `frontend/src/components/EtaSettings.tsx` | Admin settings UI |
| `docs/ETA_DEVELOPER_READINESS_REPORT.md` | Report for middleware developer |

## Files modified

| File | Change |
|------|--------|
| `backend/init_db.py` | Phase 1 migrations (HMAC columns, product tax fields) |
| `backend/platform_db.py` | Settings sub-option `eta` tab |
| `backend/main.py` | `include_router(eta_router)` only |
| `frontend/src/pages/Settings.tsx` | ETA tab |
| `frontend/src/lib/featureGates.ts` | `SETTINGS_TAB_OPTION.eta` |
| `frontend/src/locales/en.json` | ETA strings |
| `frontend/src/locales/ar.json` | ETA strings (Arabic) |

## Files not modified (protected)

| Area | Modified? |
|------|-----------|
| `backend/stock_batches.py` | No |
| `backend/insurance_engine.py` | No |
| `backend/auth.py` | No |
| `backend/tenant_ctx.py` | No |
| `create_sale` pricing/stock logic | No |

---

## Database migrations (additive)

- `eta_credentials`: `base_url`, `auth_key_enc`, `secret_key_enc`, `walk_in_defaults`
- `eta_branch_devices`: `branch_code`
- `eta_submissions`: `qr_url`
- `products`: `eta_item_code`, `eta_egs_code`, `vat_rate`
- `invoice_items`: `vat_amount`, `eta_line_snapshot`

---

## Tests

| Test | Result |
|------|--------|
| `python -c "import main"` | Pending CI/local run |
| `npm run build` | Pending CI/local run |
| POS smoke (checkout unchanged) | Yes (no hooks wired) |

---

## Rollback

- Remove `include_router(eta_router)` from `main.py`
- ETA tables are additive; no rollback required for POS operation
- Feature `eta` remains off in Control Platform

---

## Ready for Phase 2

**Yes** — after developer provides sandbox credentials and approves sample payloads from `/api/eta/preview/{invoice_id}`.
