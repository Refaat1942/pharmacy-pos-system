"""HR & Payroll: employees, attendance, salary slips."""
from calendar import monthrange
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import date, datetime, time
import hashlib
import secrets
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user, get_active_branch_id


def _generate_clock_code(eid: int, name: str) -> str:
    """Deterministic-ish, short, scanner-friendly employee code."""
    raw = f"{eid}|{name}|{secrets.token_hex(4)}"
    short = hashlib.md5(raw.encode("utf-8")).hexdigest()[:6].upper()
    return f"EMP-{eid:04d}-{short}"


def _normalize_code(value: str) -> str:
    """Reduce a scanned/typed code to a comparable key.

    Barcode scanners (especially on Arabic keyboard layouts) often drop or
    mangle separators like '-' and whitespace, so we strip everything that
    isn't an ASCII letter or digit and uppercase the rest. The same
    transformation is applied to the stored ``clock_code`` in SQL so a card
    printed as ``EMP-0001-A3F9C2`` still matches ``emp0001a3f9c2``,
    ``EMP 0001 A3F9C2`` etc."""
    return "".join(ch for ch in (value or "") if ch.isalnum()).upper()


# SQL expression that normalizes a stored clock_code the same way as
# _normalize_code(): uppercase and keep only A-Z / 0-9.
_CLOCK_CODE_NORMALIZED_SQL = (
    "UPPER(REGEXP_REPLACE(clock_code, '[^A-Za-z0-9]', '', 'g'))"
)

router = APIRouter(prefix="/api/hr", tags=["hr"])

PAYROLL_WORKING_DAYS = 26
STANDARD_HOURS_PER_DAY = 8
PAYROLL_STANDARD_MONTH_HOURS = PAYROLL_WORKING_DAYS * STANDARD_HOURS_PER_DAY


def _prorated_base(base_salary, days_worked) -> float:
    base = float(base_salary or 0)
    days = int(days_worked or 0)
    return min(base, round(base * days / PAYROLL_WORKING_DAYS, 2))


def _prorated_base_hours(base_salary, hours_worked) -> float:
    base = float(base_salary or 0)
    hours = float(hours_worked or 0)
    return round(base * hours / PAYROLL_STANDARD_MONTH_HOURS, 2)


def _slip_net(prorated_base: float, bonus: float, penalties: float, deductions: float) -> float:
    return round(float(prorated_base or 0) + float(bonus or 0) - float(penalties or 0) - float(deductions or 0), 2)


def _period_bounds(period_month: str) -> tuple[str, str, str]:
    year, month = map(int, period_month.split("-"))
    last = monthrange(year, month)[1]
    return period_month, f"{period_month}-01", f"{period_month}-{last:02d}"


def _attendance_payroll_stats(cur, employee_id: int, period_month: str, hours_allowance: float) -> dict:
    cur.execute("""
        SELECT COUNT(DISTINCT work_date) FILTER (WHERE status = 'present')::int AS days,
               COUNT(DISTINCT work_date) FILTER (WHERE status = 'absent')::int AS absent,
               COUNT(DISTINCT work_date) FILTER (WHERE status = 'leave')::int AS leave_days,
               COALESCE(SUM(
                 CASE
                   WHEN status <> 'present' THEN 0
                   WHEN COALESCE(allowed, false)
                     THEN GREATEST(COALESCE(hours, %(std)s), %(std)s)
                   WHEN COALESCE(hours, %(std)s) < %(std)s
                        AND COALESCE(hours, %(std)s) >= %(std)s - %(allow)s
                     THEN %(std)s
                   ELSE COALESCE(hours, %(std)s)
                 END
               ), 0) AS hours
        FROM attendance
        WHERE employee_id = %(eid)s AND TO_CHAR(work_date, 'YYYY-MM') = %(pm)s
    """, {"std": STANDARD_HOURS_PER_DAY, "allow": float(hours_allowance or 0),
          "eid": employee_id, "pm": period_month})
    row = cur.fetchone() or {}
    return {
        "days_worked": int(row.get("days") or 0),
        "absent_days": int(row.get("absent") or 0),
        "leave_days": int(row.get("leave_days") or 0),
        "hours_worked": float(row.get("hours") or 0),
    }


