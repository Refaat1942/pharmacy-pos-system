"""HR & Payroll: employees, attendance, salary slips."""
from calendar import monthrange
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
import os
import hashlib
import secrets
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user, get_active_branch_id


def _generate_clock_code(eid: int, name: str) -> str:
    """Deterministic-ish, short, scanner-friendly employee code."""
    raw = f"{eid}|{name}|{secrets.token_hex(8)}"
    short = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:6].upper()
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
               COUNT(DISTINCT work_date) FILTER (
                 WHERE status = 'present' AND check_in IS NOT NULL AND check_out IS NULL)::int AS incomplete,
               COALESCE(SUM(
                 CASE
                   WHEN status <> 'present' THEN 0
                   -- Checked in but never checked out: no hours until HR completes the day
                   -- (it used to count as a full 8-hour day).
                   WHEN check_in IS NOT NULL AND check_out IS NULL AND hours IS NULL THEN 0
                   WHEN COALESCE(allowed, false)
                     THEN GREATEST(COALESCE(hours, %(std)s), %(std)s)
                   WHEN COALESCE(hours, %(std)s) < %(std)s
                        AND COALESCE(hours, %(std)s) >= %(std)s - %(allow)s
                     THEN %(std)s
                   ELSE COALESCE(hours, %(std)s)
                 END
               ), 0) AS hours
        FROM attendance
        WHERE employee_id = %(eid)s AND work_date BETWEEN %(d1)s AND %(d2)s
    """, {"std": STANDARD_HOURS_PER_DAY, "allow": float(hours_allowance or 0),
          "eid": employee_id, "d1": _period_bounds(period_month)[1], "d2": _period_bounds(period_month)[2]})
    row = cur.fetchone() or {}
    return {
        "days_worked": int(row.get("days") or 0),
        "absent_days": int(row.get("absent") or 0),
        "leave_days": int(row.get("leave_days") or 0),
        "hours_worked": float(row.get("hours") or 0),
        "incomplete_days": int(row.get("incomplete") or 0),
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
    # Punch made on an offline clock PC and uploaded later: when it really happened.
    offline_created_at: Optional[datetime] = None


PHARMACY_TZ = ZoneInfo(os.getenv("PHARMACY_TZ", "Africa/Cairo"))
# Scans closer together than this are the same punch (scanner double-read, nervous
# second scan) — never a 0-hour check-out.
DUPLICATE_SCAN = timedelta(minutes=2)
# An open check-in older than this is not closed by the next scan (forgotten
# check-out); the next scan starts a new day instead.
MAX_SHIFT = timedelta(hours=16)


def _pharmacy_now() -> datetime:
    """Local pharmacy time (naive), whatever timezone the server runs in."""
    return datetime.now(PHARMACY_TZ).replace(tzinfo=None, microsecond=0)


def _punch_time(body: "ClockIn") -> datetime:
    now = _pharmacy_now()
    ts = body.offline_created_at
    if not ts:
        return now
    if ts.tzinfo is not None:
        ts = ts.astimezone(PHARMACY_TZ).replace(tzinfo=None)
    # Offline punches are accepted for up to 2 days back, never in the future.
    return max(now - timedelta(days=2), min(ts.replace(microsecond=0), now))


def _find_employee(cur, raw: str):
    code = raw.upper()
    norm = _normalize_code(raw)
    # Exact (case-insensitive) match first, then a normalized match that ignores
    # hyphens/spaces a scanner may have dropped or altered.
    cur.execute("SELECT id, name, role, branch_id, active FROM employees WHERE UPPER(clock_code)=%s", [code])
    emp = cur.fetchone()
    if not emp and norm:
        cur.execute(f"SELECT id, name, role, branch_id, active FROM employees WHERE {_CLOCK_CODE_NORMALIZED_SQL}=%s",
                    [norm])
        emp = cur.fetchone()
    if emp:
        return emp
    # A user *login* card (USR-...) works too: it resolves to the linked employee,
    # creating and linking one for an active user who has none yet.
    cur.execute(
        """SELECT id, name_en, name_ar, role, branch_id, employee_id, COALESCE(status, 'active') AS status
           FROM users
           WHERE UPPER(card_code) = %s OR UPPER(REGEXP_REPLACE(card_code, '[^A-Za-z0-9]', '', 'g')) = %s
           LIMIT 1 FOR UPDATE""",
        [code, norm],
    )
    u = cur.fetchone()
    if not u:
        return None
    if u["employee_id"]:
        cur.execute("SELECT id, name, role, branch_id, active FROM employees WHERE id=%s", [u["employee_id"]])
        return cur.fetchone()
    if u["status"] != "active":
        return None
    emp_name = (u.get("name_en") or u.get("name_ar") or "Staff").strip()
    cur.execute(
        """INSERT INTO employees (name, role, branch_id, active, base_salary)
           VALUES (%s, %s, %s, TRUE, 0) RETURNING id, name, role, branch_id, active""",
        [emp_name, u.get("role") or None, u.get("branch_id")],
    )
    emp = cur.fetchone()
    cur.execute("UPDATE employees SET clock_code = %s WHERE id = %s", [_generate_clock_code(emp["id"], emp_name), emp["id"]])
    cur.execute("UPDATE users SET employee_id = %s WHERE id = %s", [emp["id"], u["id"]])
    return emp


@router.post("/clock")
def clock_punch(body: ClockIn, current_user=Depends(get_current_user),
                active_branch=Depends(get_active_branch_id)):
    """Toggle attendance for the employee owning `code`: first scan = check-in,
    next scan = check-out (also across midnight for night shifts). Any logged-in
    user of the employee's branch can run the shared clock PC.

    Errors carry a stable `code` so the clock screen can show them translated."""
    raw = (body.code or "").strip()
    if not raw:
        raise HTTPException(400, detail={"code": "code_required", "message": "Code required"})
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        emp = _find_employee(cur, raw)
        if not emp:
            conn.rollback()
            raise HTTPException(404, detail={"code": "unknown_code", "message": "Unknown employee code"})
        if not emp["active"]:
            raise HTTPException(400, detail={"code": "inactive", "message": "Employee is inactive"})
        if (current_user.get("role") != "admin" and active_branch is not None and emp["branch_id"] is not None
                and int(emp["branch_id"]) != int(active_branch)):
            raise HTTPException(403, detail={"code": "other_branch", "message": "Employee belongs to another branch"})

        at = _punch_time(body)
        today, now_t = at.date(), at.time()
        actor_id = current_user.get("user_id")
        # Lock this employee's recent rows so two scans at the same moment queue up.
        cur.execute("SELECT id FROM employees WHERE id=%s FOR UPDATE", [emp["id"]])
        cur.execute(
            """SELECT * FROM attendance WHERE employee_id=%s AND work_date BETWEEN %s AND %s
               ORDER BY work_date DESC""",
            [emp["id"], today - timedelta(days=1), today],
        )
        rows = [dict(r) for r in cur.fetchall()]
        last_punch = max((r["punched_at"] for r in rows if r.get("punched_at")), default=None)
        if last_punch and abs(at - last_punch) < DUPLICATE_SCAN:
            conn.rollback()
            last = rows[0]
            return {
                "action": "duplicate",
                "employee": {"id": emp["id"], "name": emp["name"], "role": emp["role"]},
                "attendance": last, "time": last_punch.strftime("%H:%M"),
            }

        # An open check-in from today, or from yesterday's night shift, is closed by this scan.
        open_row = next((r for r in rows if r["check_in"] is not None and r["check_out"] is None
                         and timedelta(0) <= at - datetime.combine(r["work_date"], r["check_in"]) <= MAX_SHIFT), None)
        today_row = next((r for r in rows if r["work_date"] == today), None)
        if open_row:
            started = datetime.combine(open_row["work_date"], open_row["check_in"])
            hours = round((at - started).total_seconds() / 3600, 2)
            cur.execute(
                """UPDATE attendance SET check_out=%s, hours=%s, punched_by_user_id=%s, punched_at=%s
                   WHERE id=%s RETURNING *""",
                [now_t, hours, actor_id, at, open_row["id"]],
            )
            row, action = dict(cur.fetchone()), "check_out"
        elif today_row and today_row["check_in"] is not None:
            # Already checked out today: the latest scan is the real leaving time.
            started = datetime.combine(today_row["work_date"], today_row["check_in"])
            hours = round(max(0.0, (at - started).total_seconds() / 3600), 2)
            cur.execute(
                """UPDATE attendance SET check_out=%s, hours=%s, punched_by_user_id=%s, punched_at=%s
                   WHERE id=%s RETURNING *""",
                [now_t, hours, actor_id, at, today_row["id"]],
            )
            row, action = dict(cur.fetchone()), "check_out_updated"
        else:
            cur.execute(
                """INSERT INTO attendance (employee_id, work_date, check_in, status, punched_by_user_id, punched_at)
                   VALUES (%s, %s, %s, 'present', %s, %s)
                   ON CONFLICT (employee_id, work_date) DO UPDATE
                     SET check_in=EXCLUDED.check_in, status='present', check_out=NULL, hours=NULL,
                         punched_by_user_id=EXCLUDED.punched_by_user_id, punched_at=EXCLUDED.punched_at
                   RETURNING *""",
                [emp["id"], today, now_t, actor_id, at],
            )
            row, action = dict(cur.fetchone()), "check_in"
        conn.commit()
        return {
            "action": action,
            "employee": {"id": emp["id"], "name": emp["name"], "role": emp["role"]},
            "attendance": row,
            "time": now_t.strftime("%H:%M"),
            "hours": float(row["hours"]) if row.get("hours") is not None else None,
        }
    finally:
        cur.close(); conn.close()


@router.post("/employees/{eid}/regenerate-code")
def regenerate_clock_code(eid: int, current_user=Depends(get_current_user)):
    """Lost or copied card: issue a new random code; the old card stops working."""
    _require_manage_employees(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, name FROM employees WHERE id=%s", [eid])
        emp = cur.fetchone()
        if not emp:
            raise HTTPException(404, "Employee not found")
        cur.execute("UPDATE employees SET clock_code=%s WHERE id=%s RETURNING id, name, clock_code",
                    [_generate_clock_code(eid, emp["name"]), eid])
        row = dict(cur.fetchone())
        conn.commit()
        return row
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
        sql, params = "SELECT id, name FROM employees WHERE active = TRUE", []
        if current_user.get("role") != "admin":
            sql += " AND (branch_id IS NULL OR branch_id = %s)"; params.append(current_user.get("branch_id"))
        cur.execute(sql + " ORDER BY name", params)
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
        if current_user.get("role") != "admin":
            # Branch staff see their own branch's attendance only.
            where.append("(e.branch_id IS NULL OR e.branch_id = %s)"); params.append(current_user.get("branch_id"))
        cur.execute(f"""
            SELECT a.*, e.name AS employee_name, e.branch_id,
                   (a.status = 'present' AND a.check_in IS NOT NULL AND a.check_out IS NULL) AS incomplete
            FROM attendance a JOIN employees e ON e.id = a.employee_id
            WHERE {' AND '.join(where)}
            ORDER BY a.work_date DESC, e.name LIMIT 3000
        """, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.get("/attendance/monthly-sheet")
def attendance_monthly_sheet(month: str, current_user=Depends(get_current_user)):
    """Excel: one row per employee, one column per day (in–out, absent, leave, no
    check-out), with days / hours / incomplete totals. Branch staff get their branch."""
    _require_hr_tab(current_user, "attendance")
    try:
        _, d1, d2 = _period_bounds(month)
    except ValueError:
        raise HTTPException(400, "month must be YYYY-MM")
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from fastapi.responses import StreamingResponse

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        sql, params = "SELECT id, name, role FROM employees WHERE active = TRUE", []
        if current_user.get("role") != "admin":
            sql += " AND (branch_id IS NULL OR branch_id = %s)"; params.append(current_user.get("branch_id"))
        cur.execute(sql + " ORDER BY name", params)
        emps = cur.fetchall()
        cur.execute("""SELECT employee_id, work_date, check_in, check_out, hours, status FROM attendance
                       WHERE work_date BETWEEN %s AND %s AND employee_id = ANY(%s)""",
                    [d1, d2, [e["id"] for e in emps] or [0]])
        att = {(r["employee_id"], r["work_date"].day): r for r in cur.fetchall()}
    finally:
        cur.close(); conn.close()

    year, mon = map(int, month.split("-"))
    ndays = monthrange(year, mon)[1]
    ar_days = ["اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت", "أحد"]
    wb = Workbook(); ws = wb.active; ws.title = month; ws.sheet_view.rightToLeft = True
    head = ["الموظف", "الوظيفة"] + [f"{d}\n{ar_days[date(year, mon, d).weekday()]}" for d in range(1, ndays + 1)] \
        + ["أيام الحضور", "الساعات", "غياب", "إجازة", "بدون انصراف"]
    ws.append(head)
    fills = {"absent": PatternFill("solid", fgColor="FDE2E2"), "leave": PatternFill("solid", fgColor="E0E7FF"),
             "open": PatternFill("solid", fgColor="FEF3C7"), "friday": PatternFill("solid", fgColor="F1F5F9")}
    for e in emps:
        row = [e["name"], e["role"] or ""]
        present = absent = leave = incomplete = 0
        hours = 0.0
        for d in range(1, ndays + 1):
            r = att.get((e["id"], d))
            if not r:
                row.append(""); continue
            if r["status"] == "absent":
                row.append("غ"); absent += 1; continue
            if r["status"] == "leave":
                row.append("إجازة"); leave += 1; continue
            present += 1
            ci = r["check_in"].strftime("%H:%M") if r["check_in"] else ""
            co = r["check_out"].strftime("%H:%M") if r["check_out"] else ""
            if r["check_in"] and not r["check_out"]:
                incomplete += 1
                row.append(f"{ci} ← ؟"); continue
            hours += float(r["hours"] if r["hours"] is not None else STANDARD_HOURS_PER_DAY)
            row.append(f"{ci}–{co}" if ci else "حاضر")
        row += [present, round(hours, 2), absent, leave, incomplete]
        ws.append(row)
    for c in range(1, len(head) + 1):
        cell = ws.cell(row=1, column=c)
        cell.font = Font(bold=True); cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(c)].width = 22 if c == 1 else 12 if c == 2 else 11
    ws.row_dimensions[1].height = 32
    for d in range(1, ndays + 1):
        col = 2 + d
        friday = date(year, mon, d).weekday() == 4
        for r in range(2, ws.max_row + 1):
            cell = ws.cell(row=r, column=col)
            cell.alignment = Alignment(horizontal="center")
            v = str(cell.value or "")
            fill = fills["absent"] if v == "غ" else fills["leave"] if v == "إجازة" else fills["open"] if "؟" in v \
                else fills["friday"] if friday else None
            if fill:
                cell.fill = fill
    ws.freeze_panes = "C2"
    buf = BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="attendance-{month}.xlsx"'})


@router.post("/attendance")
def upsert_attendance(body: AttendanceIn, current_user=Depends(get_current_user)):
    _require_record_attendance(current_user)
    hours = _calc_hours(body.check_in, body.check_out)
    if hours is not None and hours >= 15:
        # e.g. in 17:00 / out 09:00 typed by mistake would silently become 16 h.
        raise HTTPException(400, "Check-out looks earlier than check-in — please check the times")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if current_user.get('role') != 'admin':
            cur.execute("SELECT branch_id FROM employees WHERE id=%s", [body.employee_id])
            e = cur.fetchone()
            if not e or (e["branch_id"] is not None and e["branch_id"] != current_user.get("branch_id")):
                raise HTTPException(403, "Employee belongs to another branch")
        if current_user.get('role') == 'admin':
            allowed_val = body.allowed
        else:
            cur.execute("SELECT allowed FROM attendance WHERE employee_id=%s AND work_date=%s",
                        [body.employee_id, body.work_date])
            ex = cur.fetchone()
            allowed_val = bool(ex['allowed']) if ex and ex['allowed'] is not None else False
        cur.execute("""
            INSERT INTO attendance(employee_id, work_date, check_in, check_out, hours, status, notes, allowed,
                                   edited_by, edited_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
            ON CONFLICT (employee_id, work_date) DO UPDATE SET
              check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out,
              hours=EXCLUDED.hours, status=EXCLUDED.status, notes=EXCLUDED.notes,
              allowed=EXCLUDED.allowed, edited_by=EXCLUDED.edited_by, edited_at=now(),
              -- keep what the clock recorded before the first manual change
              clock_check_in=COALESCE(attendance.clock_check_in, attendance.check_in),
              clock_check_out=COALESCE(attendance.clock_check_out, attendance.check_out)
            RETURNING *
        """, [body.employee_id, body.work_date, body.check_in, body.check_out,
              hours, body.status, body.notes, allowed_val, current_user.get("user_id")])
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
        cur.execute("SELECT id, name, base_salary, COALESCE(hours_allowance, 0) AS hours_allowance FROM employees WHERE active=true")
        emps = cur.fetchall()
        created = 0
        incomplete = []
        for e in emps:
            stats = _attendance_payroll_stats(cur, e['id'], period_month, float(e['hours_allowance'] or 0))
            if stats['incomplete_days']:
                incomplete.append({"employee": e['name'], "days": stats['incomplete_days']})
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
        # Days with a check-in but no check-out are paid 0 h until HR completes them.
        return {"created": created, "total_employees": len(emps), "period_month": period_month,
                "incomplete": incomplete}
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
