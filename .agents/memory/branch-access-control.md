---
name: Branch access control (multi-tenant pharmacy)
description: How non-admin users are scoped to a branch, and the fail-closed rule for stock-mutating endpoints
---

# Branch scoping for stock actions

`_assert_branch_access(user, product_branch_id)` in `backend/inventory.py` gates
all stock-mutating endpoints (adjustments, stocktake, and the item read/update
paths that call it).

Rule (must stay fail-closed for non-admins):
- `role == "admin"` → allowed for any branch (admins have `branch_id = NULL` and see all branches).
- Non-admin with `branch_id = NULL` → **denied** (403). This is the key trap: the
  original logic only denied when *both* branch ids were non-null, so a null-branch
  non-admin could mutate any branch's stock.
- Non-admin with a branch → allowed only when `product_branch_id` is NULL (shared/global
  product) or equals their own branch.

**Why:** a null-branch non-admin must not be treated as "unrestricted". `list_items`
already enforced this stricter (role-aware, fail-closed) pattern; the mutation guard
was inconsistent and fail-open. Keep them aligned.

**How to apply:** any new endpoint that changes stock or branch-scoped data should call
`_assert_branch_access` (or replicate the same role-aware, null-fails-closed check),
never the loose "deny only if both non-null and unequal" form.
