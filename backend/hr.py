"""HR & Payroll: employees, attendance, salary slips."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import date, datetime, time
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user

router = APIRouter(prefix="/api/hr", tags=["hr"])


def _require_admin(user):
    if user.get('role') != 'admin':
        raise HTTPException(403, "Admin only")


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


@router.get("/employees")
def list_employees(active_only: bool = False, current_user=Depends(get_current_user)):
    _require_admin(current_user)
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
    _require_admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO employees(name, role, branch_id, base_salary, hire_date,
                                  phone, national_id, notes, active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *
        """, [body.name, body.role, body.branch_id, body.base_salary, body.hire_date,
              body.phone, body.national_id, body.notes, body.active])
        row = dict(cur.fetchone()); conn.commit(); return row
    finally:
        cur.close(); conn.close()


@router.put("/employees/{eid}")
def update_employee(eid: int, body: EmployeeIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            UPDATE employees SET name=%s, role=%s, branch_id=%s, base_salary=%s,
              hire_date=%s, phone=%s, national_id=%s, notes=%s, active=%s
            WHERE id=%s RETURNING *
        """, [body.name, body.role, body.branch_id, body.base_salary, body.hire_date,
              body.phone, body.national_id, body.notes, body.active, eid])
        row = cur.fetchone()
        if not row: raise HTTPException(404, "Employee not found")
        conn.commit(); return dict(row)
    finally:
        cur.close(); conn.close()


@router.delete("/employees/{eid}")
def delete_employee(eid: int, current_user=Depends(get_current_user)):
    _require_admin(current_user)
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
    _require_admin(current_user)
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
    _require_admin(current_user)
    hours = _calc_hours(body.check_in, body.check_out)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO attendance(employee_id, work_date, check_in, check_out, hours, status, notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (employee_id, work_date) DO UPDATE SET
              check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out,
              hours=EXCLUDED.hours, status=EXCLUDED.status, notes=EXCLUDED.notes
            RETURNING *
        """, [body.employee_id, body.work_date, body.check_in, body.check_out,
              hours, body.status, body.notes])
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
    deductions: float = Field(0, ge=0)
    notes: Optional[str] = None


@router.get("/payroll")
def list_payroll(period_month: Optional[str] = None, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        where = ["1=1"]; params = []
        if period_month:
            where.append("s.period_month=%s"); params.append(period_month)
        cur.execute(f"""
            SELECT s.*, e.name AS employee_name, e.role AS employee_role
            FROM salary_slips s JOIN employees e ON e.id = s.employee_id
            WHERE {' AND '.join(where)}
            ORDER BY s.period_month DESC, e.name
        """, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.post("/payroll/generate")
def generate_payroll(period_month: str, current_user=Depends(get_current_user)):
    """Create draft slips for active employees for given YYYY-MM. Skips existing."""
    _require_admin(current_user)
    try:
        datetime.strptime(period_month, "%Y-%m")
    except ValueError:
        raise HTTPException(400, "period_month must be YYYY-MM")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, base_salary FROM employees WHERE active=true")
        emps = cur.fetchall()
        created = 0
        for e in emps:
            cur.execute("""
                SELECT COUNT(DISTINCT work_date)::int AS days
                FROM attendance
                WHERE employee_id=%s AND status='present'
                  AND TO_CHAR(work_date, 'YYYY-MM') = %s
            """, [e['id'], period_month])
            days = cur.fetchone()['days'] or 0
            cur.execute("""
                INSERT INTO salary_slips(employee_id, period_month, base_salary,
                                         bonus, deductions, days_worked, net_amount, status)
                VALUES (%s,%s,%s,0,0,%s,%s,'draft')
                ON CONFLICT (employee_id, period_month) DO NOTHING
            """, [e['id'], period_month, e['base_salary'], days, e['base_salary']])
            if cur.rowcount > 0: created += 1
        conn.commit()
        return {"created": created, "total_employees": len(emps), "period_month": period_month}
    finally:
        cur.close(); conn.close()


@router.put("/payroll/{slip_id}")
def update_slip(slip_id: int, body: SlipUpdateIn, current_user=Depends(get_current_user)):
    _require_admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM salary_slips WHERE id=%s", [slip_id])
        slip = cur.fetchone()
        if not slip: raise HTTPException(404, "Slip not found")
        if slip['status'] == 'paid':
            raise HTTPException(400, "Slip already paid")
        base = float(slip['base_salary'])
        net = base + body.bonus - body.deductions
        cur.execute("""
            UPDATE salary_slips SET bonus=%s, deductions=%s, net_amount=%s,
              notes=COALESCE(NULLIF(%s,''), notes)
            WHERE id=%s RETURNING *
        """, [body.bonus, body.deductions, net, body.notes, slip_id])
        conn.commit(); return dict(cur.fetchone())
    finally:
        cur.close(); conn.close()


@router.post("/payroll/{slip_id}/mark-paid")
def mark_paid(slip_id: int, current_user=Depends(get_current_user)):
    _require_admin(current_user)
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
    _require_admin(current_user)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM salary_slips WHERE id=%s AND status='draft'", [slip_id])
        if cur.rowcount == 0:
            raise HTTPException(400, "Cannot delete a paid slip or slip not found")
        conn.commit(); return {"ok": True}
    finally:
        cur.close(); conn.close()
