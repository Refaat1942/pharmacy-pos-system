---
name: HR permission scoping & tenant JWT permissions
description: How permission-scoped (non-admin/branch) users get HR attendance access, and the JWT permissions gotcha.
---

# Tenant JWT did not carry `permissions`

The tenant login `create_token({...})` historically encoded only role/branch/name fields — **not** `user.permissions`. So any backend check based on the per-user `permissions` list will see `None` unless `permissions` is added to the token at login. `/api/auth/me` does return fresh permissions from the DB, but the JWT itself is what backend `get_current_user` reads on every request.

**Why:** permission-scoped feature gating (e.g. give a non-admin user only the `hr` feature) needs the permissions inside the JWT, otherwise backend authz can't enforce it.
**How to apply:** when adding permission-based backend gates, confirm the relevant claim is actually in the token payload, not just in the login response body.

# HR attendance access for permission-only users

Goal: a user with the `hr` permission (role NOT admin/branch) should reach **only** HR > Attendance.

- `_require_hr_access` = allow if role in (admin, branch) OR `'hr' in permissions`. Use it ONLY on attendance read/write.
- Do **not** open `GET /hr/employees` to hr-permission users — it returns sensitive master data (salary, national_id, phone). Keep it `_require_admin_or_branch`.
- The Attendance tab's employee picker only needs id+name; serve that from a slim `GET /hr/attendance-roster` (`_require_hr_access`, returns id+name of active employees). Attendance rows already carry `employee_name` via JOIN.
- Frontend gates: Sidebar bypasses the `roles` gate for the `hr` nav item only when the user's own permission set includes `hr` (other gates still apply); HR.tsx allows entry for hr-permission users but non-admins still see attendance tab only.

**Why:** matching UI visibility without also locking down the backend is a real authz hole — full employees list must stay admin/branch only.
