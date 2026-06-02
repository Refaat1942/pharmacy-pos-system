---
name: Product branch_id orphans
description: Why products end up with NULL branch_id and how that breaks per-branch features.
---

In this multi-tenant pharmacy ERP, products are per-branch (`products.branch_id`). If items are bulk-uploaded while the operator is in admin "All branches" mode (no specific branch resolved), `branch_id` is saved as NULL.

**Symptom:** those items show as "—" branch, are invisible in per-branch stock views, and are excluded from branch-scoped queries (e.g. replenishment), so they look "missing".

**Why it matters:** branch-scoped reads filter `branch_id = active_branch`; admin "All branches" resolves active branch to None which means *no filter* (so it can surface them), but any branch-specific user/query never sees orphans.

**How to apply:**
- Prevent at the source: reject uploads when no specific branch is resolved (fail closed).
- Fix existing orphans with an idempotent `UPDATE ... WHERE branch_id IS NULL` assigning them to a real branch (per-tenant backfill in the startup schema apply). Caveat: this also catches any intentionally-global NULL-branch rows, so only do it when NULL truly means "orphan" for that data set.
