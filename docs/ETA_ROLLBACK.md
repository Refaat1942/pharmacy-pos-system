# ETA Integration — Rollback Document

**Branch:** `eta-integration`  
**Created:** 2026-06-20  
**Status:** Pre-implementation baseline (no ETA code deployed yet)

This document defines how to undo ETA integration work safely at each phase.  
**Rule:** POS checkout, stock, insurance math, auth, and tenant isolation must never depend on ETA.

---

## Protected files (never modify during ETA work)

These files must remain unchanged. If a phase requires touching them, **stop and get explicit approval**:

| File | Reason |
|------|--------|
| `backend/stock_batches.py` | FEFO stock integrity |
| `backend/insurance_engine.py` | Insurance pricing / patient share |
| `backend/auth.py` | JWT and password security |
| `backend/tenant_ctx.py` | Multi-tenant schema isolation |
| `frontend/src/pages/POS.tsx` | Core checkout UX (except optional read-only ETA display later) |
| `frontend/src/components/PaymentModal.tsx` | Checkout payment flow |
| `backend/main.py` → `create_sale` body | Existing POS checkout logic (only post-commit hook allowed outside transaction) |

---

## Default-off policy

- ETA feature flag **`eta`** is **off** for all tenants until manually enabled in Control Platform.
- `eta_credentials.active` defaults to **`false`** in every tenant schema.
- No cron worker should be installed until Phase 2 is approved and pilot tenant is chosen.
- Hooks must no-op when feature or credentials are inactive.

---

## Pre-implementation baseline

### Git

```bash
# Baseline commit on main before ETA work (record hash here after backup)
git rev-parse main
# Working branch
git checkout eta-integration
```

### Database backup (required before Phase 0 schema changes)

Run on the **production/staging VPS** (not the Windows dev machine unless PostgreSQL client is installed):

```bash
sudo bash /opt/pharmapos/deploy/eta-full-backup.sh
```

Backup files are written to `/var/backups/pharmapos/eta/` with timestamp `YYYYMMDD_HHMMSS`.

**Record backup path here before Phase 0:**

| Environment | Backup file | Date | Verified by |
|-------------|-------------|------|-------------|
| Production  | _(fill after run)_ | | |
| Staging     | _(fill after run)_ | | |

### Restore full database from backup

```bash
# STOP the app first
sudo systemctl stop pharmapos

# Example restore (adjust file name)
BACKUP="/var/backups/pharmapos/eta/pharmacy_full_20260620_120000.sql.gz"
gunzip -c "$BACKUP" | sudo -u postgres psql -d pharmacy

# Or restore to a new DB for verification only:
sudo -u postgres createdb pharmacy_restore_test
gunzip -c "$BACKUP" | sudo -u postgres psql -d pharmacy_restore_test

sudo systemctl start pharmapos
```

---

## Rollback by phase

### Phase 0 — Schema + feature flag (disabled)

**What changes:** `init_db.py` (new ETA tables), `platform_db.py` (feature catalog entry), no runtime hooks.

| Action | Rollback |
|--------|----------|
| Code | `git revert` Phase 0 commits or checkout pre-Phase-0 tag |
| Feature flag | Remove `eta` from tenant features in platform UI (optional; default off anyway) |
| Database | **Preferred:** leave empty ETA tables (zero impact). **Hard:** see SQL below |

```sql
-- Per tenant schema (run only if Phase 0 deployed and no submissions exist)
DROP TABLE IF EXISTS eta_submission_attempts CASCADE;
DROP TABLE IF EXISTS eta_submissions CASCADE;
DROP TABLE IF EXISTS eta_branch_devices CASCADE;
DROP TABLE IF EXISTS eta_credentials CASCADE;
```

**POS impact after rollback:** None.

---

### Phase 1 — Isolated module + settings UI (no hooks)

**What changes:** `backend/eta/*`, `backend/eta/router.py`, settings frontend, `main.py` include_router only.

| Action | Rollback |
|--------|----------|
| Code | Remove `include_router(eta_router)` from `main.py`; delete `backend/eta/`; revert frontend ETA pages |
| Deploy | `git checkout <pre-phase-1>` && `sudo bash /opt/pharmapos/deploy/update.sh` |
| Database | Phase 0 tables remain; unused |

**POS impact after rollback:** None.

---

### Phase 2 — Post-commit enqueue + worker

**What changes:** `backend/eta/hooks.py`, thin calls in `main.py` **after** `conn.commit()`, cron worker.

| Action | Rollback |
|--------|----------|
| **Immediate hotfix** | Remove hook calls from `main.py` (2 call sites); redeploy — sales work instantly |
| Worker | `sudo crontab -e` — remove ETA worker line |
| Feature | Set all `eta_credentials.active = false` |
| Code | Full revert of Phase 2 commits |

```sql
-- Optional: mark in-flight submissions cancelled
UPDATE eta_submissions SET status = 'skipped', error_message = 'ETA rolled back'
WHERE status IN ('pending', 'submitting', 'failed');
```

**POS impact after rollback:** None (sales already committed independently).

---

### Phase 3 — Receipt / Sales ETA status UI

**What changes:** `ReceiptModal.tsx`, `Sales.tsx`, locales only.

| Action | Rollback |
|--------|----------|
| Frontend | Revert ETA UI commits; `npm run build` + deploy |
| Backend | No change required |

**POS impact after rollback:** None (cosmetic UI only).

---

### Phase 4 — Product VAT + line snapshots

**What changes:** `products.vat_pct`, `eta_item_code`, `invoice_items.vat_*`, inventory forms.

| Action | Rollback |
|--------|----------|
| Code | Revert inventory + create_sale snapshot lines (additive columns can stay NULL) |
| Database | **Do not DROP columns** if live sales already snapshot VAT — leave nullable |

**POS impact after rollback:** None if columns remain (NULL ignored).

---

## Emergency rollback (production incident)

1. **Stop ETA worker** (cron).
2. **Disable ETA:** `UPDATE eta_credentials SET active = false;` in affected tenant schema(s).
3. **Remove hooks** (if checkout somehow affected — should not happen): deploy last known good `main.py` without hook calls.
4. **Restart app:** `sudo systemctl restart pharmapos`.
5. **Verify POS:** complete one cash test sale.
6. **Post-mortem:** inspect `eta_submission_attempts` for errors; do not delete audit rows until resolved.

---

## Verification checklist after any rollback

- [ ] Cash POS sale completes
- [ ] Insurance sale completes (if enabled)
- [ ] Stock decrements correctly
- [ ] Returns process correctly
- [ ] Login / tenant switching works
- [ ] No 502 / import errors in `journalctl -u pharmapos`

---

## Phase gate process (mandatory)

After **each** phase:

1. **Stop** — no next phase until approved.
2. **Change report** — file under `docs/eta-reports/PHASE_N_CHANGE_REPORT.md`.
3. **Approval** — explicit sign-off before continuing.
4. **Backup** — new DB backup before schema-changing phases (0, 4).

---

## Contacts / references

- Deploy script: `deploy/update.sh`
- Daily backup: `deploy/backup.sh`
- Pre-ETA full backup: `deploy/eta-full-backup.sh`
- Implementation plan: prior analysis + dry-run plan in chat history
