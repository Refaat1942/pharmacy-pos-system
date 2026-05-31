---
name: Clinic Prescription Portal
description: How clinics send prescriptions into the POS, and the multi-tenant/branch rules that govern it.
---

# Clinic Prescription Portal

Admins create clinics and issue a private link `/rx/{tenant_slug}/{portal_token}`.
Clinics use it (no login) to submit free-text prescriptions; the POS shows a
notification bell that loads the lines into the cart.

## Public (no-auth) endpoints — tenant resolution
- Routes under `/api/clinic/{slug}/{token}` are **excluded from the JWT tenant
  middleware** (see `_needs_tenant` in `backend/main.py`). They have no JWT, so the
  schema must be set manually: resolve tenant via `get_tenant_by_slug(slug)` +
  `is_tenant_live`, then `set_current_schema(schema)` / `reset_current_schema` around
  every DB call, and pass `get_db_connection(schema=...)`.
- **Why:** any failure (bad slug, bad/inactive token, non-live tenant) must collapse
  to a 404 so the link reveals nothing about validity — do not leak distinct errors.

## Branch authorization (critical)
- Prescriptions carry a `branch_id` (nullable). List, count, status-update, **and the
  sale path that links/fulfills a prescription** must all filter by the caller's
  resolved branch with `(branch_id = %s OR branch_id IS NULL)`; `None` means
  admin-viewing-all.
- The sale path is easy to miss: `create_sale` accepts a client-supplied
  `prescription_id`, validates it, links it onto the invoice, and flips the
  prescription to `fulfilled`. BOTH the validation SELECT and the fulfill UPDATE need
  the branch predicate, and the UPDATE should only transition from `('pending','loaded')`.
- **Why:** acting by `id` alone is an IDOR — any user in the tenant could fulfill or
  flip another branch's prescription by guessing IDs. The branch predicate in every
  WHERE clause is the access control; keep it in lockstep across read AND write paths.

## POS cart loading
- Medicine names are free text. Loading tries exact EN/AR/barcode match, else a
  single-hit search result; unmatched lines are returned and shown to the cashier to
  add manually. Matching never auto-picks among multiple ambiguous results.

## Conventions
- Schema added to `backend/init_db.py` with `IF NOT EXISTS` so
  `apply_schema_to_all_tenants()` auto-creates it per tenant. Clinics nav/page are
  `adminOnly` with **no platform feature gate** (works for all tenants).
