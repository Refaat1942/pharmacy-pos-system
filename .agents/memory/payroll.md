---
name: Payroll proration
description: How monthly salary slips are calculated from attendance/hours.
---

Salary slips are prorated by **hours worked** against a fixed standard month of `26 days * 8h = 208 hours` (owner's chosen rule):

`prorated_base = round(base_salary * hours_worked / 208, 2)` then `net = prorated_base + bonus - deductions`.

- There is **no cap** — working more than the standard hours pays MORE (overtime), by owner's explicit choice.
- `hours_worked` for a slip = `SUM(COALESCE(hours, 8))` over present attendance rows for that YYYY-MM. A present day with no recorded hours counts as the full 8h, so tenants that never track hours get exactly the old day-based behavior (`base * days / 26`). This backward-compat fallback is load-bearing.
- The slip stores `hours_worked` (column added via `ALTER ... ADD COLUMN IF NOT EXISTS`). The manual edit path recomputes from `hours_worked`, falling back to `days_worked * 8` for legacy slips with no stored hours. The frontend edit-modal preview uses the same prorated-base formula so UI net matches backend net.

**Why:** Earlier this was day-based and capped (`min(base, base*days/26)`); the owner later asked to pay by actual hours with long days paying more and no cap. Generation must not record full base regardless of attendance.

**How to apply:** Any new payroll path (regenerate, recalculation, reports, edit preview) must derive net from the hours proration (or the days*8 fallback), never the raw base_salary, or pay silently diverges. Past slips are not retroactively changed unless edited/regenerated.

Note: `/api/hr/*` endpoints are gated behind the tenant 'hr' plan feature, so payroll APIs 403 ("feature not enabled") for tenants without it.
