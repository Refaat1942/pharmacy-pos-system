---
name: Payroll proration
description: How monthly salary slips are calculated from attendance.
---

Salary slips are prorated by attendance using a **fixed 26 working-days/month** divisor (the owner's chosen rule):

`net = min(base_salary, round(base_salary * days_worked / 26, 2))` then `+ bonus - deductions`.

- `days_worked` = COUNT(DISTINCT work_date) where status='present' for that YYYY-MM.
- The `min(base, ...)` cap means working ≥26 days pays the full base (no overpay for >26 days).
- The same proration helper is applied in **both** the generate path and the manual edit (bonus/deductions) path, so editing a slip never reverts to full base.

**Why:** Before this, generation recorded days_worked but set net = full base salary regardless of attendance; absences did not reduce pay. The owner explicitly chose the 26-day divisor.

**How to apply:** Any new payroll path (regenerate, recalculation, reports) must use the shared proration helper, not the raw base_salary, or pay will silently diverge from attendance. Past slips are not retroactively changed unless they are edited or regenerated.

Note: `/api/hr/*` endpoints are gated behind the tenant 'hr' plan feature, so payroll APIs 403 ("feature not enabled") for tenants without it.
