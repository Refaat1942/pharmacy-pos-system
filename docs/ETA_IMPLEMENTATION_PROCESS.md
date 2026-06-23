# ETA Integration — Implementation Process

**Branch:** `eta-integration`  
**Default state:** ETA **disabled** for all tenants until manual activation.

---

## Phase sequence

| Phase | Deliverable | Stop for approval |
|-------|-------------|-------------------|
| **0** | DB tables + feature catalog entry (off by default) | Yes |
| **1** | `backend/eta/*` module, settings API/UI, no sale hooks | Yes |
| **2** | Post-commit enqueue + worker cron (still disabled until credentials active) | Yes |
| **3** | Receipt/Sales status UI | Yes |
| **4** | Product VAT + invoice line snapshots | Yes |

No phase may start until the previous phase change report is approved.

---

## Hard constraints

1. **Never modify:**
   - `backend/stock_batches.py`
   - `backend/insurance_engine.py`
   - `backend/auth.py`
   - `backend/tenant_ctx.py`
   - Existing POS checkout logic inside `create_sale` (pricing, stock loop, payment validation)

2. **Allowed in `main.py` only:**
   - `include_router(eta_router)`
   - After successful `conn.commit()` on sale/return: call `eta.hooks.enqueue_*` inside `try/except` (must not raise)

3. **ETA disabled by default:**
   - `FEATURES_CATALOG`: `eta` with `default: false`
   - `eta_credentials.active`: `false`
   - Hooks check feature + active before any write

4. **POS must never await ETA HTTP** during checkout.

---

## Change report template

After each phase, create:

`docs/eta-reports/PHASE_<N>_CHANGE_REPORT.md`

Include:

- Phase number and date
- Git commits (hashes)
- Files added / modified / deleted (list)
- Lines changed (approx)
- Database migrations applied
- Tests run and results
- Rollback steps tested (yes/no)
- ETA still disabled (yes/no)
- POS smoke test (yes/no)
- **Ready for next phase:** yes / no

---

## Backup before schema work

Run before Phase 0 and Phase 4:

```bash
sudo bash /opt/pharmapos/deploy/eta-full-backup.sh
```

Record path in `docs/ETA_ROLLBACK.md`.

---

## Activation (post Phase 4, separate approval)

1. Complete ETA sandbox certification.
2. Populate product VAT / item codes.
3. Configure credentials in tenant ETA settings (staging first).
4. Enable `eta` feature for **one pilot tenant** in Control Platform.
5. Set `eta_credentials.active = true` for that tenant only.
6. Enable worker cron.
7. Monitor `eta_submissions` for 7 days before wider rollout.