def _require_admin(user):
    if user.get('role') != 'admin':
        raise HTTPException(403, "Admin only")


def _require_admin_or_branch(user):
    if user.get('role') not in ('admin', 'branch'):
        raise HTTPException(403, "Admin or branch user only")


HR_TAB_PERMS = {
    "employees": "hr_employees",
    "attendance": "hr_attendance",
    "payroll": "hr_payroll",
    "performance": "hr_performance",
}


def _user_permissions(user) -> set:
    raw = user.get("permissions") or []
    if isinstance(raw, (list, tuple)):
        return {str(p) for p in raw}
    return set()


def _has_hr_tab(user, tab: str) -> bool:
    if user.get("role") == "admin":
        return True
    if tab == "employees":
        return False
    if user.get("role") == "branch":
        return tab == "attendance"
    perms = _user_permissions(user)
    key = HR_TAB_PERMS.get(tab)
    if key and key in perms:
        return True
    if tab == "attendance" and "hr" in perms:
        return True
    return False


def _require_hr_tab(user, tab: str) -> None:
    if _has_hr_tab(user, tab):
        return
    raise HTTPException(status_code=403, detail=f"HR access required for {tab}")


def _can_manage_employees(user) -> bool:
    return user.get("role") == "admin"


def _require_manage_employees(user) -> None:
    if _can_manage_employees(user):
        return
    raise HTTPException(
        status_code=403,
        detail="You are not authorized to use this feature",
    )


def _can_record_attendance(user) -> bool:
    return user.get("role") in ("admin", "branch")


def _require_record_attendance(user) -> None:
    if _can_record_attendance(user):
        return
    raise HTTPException(
        status_code=403,
        detail="You are not authorized to use this feature",
    )


def _require_hr_access(user):
    """Any HR module access (legacy endpoints shared across tabs)."""
    if user.get("role") in ("admin", "branch"):
        return
    perms = _user_permissions(user)
    if "hr" in perms or perms.intersection(HR_TAB_PERMS.values()):
        return
    raise HTTPException(status_code=403, detail="HR access required")


# ─── Employees ─────────────────────────────────────────────────────────────
class EmployeeIn(BaseModel):
    name: str = Field(min_length=1)
    role: Optional[str] = None
    branch_id: Optional[int] = None
    base_salary: float = Field(0, ge=0)
    hire_date: Optional[str] = None
    phone: Optional[str] = None
    national_id: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True
    hours_allowance: float = Field(0, ge=0)


