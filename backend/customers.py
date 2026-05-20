"""Customer accounts module — CRUD, payments, statements with running balance."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user

router = APIRouter(prefix="/api", tags=["customers"])


def _admin_only(user):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")


class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    region: Optional[str] = None
    address_details: Optional[str] = None
    tax_number: Optional[str] = None
    credit_limit: float = 0
    notes: Optional[str] = None
    active: bool = True
    branch_ids: Optional[list[int]] = None  # admin-only: which branches may sell on account


@router.get("/customers/v2")
def list_customers_v2(q: str = "", active_only: bool = True,
                     current_user=Depends(get_current_user)):
    """Extended customer list with balance, charged, paid, region."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    where = []
    params: list = []
    if active_only:
        where.append("c.active = true")
    if q:
        where.append("(c.name ILIKE %s OR c.phone ILIKE %s OR c.email ILIKE %s)")
        like = f"%{q}%"
        params += [like, like, like]
    # Non-admin: row-level branch-scope — only customers with at least one
    # invoice in the user's branch are visible; aggregates also branch-scoped.
    if current_user.get("role") != "admin":
        ub = current_user.get("branch_id")
        if ub is None:
            raise HTTPException(status_code=403, detail="No branch assigned")
        where.append("EXISTS (SELECT 1 FROM customer_branches cb WHERE cb.customer_id=c.id AND cb.branch_id=%s)")
        charged_sub = ("(SELECT COALESCE(SUM(net_total),0) FROM invoices "
                       "WHERE customer_id=c.id AND payment_method='account' "
                       "AND type!='return' AND branch_id=%s)")
        paid_sub = ("(SELECT COALESCE(SUM(cp.amount),0) FROM customer_payments cp "
                    "JOIN invoices i ON cp.invoice_id=i.id "
                    "WHERE cp.customer_id=c.id AND i.branch_id=%s)")
        params = [ub, ub] + params + [ub]
    else:
        charged_sub = ("(SELECT COALESCE(SUM(net_total),0) FROM invoices "
                       "WHERE customer_id=c.id AND payment_method='account' AND type!='return')")
        paid_sub = ("(SELECT COALESCE(SUM(amount),0) FROM customer_payments "
                    "WHERE customer_id=c.id)")
    sql = f"SELECT c.*, {charged_sub} AS total_charged, {paid_sub} AS total_paid FROM customers c"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY c.name ASC LIMIT 500"
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["balance"] = float(r["total_charged"]) - float(r["total_paid"])
    conn.close()
    return rows


