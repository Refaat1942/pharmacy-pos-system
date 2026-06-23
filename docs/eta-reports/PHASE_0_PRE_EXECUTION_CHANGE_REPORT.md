# Phase 0 — Pre-Execution Change Report

**Date:** 2026-06-20  
**Branch:** `eta-integration` (all ETA work; no direct commits to `main`)  
**Status:** **NOT EXECUTED** — awaiting approval after SQL review  
**ETA enabled:** No (will remain off after Phase 0)

---

## Executive summary

Phase 0 adds **four new ETA tables** per tenant schema and registers the **`eta` feature** in the Control Platform catalog with **`default: false`**. It does **not** run hooks, change POS checkout, or alter any existing table columns.

**Backup (completed):** VPS `deploy/backup.sh` run `20260623_195021` → `/var/backups/pharmapos/` (`pharmacy`, `pharmapos_db`, `marketinghub`, `lotus_db`).

---

## 1. Branch policy

| Rule | Confirmation |
|------|----------------|
| All ETA work on `eta-integration` | **Yes** — local HEAD on `eta-integration` |
| No changes directly to `main` | **Yes** — Phase 0 will be committed only on `eta-integration`; merge to `main` is a separate approval |
| Phase 0 not executed yet | **Yes** — this document is pre-execution only |

---

## 2. Code changes planned (after approval)

| File | Change | Est. lines |
|------|--------|------------|
| `backend/init_db.py` | Add `ETA_MIGRATIONS` list; append to `apply_product_columns()` loop | ~55–70 |
| `backend/platform_db.py` | Add `eta` to `FEATURES_CATALOG` (`default: false`) + `FEATURE_OPTIONS_CATALOG` entry | ~25–35 |
| `docs/eta-reports/PHASE_0_CHANGE_REPORT.md` | Post-execution report (created after deploy) | ~80 |

**Files that will NOT be modified in Phase 0:**

- `backend/stock_batches.py`
- `backend/insurance_engine.py`
- `backend/auth.py`
- `backend/tenant_ctx.py`
- `backend/main.py` (no router, no hooks)
- `frontend/**` (no ETA UI in Phase 0)
- Existing POS checkout paths

---

## 3. Exact SQL — Phase 0 execution plan

**Scope:** Tenant schema only (`SET search_path TO <tenant_schema>, public`).  
**Execution path:** `init_db.apply_product_columns()` → one statement per migration, committed individually (same pattern as `CUSTOMER_PHONE_MIGRATIONS`).

**Applied to:** Every tenant schema via `platform_db.apply_schema_to_all_tenants()` on backend startup / `deploy/update.sh`.

### 3.1 CREATE TABLE statements (4)

```sql
CREATE TABLE IF NOT EXISTS eta_credentials (
    id SERIAL PRIMARY KEY,
    environment VARCHAR(20) NOT NULL,
    client_id VARCHAR(200),
    client_secret_enc TEXT,
    certificate_enc TEXT,
    issuer_rin VARCHAR(60),
    active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(environment)
);
```

```sql
CREATE TABLE IF NOT EXISTS eta_branch_devices (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    pos_serial VARCHAR(100) NOT NULL,
    device_label VARCHAR(100),
    activity_code VARCHAR(50),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(branch_id)
);
```

```sql
CREATE TABLE IF NOT EXISTS eta_submissions (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER REFERENCES invoices(id),
    return_id INTEGER REFERENCES returns(id),
    document_type VARCHAR(30) NOT NULL,
    idempotency_key VARCHAR(120) UNIQUE NOT NULL,
    eta_uuid VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    request_payload JSONB,
    response_payload JSONB,
    error_message TEXT,
    submitted_at TIMESTAMP,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

```sql
CREATE TABLE IF NOT EXISTS eta_submission_attempts (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES eta_submissions(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL,
    http_status INTEGER,
    response_body JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 ALTER TABLE statements on **existing** tables

**Count: 0**

Phase 0 intentionally excludes Phase 4 additive columns (`products.vat_pct`, `invoice_items.vat_*`, etc.). No `ALTER TABLE` on `invoices`, `products`, `invoice_items`, or any other pre-existing table.

### 3.3 Index creation statements (4)

```sql
CREATE INDEX IF NOT EXISTS idx_eta_submissions_status ON eta_submissions(status);
```

```sql
CREATE INDEX IF NOT EXISTS idx_eta_submissions_invoice ON eta_submissions(invoice_id);
```

```sql
CREATE INDEX IF NOT EXISTS idx_eta_submissions_return ON eta_submissions(return_id);
```

```sql
CREATE INDEX IF NOT EXISTS idx_eta_submission_attempts_submission ON eta_submission_attempts(submission_id);
```

### 3.4 Platform schema SQL

**Count: 0 new DDL statements for Phase 0.**

The `eta` feature is registered in Python (`FEATURES_CATALOG` with `"default": false`). Because it is not a default-on feature, `bootstrap_platform()` will **not** auto-enable `eta` for existing tenants (no `UPDATE platform.tenants SET features ...` for `eta`).

---

## 4. Safety confirmations

| Constraint | Phase 0 |
|------------|---------|
| No existing columns modified | **Confirmed** — zero `ALTER TABLE ... ALTER COLUMN` |
| No existing columns removed | **Confirmed** — zero `DROP COLUMN` |
| Sales logic unchanged | **Confirmed** — `main.py` / `create_sale` untouched |
| Inventory logic unchanged | **Confirmed** — `inventory.py`, `stock_batches.py` untouched |
| Insurance logic unchanged | **Confirmed** — `insurance_engine.py` untouched |
| Auth unchanged | **Confirmed** — `auth.py` untouched |
| Tenant isolation unchanged | **Confirmed** — `tenant_ctx.py` untouched |
| ETA disabled by default | **Confirmed** — feature catalog `default: false`; `eta_credentials.active` defaults to `false` |
| POS checkout impact | **None** — empty tables; no runtime code |

---

## 5. Runtime behavior after Phase 0 (when deployed)

1. Backend restart runs `apply_schema_to_all_tenants()` → creates ETA tables if missing.
2. Superadmin Control Platform shows **ETA** as an optional feature (off for all tenants).
3. No API routes, no worker, no enqueue hooks — application behavior identical to today.
4. All new tables start **empty**.

---

## 6. Rollback (if needed after execution)

| Layer | Action |
|-------|--------|
| Code | `git revert` Phase 0 commit(s) on `eta-integration` |
| Database (soft) | Leave empty ETA tables — zero runtime impact |
| Database (hard) | Per tenant schema: `DROP TABLE IF EXISTS eta_submission_attempts, eta_submissions, eta_branch_devices, eta_credentials CASCADE` (see `docs/ETA_ROLLBACK.md`) |
| Full restore | Use backup `20260623_195021` if catastrophic rollback required |

---

## 7. Tests planned immediately after execution (Phase 0 post-report)

| Test | Command / check |
|------|-----------------|
| Backend import | `cd backend && python -c "import main"` |
| Schema self-heal | Restart backend; confirm `apply_schema_to_all_tenants` ok count |
| Table existence | `\dt eta_*` in one tenant schema |
| POS smoke | Cash sale completes; receipt prints |
| Feature flag | `/api/auth/me` — `eta` absent unless superadmin enables |

---

## 8. Approval gate

| Item | Status |
|------|--------|
| VPS backup | **Done** (`20260623_195021`) |
| SQL plan reviewed | **Pending your approval** |
| Phase 0 implementation | **Blocked until approved** |
| Deploy to production | **Blocked until post-Phase-0 report approved** |

---

**Do not execute Phase 0 until explicit approval is given on this SQL plan.**