@router.get("/employees")
def list_employees(active_only: bool = False, current_user=Depends(get_current_user)):
    _require_manage_employees(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        sql = """
            SELECT e.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
            FROM employees e LEFT JOIN branches b ON b.id = e.branch_id
        """
        if active_only:
            sql += " WHERE e.active = true"
        sql += " ORDER BY e.name"
        cur.execute(sql)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.post("/employees")
def create_employee(body: EmployeeIn, current_user=Depends(get_current_user)):
    _require_manage_employees(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO employees(name, role, branch_id, base_salary, hire_date,
                                  phone, national_id, notes, active, hours_allowance)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *
        """, [body.name, body.role, body.branch_id, body.base_salary, body.hire_date,
              body.phone, body.national_id, body.notes, body.active, body.hours_allowance])
        row = dict(cur.fetchone())
        # Assign a unique clock_code now that we know the new id
        code = _generate_clock_code(row["id"], body.name)
        cur.execute(
            "UPDATE employees SET clock_code=%s WHERE id=%s RETURNING *",
            [code, row["id"]],
        )
        row = dict(cur.fetchone())
        conn.commit(); return row
    finally:
        cur.close(); conn.close()


# ─── Self-service clock-in / clock-out ─────────────────────────────────────
class ClockIn(BaseModel):
    code: str = Field(min_length=1, max_length=60)


@router.post("/clock")
def clock_punch(body: ClockIn, current_user=Depends(get_current_user)):
    """Toggle attendance for the employee owning `code`. First scan of the day
    creates a check-in; second scan sets check-out and computes hours. Any
    authenticated tenant user can call this so a shared tablet near the door
    works regardless of which cashier is logged in."""
    raw = (body.code or "").strip()
    code = raw.upper()
    norm = _normalize_code(raw)
    if not code:
        raise HTTPException(400, "Code required")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # Try an exact (case-insensitive) match first, then fall back to a
        # normalized match that ignores hyphens/spaces/other separators a
        # scanner may have dropped or altered.
        cur.execute(
            "SELECT id, name, role, branch_id, active FROM employees WHERE UPPER(clock_code)=%s",
            [code],
        )
        emp = cur.fetchone()
        if not emp and norm:
            cur.execute(
                f"SELECT id, name, role, branch_id, active FROM employees "
                f"WHERE {_CLOCK_CODE_NORMALIZED_SQL}=%s",
                [norm],
            )
            emp = cur.fetchone()
        # Also accept a user *login* card (USR-...). Resolve it to the
        # employee linked on the user account so the same card works for both
        # unlocking a terminal and punching attendance.
        if not emp:
            cur.execute(
                """SELECT e.id, e.name, e.role, e.branch_id, e.active
                   FROM users u
                   JOIN employees e ON e.id = u.employee_id
                   WHERE UPPER(u.card_code) = %s
                      OR UPPER(REGEXP_REPLACE(u.card_code, '[^A-Za-z0-9]', '', 'g')) = %s
                   LIMIT 1""",
                [code, norm],
            )
            emp = cur.fetchone()
        # Manual-entry convenience: allow typing just the employee number
        # (e.g. "1" or "0001" for employee id 1).
        if not emp and raw.isdigit():
            cur.execute(
                "SELECT id, name, role, branch_id, active FROM employees WHERE id=%s",
                [int(raw)],
            )
            emp = cur.fetchone()
        # If the code is a known login card but the user has no employee yet,
        # auto-create and link one so any staff member can clock in with their
        # existing login card — no manual setup needed.
        if not emp and (code or norm):
            cur.execute(
                """SELECT id, name_en, name_ar, role, branch_id, employee_id
                   FROM users
                   WHERE UPPER(card_code) = %s
                      OR UPPER(REGEXP_REPLACE(card_code, '[^A-Za-z0-9]', '', 'g')) = %s
                   LIMIT 1""",
                [code, norm],
            )
            u = cur.fetchone()
            if u:
                emp_name = (u.get("name_en") or u.get("name_ar") or "Staff").strip()
                emp_role = u.get("role") or None
                cur.execute(
                    """INSERT INTO employees (name, role, branch_id, active, base_salary)
                       VALUES (%s, %s, %s, TRUE, 0) RETURNING id, name, role, branch_id, active""",
                    [emp_name, emp_role, u.get("branch_id")],
                )
                emp = cur.fetchone()
                cur.execute(
                    "UPDATE employees SET clock_code = %s WHERE id = %s",
                    [_generate_clock_code(emp["id"], emp_name), emp["id"]],
                )
                cur.execute(
                    "UPDATE users SET employee_id = %s WHERE id = %s",
                    [emp["id"], u["id"]],
                )
        if not emp:
            raise HTTPException(404, "Unknown employee code")
        if not emp["active"]:
            raise HTTPException(400, "Employee is inactive")
        today = date.today()
        now_t = datetime.now().time().replace(microsecond=0)
        actor_id = current_user.get("id") if isinstance(current_user, dict) else getattr(current_user, "id", None)
        cur.execute(
            """INSERT INTO attendance(employee_id, work_date, check_in, status, punched_by_user_id, punched_at)
               VALUES (%s, %s, %s, 'present', %s, now())
               ON CONFLICT (employee_id, work_date) DO NOTHING
               RETURNING *""",
            [emp["id"], today, now_t, actor_id],
        )
        inserted = cur.fetchone()
        if inserted:
            row = dict(inserted)
            action = "check_in"
        else:
            cur.execute(
                "SELECT * FROM attendance WHERE employee_id=%s AND work_date=%s FOR UPDATE",
                [emp["id"], today],
            )
            existing = cur.fetchone()
            hours = _calc_hours(existing["check_in"], now_t)
            cur.execute(
                """UPDATE attendance
                      SET check_out=%s, hours=%s, punched_by_user_id=%s, punched_at=now()
                    WHERE id=%s RETURNING *""",
                [now_t, hours, actor_id, existing["id"]],
            )
            row = dict(cur.fetchone())
            action = "check_out" if existing["check_out"] is None else "check_out_updated"
        conn.commit()
        return {
            "action": action,
            "employee": {"id": emp["id"], "name": emp["name"], "role": emp["role"]},
            "attendance": row,
            "time": now_t.strftime("%H:%M"),
        }
    finally:
        cur.close(); conn.close()


@router.put("/employees/{eid}")
def update_employee(eid: int, body: EmployeeIn, current_user=Depends(get_current_user)):
    _require_manage_employees(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            UPDATE employees SET name=%s, role=%s, branch_id=%s, base_salary=%s,
              hire_date=%s, phone=%s, national_id=%s, notes=%s, active=%s, hours_allowance=%s
            WHERE id=%s RETURNING *
        """, [body.name, body.role, body.branch_id, body.base_salary, body.hire_date,
              body.phone, body.national_id, body.notes, body.active, body.hours_allowance, eid])
        row = cur.fetchone()
        if not row: raise HTTPException(404, "Employee not found")
        conn.commit(); return dict(row)
    finally:
        cur.close(); conn.close()


@router.delete("/employees/{eid}")
def delete_employee(eid: int, current_user=Depends(get_current_user)):
    _require_manage_employees(current_user)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE employees SET active=false WHERE id=%s", [eid])
        conn.commit()
        return {"ok": True}
    finally:
        cur.close(); conn.close()


# ─── Attendance ────────────────────────────────────────────────────────────
class AttendanceIn(BaseModel):
    employee_id: int
    work_date: date
    check_in: Optional[time] = None
    check_out: Optional[time] = None
    status: Literal["present", "absent", "leave"] = "present"
    notes: Optional[str] = None
    allowed: bool = False


@router.get("/attendance-roster")
def attendance_roster(current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "attendance")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, name FROM employees WHERE active = TRUE ORDER BY name")
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.get("/delivery-roster")
def delivery_roster(current_user=Depends(get_current_user),
                    active_branch=Depends(get_active_branch_id)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        sql = (
            "SELECT id, name FROM employees "
            "WHERE active = TRUE AND role = 'delivery'"
        )
        params: list = []
        if active_branch is not None:
            sql += " AND (branch_id IS NULL OR branch_id = %s)"
            params.append(active_branch)
        sql += " ORDER BY name"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


def _calc_hours(ci: Optional[time], co: Optional[time]) -> Optional[float]:
    if not ci or not co: return None
    mins = (co.hour * 60 + co.minute) - (ci.hour * 60 + ci.minute)
    if mins < 0: mins += 24 * 60
    return round(mins / 60.0, 2)


@router.get("/attendance")
def list_attendance(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    employee_id: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    _require_hr_tab(current_user, "attendance")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        where = ["1=1"]; params = []
        if employee_id: where.append("a.employee_id=%s"); params.append(employee_id)
        if date_from: where.append("a.work_date >= %s"); params.append(date_from)
        if date_to: where.append("a.work_date <= %s"); params.append(date_to)
        cur.execute(f"""
            SELECT a.*, e.name AS employee_name
            FROM attendance a JOIN employees e ON e.id = a.employee_id
            WHERE {' AND '.join(where)}
            ORDER BY a.work_date DESC, e.name LIMIT 500
        """, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.post("/attendance")
def upsert_attendance(body: AttendanceIn, current_user=Depends(get_current_user)):
    _require_record_attendance(current_user)
    hours = _calc_hours(body.check_in, body.check_out)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if current_user.get('role') == 'admin':
            allowed_val = body.allowed
        else:
            cur.execute("SELECT allowed FROM attendance WHERE employee_id=%s AND work_date=%s",
                        [body.employee_id, body.work_date])
            ex = cur.fetchone()
            allowed_val = bool(ex['allowed']) if ex and ex['allowed'] is not None else False
        cur.execute("""
            INSERT INTO attendance(employee_id, work_date, check_in, check_out, hours, status, notes, allowed)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (employee_id, work_date) DO UPDATE SET
              check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out,
              hours=EXCLUDED.hours, status=EXCLUDED.status, notes=EXCLUDED.notes,
              allowed=EXCLUDED.allowed
            RETURNING *
        """, [body.employee_id, body.work_date, body.check_in, body.check_out,
              hours, body.status, body.notes, allowed_val])
        row = dict(cur.fetchone()); conn.commit(); return row
    finally:
        cur.close(); conn.close()


@router.delete("/attendance/{aid}")
def delete_attendance(aid: int, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM attendance WHERE id=%s", [aid])
        conn.commit(); return {"ok": True}
    finally:
        cur.close(); conn.close()


# ─── Salary slips / payroll ────────────────────────────────────────────────
class SlipUpdateIn(BaseModel):
    bonus: float = Field(0, ge=0)
    penalties: float = Field(0, ge=0)
    deductions: float = Field(0, ge=0)
    notes: Optional[str] = None


@router.get("/payroll")
def list_payroll(period_month: Optional[str] = None, q: Optional[str] = None,
                 current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        where = ["1=1"]; params = []
        if period_month:
            where.append("s.period_month=%s"); params.append(period_month)
        if q and q.strip():
            where.append("e.name ILIKE %s"); params.append(f"%{q.strip()}%")
        cur.execute(f"""
            SELECT s.*, e.name AS employee_name, e.role AS employee_role,
                   e.phone AS employee_phone, e.national_id AS employee_national_id,
                   e.hire_date AS employee_hire_date,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
            FROM salary_slips s
            JOIN employees e ON e.id = s.employee_id
            LEFT JOIN branches b ON b.id = e.branch_id
            WHERE {' AND '.join(where)}
            ORDER BY s.period_month DESC, e.name
        """, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.post("/payroll/generate")
def generate_payroll(period_month: str, current_user=Depends(get_current_user)):
    """Create draft slips for active employees for given YYYY-MM. Skips existing."""
    _require_hr_tab(current_user, "payroll")
    try:
        datetime.strptime(period_month, "%Y-%m")
    except ValueError:
        raise HTTPException(400, "period_month must be YYYY-MM")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, base_salary, COALESCE(hours_allowance, 0) AS hours_allowance FROM employees WHERE active=true")
        emps = cur.fetchall()
        created = 0
        for e in emps:
            stats = _attendance_payroll_stats(cur, e['id'], period_month, float(e['hours_allowance'] or 0))
            days = stats['days_worked']
            hours = stats['hours_worked']
            prorated = _prorated_base_hours(e['base_salary'], hours)
            net = _slip_net(prorated, 0, 0, 0)
            cur.execute("""
                INSERT INTO salary_slips(
                    employee_id, period_month, base_salary, bonus, penalties, deductions,
                    days_worked, hours_worked, absent_days, leave_days, prorated_base,
                    standard_days, standard_hours, net_amount, status)
                VALUES (%s,%s,%s,0,0,0,%s,%s,%s,%s,%s,%s,%s,%s,'draft')
                ON CONFLICT (employee_id, period_month) DO NOTHING
            """, [e['id'], period_month, e['base_salary'], days, hours,
                  stats['absent_days'], stats['leave_days'], prorated,
                  PAYROLL_WORKING_DAYS, PAYROLL_STANDARD_MONTH_HOURS, net])
            if cur.rowcount > 0: created += 1
        conn.commit()
        return {"created": created, "total_employees": len(emps), "period_month": period_month}
    finally:
        cur.close(); conn.close()


@router.put("/payroll/{slip_id}")
def update_slip(slip_id: int, body: SlipUpdateIn, current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM salary_slips WHERE id=%s", [slip_id])
        slip = cur.fetchone()
        if not slip: raise HTTPException(404, "Slip not found")
        if slip['status'] == 'paid':
            raise HTTPException(400, "Slip already paid")
        hrs = slip['hours_worked']
        if hrs is None:
            hrs = (slip['days_worked'] or 0) * STANDARD_HOURS_PER_DAY
        prorated = float(slip.get('prorated_base') or 0)
        if not prorated:
            prorated = _prorated_base_hours(slip['base_salary'], hrs)
        net = _slip_net(prorated, body.bonus, body.penalties, body.deductions)
        cur.execute("""
            UPDATE salary_slips SET bonus=%s, penalties=%s, deductions=%s,
              prorated_base=%s, net_amount=%s,
              notes=COALESCE(NULLIF(%s,''), notes)
            WHERE id=%s RETURNING *
        """, [body.bonus, body.penalties, body.deductions, prorated, net, body.notes, slip_id])
        conn.commit(); return dict(cur.fetchone())
    finally:
        cur.close(); conn.close()


@router.get("/payroll/{slip_id}/payslip")
def get_payslip(slip_id: int, current_user=Depends(get_current_user)):
    """Full payslip detail for display/print."""
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT s.*, e.name AS employee_name, e.role AS employee_role,
                   e.phone AS employee_phone, e.national_id AS employee_national_id,
                   e.hire_date AS employee_hire_date, e.hours_allowance,
                   b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
            FROM salary_slips s
            JOIN employees e ON e.id = s.employee_id
            LEFT JOIN branches b ON b.id = e.branch_id
            WHERE s.id = %s
        """, [slip_id])
        slip = cur.fetchone()
        if not slip:
            raise HTTPException(404, "Slip not found")
        slip = dict(slip)
        pm, start, end = _period_bounds(slip["period_month"])
        stats = _attendance_payroll_stats(
            cur, slip["employee_id"], pm, float(slip.get("hours_allowance") or 0),
        )
        hrs = slip.get("hours_worked")
        if hrs is None:
            hrs = stats["hours_worked"]
        prorated = float(slip.get("prorated_base") or 0)
        if not prorated:
            prorated = _prorated_base_hours(slip["base_salary"], hrs)
        bonus = float(slip.get("bonus") or 0)
        penalties = float(slip.get("penalties") or 0)
        deductions = float(slip.get("deductions") or 0)
        net = float(slip.get("net_amount") or _slip_net(prorated, bonus, penalties, deductions))
        std_days = int(slip.get("standard_days") or PAYROLL_WORKING_DAYS)
        std_hours = float(slip.get("standard_hours") or PAYROLL_STANDARD_MONTH_HOURS)
        return {
            "slip_id": slip["id"],
            "period_month": pm,
            "period_start": start,
            "period_end": end,
            "status": slip["status"],
            "paid_at": slip.get("paid_at"),
            "notes": slip.get("notes"),
            "employee": {
                "id": slip["employee_id"],
                "name": slip["employee_name"],
                "role": slip.get("employee_role"),
                "phone": slip.get("employee_phone"),
                "national_id": slip.get("employee_national_id"),
                "hire_date": str(slip["employee_hire_date"]) if slip.get("employee_hire_date") else None,
                "branch_name_en": slip.get("branch_name_en"),
                "branch_name_ar": slip.get("branch_name_ar"),
            },
            "attendance": {
                "standard_days": std_days,
                "standard_hours": std_hours,
                "days_worked": int(slip.get("days_worked") if slip.get("days_worked") is not None else stats["days_worked"]),
                "hours_worked": float(hrs or 0),
                "absent_days": int(slip.get("absent_days") if slip.get("absent_days") is not None else stats["absent_days"]),
                "leave_days": int(slip.get("leave_days") if slip.get("leave_days") is not None else stats["leave_days"]),
            },
            "earnings": {
                "base_salary": float(slip["base_salary"] or 0),
                "prorated_base": prorated,
                "bonus": bonus,
            },
            "deductions_detail": {
                "penalties": penalties,
                "other_deductions": deductions,
                "total_deductions": round(penalties + deductions, 2),
            },
            "net_amount": net,
        }
    finally:
        cur.close(); conn.close()


@router.post("/payroll/{slip_id}/mark-paid")
def mark_paid(slip_id: int, current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            UPDATE salary_slips SET status='paid', paid_at=now()
            WHERE id=%s AND status='draft' RETURNING *
        """, [slip_id])
        row = cur.fetchone()
        if not row: raise HTTPException(400, "Slip not found or already paid")
        conn.commit(); return dict(row)
    finally:
        cur.close(); conn.close()


@router.delete("/payroll/{slip_id}")
def delete_slip(slip_id: int, current_user=Depends(get_current_user)):
    _require_hr_tab(current_user, "payroll")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM salary_slips WHERE id=%s AND status='draft'", [slip_id])
        if cur.rowcount == 0:
            raise HTTPException(400, "Cannot delete a paid slip or slip not found")
        conn.commit(); return {"ok": True}
    finally:
        cur.close(); conn.close()


# ─── Sales performance (top sellers) ───────────────────────────────────────
@router.get("/performance")
def sales_performance(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Aggregate sales by seller (user) for a date range. Returns invoice
    count, items sold, gross revenue, average ticket and rank. Joins users
    so we can show the cashier's display name in either language."""
    _require_hr_tab(current_user, "performance")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        where = ["i.status = 'completed'", "i.seller_id IS NOT NULL"]
        params: list = []
        if date_from:
            where.append("i.created_at::date >= %s"); params.append(date_from)
        if date_to:
            where.append("i.created_at::date <= %s"); params.append(date_to)
        cur.execute(
            f"""WITH scoped AS (
                  SELECT i.id, i.seller_id, i.net_total
                  FROM invoices i
                  WHERE {' AND '.join(where)}
                )
                SELECT
                  s.seller_id,
                  u.username,
                  u.name_en AS seller_name_en,
                  u.name_ar AS seller_name_ar,
                  u.role    AS seller_role,
                  COUNT(s.id)::int                       AS invoices,
                  COALESCE(SUM(s.net_total),0)::float    AS revenue,
                  COALESCE(AVG(s.net_total),0)::float    AS avg_ticket,
                  COALESCE(SUM(ii.qty),0)::int           AS items_sold
                FROM scoped s
                LEFT JOIN users u ON u.id = s.seller_id
                LEFT JOIN (
                  SELECT invoice_id, SUM(quantity) AS qty
                  FROM invoice_items GROUP BY invoice_id
                ) ii ON ii.invoice_id = s.id
                GROUP BY s.seller_id, u.username, u.name_en, u.name_ar, u.role
                ORDER BY revenue DESC, invoices DESC, s.seller_id ASC""",
            params,
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.execute(
            f"""SELECT i.seller_id,
                       COALESCE(NULLIF(i.type, ''), 'cash') AS sale_type,
                       COALESCE(SUM(i.net_total), 0)::float AS revenue
                FROM invoices i
                WHERE {' AND '.join(where)}
                GROUP BY i.seller_id, COALESCE(NULLIF(i.type, ''), 'cash')""",
            params,
        )
        by_seller: dict = {}
        totals_by_type: dict = {}
        for r in cur.fetchall():
            by_seller.setdefault(r["seller_id"], {})[r["sale_type"]] = r["revenue"]
            totals_by_type[r["sale_type"]] = totals_by_type.get(r["sale_type"], 0.0) + r["revenue"]
        for r in rows:
            r["by_type"] = by_seller.get(r["seller_id"], {})
        totals = {
            "invoices": sum(r["invoices"] for r in rows),
            "revenue": sum(r["revenue"] for r in rows),
            "items_sold": sum(r["items_sold"] for r in rows),
            "sellers": len(rows),
            "by_type": totals_by_type,
        }
        return {"rows": rows, "totals": totals}
    finally:
        cur.close(); conn.close()
