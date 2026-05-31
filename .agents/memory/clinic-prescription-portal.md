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

## Feature gating
- `clinics` is a per-tenant feature (FEATURES_CATALOG, default True). The clinics
  nav/page stay `adminOnly` AND now also require the `clinics` feature.
- Gate ONLY the authenticated clinics routes (`/api/clinics*`, `/api/prescriptions*`)
  and `/api/sales/by-clinic` with `requires_feature("clinics")`. NEVER gate the public
  `/api/clinic/{slug}/{token}*` portal routes — they have no JWT/tenant context, so a
  router-level gate would 403 them.
- Endpoints shared with another feature's page (e.g. `/api/sales/by-clinic` used by the
  Reports page) must be paired with a frontend `hasFeature('clinics')` guard so the
  page only calls them when the feature is on — otherwise gating 403s break that page.
- **Why:** `default True` + backfilling existing non-null tenants preserves the old
  always-on behavior; NULL-features tenants resolve to DEFAULT_FEATURES (which includes
  clinics) consistently on both `normalize_features` (login) and `requires_feature`.

## Feature rollout (CRITICAL for "closable" features)
- Default-on features must propagate to existing tenants EXACTLY ONCE, never on every
  boot. A per-boot backfill of all default-on features silently re-enables anything an
  admin disabled, making default-on features impossible to permanently turn off.
- Rule: `bootstrap_platform()` records each propagated key in `platform.feature_rollouts`
  and skips already-recorded keys on later boots, so per-tenant on/off choices persist.
- The one-time migration must be concurrency-safe: serialize with a Postgres advisory
  lock and gate the initial seed on an in-table sentinel row (NOT a `to_regclass`
  pre-check) — multiple workers can otherwise see the table exist before it is seeded and
  re-run the full backfill.
- To force-propagate a genuinely NEW default-on feature to existing tenants (dev AND
  prod), add its key to `_PENDING_FEATURE_BACKFILL` so it is excluded from the
  already-rolled-out seed and backfilled once.
- **Why:** the system cannot distinguish "new feature never seen" from "admin disabled
  it," so one-time rollout treats current per-tenant state as intentional.

## Conventions
- Schema added to `backend/init_db.py` with `IF NOT EXISTS` so
  `apply_schema_to_all_tenants()` auto-creates it per tenant.
