---
name: Shift-close guards & delivery scoping
description: How cash-close blockers must be scoped and why new status columns gating them need backfill
---

# Shift (cash drawer) close guards

When adding a rule that blocks closing a shift (e.g. "can't close while delivery
orders are undelivered"), scope the blocking query the SAME way the cash
reconciliation does in `_compute_expected` (shifts.py): `seller_id = shift.user_id`,
`branch_id = shift.branch_id`, `created_at >= shift.opened_at`, `status='completed'`.

**Why:** the cash drawer is attributed per cashier+branch+time via `seller_id`. A
blocker scoped differently would flag orders that aren't part of this drawer (or miss
ones that are), confusing reconciliation. Staying consistent with the existing scope
keeps behavior predictable.

**Seller attribution caveat:** `seller_id` is client-supplied (the deliberate "select
who is making this sale" UI). That means both cash totals and these guards can be
sidestepped by attributing a sale to another seller. This is the app's established
model — do NOT silently force seller=authenticated user; that would break intended
behavior. Treat any change here as an explicit scope decision.

# New status columns that gate a guard must be backfilled

If a guard uses `COALESCE(new_col,'default')` but a UI list filters on `new_col = 'x'`
(no COALESCE), legacy NULL rows become *hidden blockers*: they block the action but
don't appear in the list the user would use to clear them. Backfill existing rows
(idempotent `UPDATE ... WHERE col IS NULL`) in init_db.SQL so list, filter, and guard
all agree across every tenant.
