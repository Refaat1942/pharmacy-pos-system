# Phase 0 Baseline — Change Report (Pre-implementation setup)

**Date:** 2026-06-20  
**Branch:** `eta-integration`  
**Phase:** Setup only (no ETA application code yet)  
**ETA enabled:** No  

---

## Summary

Pre-implementation governance completed before any ETA module code:

- Dedicated git branch `eta-integration` created from `main`
- Rollback document and process document added
- Full PostgreSQL backup script added for VPS execution
- Phase gate rules documented

**No application code, schema migrations, or feature flags were deployed in this step.**

---

## Git

| Item | Value |
|------|-------|
| Base branch | `main` @ `1fd852e` (update) |
| Working branch | `eta-integration` |
| Commits | _(none yet — docs/scripts uncommitted until you approve commit)_ |

---

## Files added

| File | Purpose | Est. lines |
|------|---------|------------|
| `docs/ETA_ROLLBACK.md` | Rollback procedures per phase | ~180 |
| `docs/ETA_IMPLEMENTATION_PROCESS.md` | Phase gates, protected files, default-off policy | ~90 |
| `deploy/eta-full-backup.sh` | Full pg_dump backup before schema work | ~95 |
| `docs/eta-reports/PHASE_0_BASELINE_CHANGE_REPORT.md` | This report | ~60 |

**Total new documentation/scripts:** ~425 lines

---

## Files modified

None (application code untouched).

---

## Files deleted

None.

---

## Database

| Action | Status |
|--------|--------|
| Schema changes | **None** |
| Full backup | **Script ready** — must run on VPS (see below) |

### Backup note (local dev)

`pg_dump` is **not installed** on the Windows dev machine. A full backup cannot be taken locally.

**Required before Phase 0 schema work on server:**

```bash
sudo bash /opt/pharmapos/deploy/eta-full-backup.sh
```

Then record backup paths in `docs/ETA_ROLLBACK.md`.

---

## Protected files compliance

| File | Modified? |
|------|-----------|
| `stock_batches.py` | No |
| `insurance_engine.py` | No |
| `auth.py` | No |
| `tenant_ctx.py` | No |
| POS checkout logic | No |

---

## Tests

| Test | Result |
|------|--------|
| Frontend build | Not run (no code changes) |
| Backend import | Not run (no code changes) |
| POS smoke | N/A |

---

## Rollback for this setup step

Remove added docs/scripts or revert git commits. **Zero production impact.**

---

## Ready for Phase 0?

**Phase 0** = additive ETA tables in `init_db.py` + `eta` feature in catalog (**default off**).

| Prerequisite | Status |
|--------------|--------|
| Branch `eta-integration` | Done |
| Rollback document | Done |
| Full DB backup on target environment | **Pending — run on VPS** |
| Approval to commit setup docs | **Pending** |
| Approval to start Phase 0 | **Pending** |

---

**Awaiting approval before Phase 0 implementation.**
