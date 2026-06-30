# Phase 0 — Post-Execution Change Report

**Date:** 2026-06-20  
**Branch:** `eta-integration` only (not merged to `main`, not deployed to production)  
**Commit:** `3f244fdfb9094fb7d31f33d55e91535f7a9634cd` (`3f244fd`)  
**ETA enabled:** **No** (feature catalog `default: false`; `eta_credentials.active` defaults to `false`)

---

## Summary

Phase 0 completed on `eta-integration`. Additive ETA tables and indexes are defined in `init_db.py` and will be created per tenant schema when `apply_schema_to_all_tenants()` runs (on next backend startup / deploy). The `eta` feature is registered in the Control Platform catalog but **off by default** for all tenants.

No sales, POS, inventory, insurance, auth, or tenant-resolution code was changed.

---

## Git

| Item | Value |
|------|-------|
| Branch | `eta-integration` |
| Commit hash | `3f244fd` |
| Merged to `main` | **No** |
| Deployed to production | **No** |
| Base (previous HEAD) | `fb8f521` |

### Git diff summary (`3f244fd`)

```
 backend/init_db.py     | 64 +++++++++++++++++++++++++++++++++++++++++++++++++-
 backend/platform_db.py | 10 ++++++++
 2 files changed, 73 insertions(+), 1 deletion(-)
```

**Commit message:** Add Phase 0 ETA schema and disabled feature catalog entry.

---

## Modified files

| File | Change |
|------|--------|
| `backend/init_db.py` | Added `ETA_MIGRATIONS` (4 tables + 4 indexes); wired into `apply_product_columns()` |
| `backend/platform_db.py` | Added `eta` to `FEATURES_CATALOG` (`default: false`) and `FEATURE_OPTIONS_CATALOG` |

### Files not modified (protected)

| File / area | Modified? |
|-------------|-----------|
| `backend/stock_batches.py` | No |
| `backend/insurance_engine.py` | No |
| `backend/auth.py` | No |
| `backend/tenant_ctx.py` | No |
| `backend/main.py` (sales / `create_sale`) | No |
| `frontend/**` (POS checkout) | No |

---

## Tables created (per tenant schema)

Applied via `ETA_MIGRATIONS` when schema self-heal runs:

| Table | Purpose |
|-------|---------|
| `eta_credentials` | Encrypted ETA OAuth credentials; `active` defaults to `false` |
| `eta_branch_devices` | Branch → POS serial mapping; `UNIQUE(branch_id)` |
| `eta_submissions` | Async submission queue / status |
| `eta_submission_attempts` | HTTP attempt audit log |

### Indexes created

| Index | Table |
|-------|-------|
| `idx_eta_submissions_status` | `eta_submissions` |
| `idx_eta_submissions_invoice` | `eta_submissions` |
| `idx_eta_submissions_return` | `eta_submissions` |
| `idx_eta_submission_attempts_submission` | `eta_submission_attempts` |

---

## Confirmation: no existing tables altered

**Confirmed.** `ETA_MIGRATIONS` contains **only**:

- 4 × `CREATE TABLE IF NOT EXISTS`
- 4 × `CREATE INDEX IF NOT EXISTS`

**Zero** `ALTER TABLE`, `DROP COLUMN`, or `DROP TABLE` statements in `ETA_MIGRATIONS`.

Foreign keys reference existing tables (`branches`, `invoices`, `returns`) but do not modify them.

---

## Verification results

| Check | Result |
|-------|--------|
| Phase 0 scope (CREATE only in `ETA_MIGRATIONS`) | **Pass** — static review |
| `eta` feature `default: false` in catalog | **Pass** — `platform_db.py` |
| Protected files untouched | **Pass** — only 2 files in commit |
| Branch is `eta-integration` | **Pass** |
| Not on `main` | **Pass** |
| Backend import (`python -c "import main"`) | **Not run locally** — `psycopg2` not installed on dev machine |
| Live DB: tables exist after restart | **Pending** — requires deploy/restart on VPS (not done per instructions) |
| Live DB: `invoices` / `returns` prerequisite | **Pending** — run on VPS before deploy (see query below) |
| POS smoke test | **Not run** — no runtime behavior change until deploy |

### Prerequisite query (run on VPS before deploy)

```sql
SELECT
    t.slug AS tenant_slug,
    t.schema_name,
    to_regclass(format('%I.invoices', t.schema_name)) IS NOT NULL AS invoices_exists,
    to_regclass(format('%I.returns',  t.schema_name)) IS NOT NULL AS returns_exists
FROM platform.tenants t
WHERE t.status = 'active'
ORDER BY t.slug;
```

### Post-deploy verification (when approved for VPS)

```sql
-- Per tenant schema after backend restart
SELECT tablename FROM pg_tables
WHERE schemaname = current_schema()
  AND tablename LIKE 'eta_%'
ORDER BY tablename;
-- Expected: eta_branch_devices, eta_credentials, eta_submission_attempts, eta_submissions
```

```bash
cd backend && python -c "import main"
```

---

## Rollback instructions

### Code rollback (on `eta-integration` or after merge)

```bash
git revert 3f244fd
# or
git checkout fb8f521 -- backend/init_db.py backend/platform_db.py
```

### Database rollback (after deploy only)

**Soft (recommended):** Leave empty ETA tables — zero impact if ETA stays disabled.

**Hard (per tenant schema, only if no submissions exist):**

```sql
DROP TABLE IF EXISTS eta_submission_attempts CASCADE;
DROP TABLE IF EXISTS eta_submissions CASCADE;
DROP TABLE IF EXISTS eta_branch_devices CASCADE;
DROP TABLE IF EXISTS eta_credentials CASCADE;
```

**Full restore:** Use VPS backup `20260623_195021` (`/var/backups/pharmapos/`) — see `docs/ETA_ROLLBACK.md`.

---

## Runtime impact today

| Area | Impact |
|------|--------|
| POS checkout | None |
| Sales / returns | None |
| Inventory / stock | None |
| Insurance | None |
| Auth / tenants | None |
| ETA submissions | None (no hooks, no API, no worker) |

Tables are created only after code is deployed and backend runs schema self-heal. Until then, production is unchanged.

---

## Ready for Phase 1?

| Gate | Status |
|------|--------|
| Phase 0 code on `eta-integration` | **Done** |
| Post-execution report | **Done** |
| Deploy to production | **Not done** (by design) |
| Approval for Phase 1 | **Pending** |

**Phase 1** = isolated `backend/eta/*` module + settings API/UI, still no sale hooks.

---

**Stopped after Phase 0. Awaiting approval before Phase 1.**