@router.post("/customers/v2")
def create_customer_v2(req: CustomerIn, current_user=Depends(get_current_user)):
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """INSERT INTO customers
               (name, phone, email, region, address_details, tax_number,
                credit_limit, notes, active)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (req.name, req.phone, req.email, req.region, req.address_details,
             req.tax_number, req.credit_limit, req.notes, req.active),
        )
        row = cur.fetchone()
        if req.branch_ids:
            for bid in set(req.branch_ids):
                cur.execute(
                    "INSERT INTO customer_branches (customer_id, branch_id, authorized_by) "
                    "VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                    (row["id"], bid, current_user.get("user_id")),
                )
        conn.commit()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/customers/v2/{customer_id}")
def update_customer_v2(customer_id: int, req: CustomerIn,
                       current_user=Depends(get_current_user)):
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """UPDATE customers SET name=%s, phone=%s, email=%s, region=%s,
               address_details=%s, tax_number=%s, credit_limit=%s, notes=%s, active=%s
               WHERE id=%s RETURNING *""",
            (req.name, req.phone, req.email, req.region, req.address_details,
             req.tax_number, req.credit_limit, req.notes, req.active, customer_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        if req.branch_ids is not None:
            # Replace authorization set
            cur.execute("DELETE FROM customer_branches WHERE customer_id=%s", (customer_id,))
            for bid in set(req.branch_ids):
                cur.execute(
                    "INSERT INTO customer_branches (customer_id, branch_id, authorized_by) "
                    "VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                    (customer_id, bid, current_user.get("user_id")),
                )
        conn.commit()
        return dict(row)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/customers/v2/{customer_id}/branches")
def list_customer_branches(customer_id: int, current_user=Depends(get_current_user)):
    """Branches authorized to sell on account for this customer (admin only)."""
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT cb.branch_id, b.name_en, b.name_ar FROM customer_branches cb "
        "JOIN branches b ON b.id = cb.branch_id WHERE cb.customer_id=%s",
        (customer_id,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.delete("/customers/v2/{customer_id}")
def deactivate_customer(customer_id: int, current_user=Depends(get_current_user)):
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE customers SET active=false WHERE id=%s", (customer_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Customer not found")
        conn.commit()
        return {"ok": True}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


class CustPaymentIn(BaseModel):
    amount: float
    payment_method: Optional[str] = "cash"
    invoice_id: Optional[int] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


@router.post("/customers/v2/{customer_id}/payments")
def record_customer_payment(customer_id: int, req: CustPaymentIn,
                            current_user=Depends(get_current_user)):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id FROM customers WHERE id=%s", (customer_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Customer not found")
        if req.invoice_id:
            cur.execute(
                "SELECT id, branch_id FROM invoices WHERE id=%s AND customer_id=%s",
                (req.invoice_id, customer_id),
            )
            inv = cur.fetchone()
            if not inv:
                raise HTTPException(status_code=400, detail="Invoice does not belong to this customer")
            # Non-admin can only collect against their branch's invoices
            if current_user.get("role") != "admin":
                if inv["branch_id"] != current_user.get("branch_id"):
                    raise HTTPException(status_code=403, detail="Cannot collect against another branch's invoice")
        else:
            # Untied payment is admin-only (cannot attribute to any branch)
            _admin_only(current_user)
        cur.execute(
            """INSERT INTO customer_payments
               (customer_id, invoice_id, amount, payment_method, reference, notes, recorded_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (customer_id, req.invoice_id, req.amount, req.payment_method,
             req.reference, req.notes, current_user.get("user_id")),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/customers/v2/{customer_id}/statement")
def customer_statement(customer_id: int, current_user=Depends(get_current_user)):
    """Chronological ledger: account-sale debits + payment credits + running balance.
    Branch-scoped for non-admins."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # Branch-gate non-admins BEFORE returning any customer data
    if current_user.get("role") != "admin":
        ub = current_user.get("branch_id")
        if ub is None:
            conn.close()
            raise HTTPException(status_code=403, detail="No branch assigned")
        cur.execute(
            "SELECT 1 FROM customer_branches WHERE customer_id=%s AND branch_id=%s",
            (customer_id, ub),
        )
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Customer not found")
    cur.execute("SELECT * FROM customers WHERE id=%s", (customer_id,))
    cust = cur.fetchone()
    if not cust:
        conn.close()
        raise HTTPException(status_code=404, detail="Customer not found")
    if current_user.get("role") != "admin":
        ub = current_user.get("branch_id")
        cur.execute(
            """SELECT 'sale' AS kind, i.id AS ref_id, i.invoice_number AS reference,
                      i.created_at AS at, i.net_total AS debit, 0 AS credit, i.notes
               FROM invoices i
               WHERE i.customer_id=%s AND i.payment_method='account'
                     AND i.type!='return' AND i.branch_id=%s
               UNION ALL
               SELECT 'payment' AS kind, cp.id, cp.reference, cp.paid_at AS at,
                      0 AS debit, cp.amount AS credit, cp.notes
               FROM customer_payments cp
               JOIN invoices i ON cp.invoice_id = i.id
               WHERE cp.customer_id=%s AND i.branch_id=%s
               ORDER BY at ASC NULLS LAST""",
            (customer_id, ub, customer_id, ub),
        )
    else:
        cur.execute(
            """SELECT 'sale' AS kind, id AS ref_id, invoice_number AS reference,
                      created_at AS at, net_total AS debit, 0 AS credit, notes
               FROM invoices
               WHERE customer_id=%s AND payment_method='account' AND type!='return'
               UNION ALL
               SELECT 'payment' AS kind, id, reference, paid_at AS at,
                      0 AS debit, amount AS credit, notes
               FROM customer_payments
               WHERE customer_id=%s
               ORDER BY at ASC NULLS LAST""",
            (customer_id, customer_id),
        )
    txns = [dict(r) for r in cur.fetchall()]
    running = 0.0
    for t in txns:
        running += float(t["debit"] or 0) - float(t["credit"] or 0)
        t["balance"] = round(running, 2)
    conn.close()
    return {"customer": dict(cust), "transactions": txns, "balance": round(running, 2)}
