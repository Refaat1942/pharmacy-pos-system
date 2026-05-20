"""Purchasing & Suppliers module — suppliers, POs, supplier payments & statements."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user, get_active_branch_id
from inventory import log_movement

router = APIRouter(prefix="/api", tags=["purchasing"])


def _admin_only(user):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")


# ─── SUPPLIERS ──────────────────────────────────────────────────────────

class SupplierIn(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    tax_number: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


@router.get("/suppliers")
def list_suppliers(q: str = "", active_only: bool = True,
                   current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    where = []
    params: list = []
    if active_only:
        where.append("s.active = true")
    if q:
        where.append("(s.name ILIKE %s OR s.phone ILIKE %s OR s.contact_person ILIKE %s)")
        like = f"%{q}%"
        params += [like, like, like]
    # Aggregate totals: branch-scoped for non-admins so they can't see other branches' financials
    if current_user.get("role") != "admin":
        ub = current_user.get("branch_id")
        if ub is None:
            raise HTTPException(status_code=403, detail="No branch assigned")
        charged_sub = ("(SELECT COALESCE(SUM(total),0) FROM purchase_orders "
                       "WHERE supplier_id=s.id AND status='received' AND branch_id=%s)")
        # Payments tied to a PO in user's branch + payments not tied to any PO are hidden from non-admins
        paid_sub = ("(SELECT COALESCE(SUM(sp.amount),0) FROM supplier_payments sp "
                    "JOIN purchase_orders po ON sp.po_id=po.id "
                    "WHERE sp.supplier_id=s.id AND po.branch_id=%s)")
        select_aggs = f"{charged_sub} AS total_charged, {paid_sub} AS total_paid"
        sql = f"SELECT s.*, {select_aggs} FROM suppliers s"
        # Prepend two branch params before any q params
        params = [ub, ub] + params
    else:
        sql = """SELECT s.*,
                        COALESCE((SELECT SUM(total) FROM purchase_orders
                                  WHERE supplier_id=s.id AND status='received'), 0) AS total_charged,
                        COALESCE((SELECT SUM(amount) FROM supplier_payments
                                  WHERE supplier_id=s.id), 0) AS total_paid
                 FROM suppliers s"""
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY s.name ASC LIMIT 500"
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        r["balance"] = float(r["total_charged"]) - float(r["total_paid"])
    conn.close()
    return rows


@router.post("/suppliers")
def create_supplier(req: SupplierIn, current_user=Depends(get_current_user)):
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """INSERT INTO suppliers
               (name, contact_person, phone, email, address, tax_number, notes, active)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (req.name, req.contact_person, req.phone, req.email, req.address,
             req.tax_number, req.notes, req.active),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/suppliers/{supplier_id}")
def update_supplier(supplier_id: int, req: SupplierIn,
                    current_user=Depends(get_current_user)):
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """UPDATE suppliers SET name=%s, contact_person=%s, phone=%s, email=%s,
               address=%s, tax_number=%s, notes=%s, active=%s WHERE id=%s RETURNING *""",
            (req.name, req.contact_person, req.phone, req.email, req.address,
             req.tax_number, req.notes, req.active, supplier_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Supplier not found")
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


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, current_user=Depends(get_current_user)):
    _admin_only(current_user)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE suppliers SET active=false WHERE id=%s", (supplier_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Supplier not found")
        conn.commit()
        return {"ok": True}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─── PURCHASE ORDERS ─────────────────────────────────────────────────────

class POItemIn(BaseModel):
    product_id: Optional[int] = None  # null = new product to be created on receive
    barcode: Optional[str] = None
    product_name_ar: Optional[str] = None
    product_name_en: Optional[str] = None
    quantity: int
    unit_cost: float
    expiry_date: Optional[date] = None


class POIn(BaseModel):
    supplier_id: int
    branch_id: int
    supplier_invoice_number: Optional[str] = None
    supplier_invoice_date: Optional[date] = None
    discount: float = 0
    tax: float = 0
    notes: Optional[str] = None
    items: List[POItemIn]


def _assert_po_branch_access(user, branch_id: int):
    if user.get("role") == "admin":
        return
    if user.get("branch_id") != branch_id:
        raise HTTPException(status_code=403, detail="Cannot manage POs for another branch")


@router.post("/purchase-orders")
def create_po(req: POIn, current_user=Depends(get_current_user)):
    if not req.items:
        raise HTTPException(status_code=400, detail="At least one item required")
    if req.discount < 0 or req.tax < 0:
        raise HTTPException(status_code=400, detail="Discount and tax cannot be negative")
    _assert_po_branch_access(current_user, req.branch_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id FROM suppliers WHERE id=%s AND active=true", (req.supplier_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Invalid supplier")
        cur.execute("SELECT id FROM branches WHERE id=%s", (req.branch_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Invalid branch")

        for it in req.items:
            if it.quantity <= 0:
                raise HTTPException(status_code=400, detail="Quantity must be positive")
            if it.unit_cost < 0:
                raise HTTPException(status_code=400, detail="Unit cost cannot be negative")
        subtotal = sum(i.quantity * i.unit_cost for i in req.items)
        total = subtotal - req.discount + req.tax
        if total < 0:
            raise HTTPException(status_code=400, detail="Discount cannot exceed subtotal + tax")

        cur.execute("SELECT nextval('purchase_order_seq') AS n")
        seq_n = cur.fetchone()["n"]
        po_number = f"PO-{date.today().strftime('%Y%m%d')}-{int(seq_n):04d}"

        cur.execute(
            """INSERT INTO purchase_orders
               (po_number, supplier_id, branch_id, status,
                supplier_invoice_number, supplier_invoice_date,
                subtotal, discount, tax, total, notes, created_by)
               VALUES (%s,%s,%s,'draft',%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (po_number, req.supplier_id, req.branch_id,
             req.supplier_invoice_number, req.supplier_invoice_date,
             subtotal, req.discount, req.tax, total, req.notes,
             current_user.get("user_id")),
        )
        po_id = cur.fetchone()["id"]

        for it in req.items:
            if it.quantity <= 0:
                raise HTTPException(status_code=400, detail="Quantity must be positive")
            if it.unit_cost < 0:
                raise HTTPException(status_code=400, detail="Unit cost cannot be negative")
            # Snapshot product names from product if product_id given
            pname_ar = it.product_name_ar
            pname_en = it.product_name_en
            barcode = it.barcode
            if it.product_id:
                cur.execute("SELECT name_ar, name_en, barcode FROM products WHERE id=%s",
                            (it.product_id,))
                p = cur.fetchone()
                if not p:
                    raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")
                pname_ar = pname_ar or p["name_ar"]
                pname_en = pname_en or p["name_en"]
                barcode = barcode or p["barcode"]
            if not pname_en:
                raise HTTPException(status_code=400, detail="Product name required")
            cur.execute(
                """INSERT INTO purchase_order_items
                   (po_id, product_id, barcode, product_name_ar, product_name_en,
                    quantity, unit_cost, expiry_date, total)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (po_id, it.product_id, barcode, pname_ar, pname_en,
                 it.quantity, it.unit_cost, it.expiry_date,
                 it.quantity * it.unit_cost),
            )
        conn.commit()
        return {"ok": True, "po_id": po_id, "po_number": po_number, "total": total}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/purchase-orders")
def list_pos(status: Optional[str] = None, supplier_id: Optional[int] = None,
             current_user=Depends(get_current_user),
             active_branch=Depends(get_active_branch_id)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    where = []
    params: list = []
    if status:
        where.append("po.status = %s")
        params.append(status)
    if supplier_id:
        where.append("po.supplier_id = %s")
        params.append(supplier_id)
    if current_user.get("role") != "admin":
        ub = current_user.get("branch_id")
        if ub is None:
            raise HTTPException(status_code=403, detail="No branch assigned")
        where.append("po.branch_id = %s")
        params.append(ub)
    elif active_branch is not None:
        where.append("po.branch_id = %s")
        params.append(active_branch)
    sql = """SELECT po.*, s.name AS supplier_name,
                    b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
             FROM purchase_orders po
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN branches b ON po.branch_id = b.id"""
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY po.created_at DESC LIMIT 200"
    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/purchase-orders/{po_id}")
def get_po(po_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT po.*, s.name AS supplier_name,
                  b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
           FROM purchase_orders po
           LEFT JOIN suppliers s ON po.supplier_id = s.id
           LEFT JOIN branches b ON po.branch_id = b.id
           WHERE po.id=%s""",
        (po_id,),
    )
    po = cur.fetchone()
    if not po:
        conn.close()
        raise HTTPException(status_code=404, detail="PO not found")
    if current_user.get("role") != "admin":
        if current_user.get("branch_id") != po["branch_id"]:
            conn.close()
            raise HTTPException(status_code=403, detail="Not accessible")
    cur.execute("SELECT * FROM purchase_order_items WHERE po_id=%s ORDER BY id", (po_id,))
    items = cur.fetchall()
    conn.close()
    out = dict(po)
    out["items"] = [dict(i) for i in items]
    return out


@router.post("/purchase-orders/{po_id}/receive")
def receive_po(po_id: int, current_user=Depends(get_current_user)):
    """Receive PO: add stock to branch, log purchase movements,
    update product cost + expiry_date when provided."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM purchase_orders WHERE id=%s FOR UPDATE", (po_id,))
        po = cur.fetchone()
        if not po:
            raise HTTPException(status_code=404, detail="PO not found")
        if po["status"] != "draft":
            raise HTTPException(status_code=400, detail=f"Cannot receive PO in status '{po['status']}'")
        _assert_po_branch_access(current_user, po["branch_id"])
        branch_id = po["branch_id"]

        cur.execute("SELECT * FROM purchase_order_items WHERE po_id=%s", (po_id,))
        items = cur.fetchall()
        for it in items:
            pid = it["product_id"]
            # Resolve / create destination product in this branch
            if pid:
                cur.execute("SELECT id, stock, branch_id FROM products WHERE id=%s FOR UPDATE", (pid,))
                p = cur.fetchone()
                if not p:
                    raise HTTPException(status_code=400, detail=f"Product id {pid} no longer exists")
                if p["branch_id"] != branch_id:
                    # try to find/create by barcode in this branch
                    pid = None
            if not pid and it["barcode"]:
                cur.execute(
                    "SELECT id, stock FROM products WHERE barcode=%s AND branch_id=%s FOR UPDATE",
                    (it["barcode"], branch_id),
                )
                p = cur.fetchone()
                if p:
                    pid = p["id"]
            if not pid:
                # Create new product (price = unit_cost as placeholder; user can edit later)
                cur.execute(
                    """INSERT INTO products
                       (barcode, name_ar, name_en, category, unit, price, cost,
                        stock, min_stock, expiry_date, branch_id, active)
                       VALUES (%s,%s,%s,'',' ',%s,%s,0,5,%s,%s,true)
                       ON CONFLICT (barcode, branch_id) DO NOTHING
                       RETURNING id, stock""",
                    (it["barcode"], it["product_name_ar"] or it["product_name_en"],
                     it["product_name_en"] or it["product_name_ar"],
                     it["unit_cost"], it["unit_cost"],
                     it["expiry_date"], branch_id),
                )
                p = cur.fetchone()
                if not p and it["barcode"]:
                    cur.execute(
                        "SELECT id, stock FROM products WHERE barcode=%s AND branch_id=%s FOR UPDATE",
                        (it["barcode"], branch_id),
                    )
                    p = cur.fetchone()
                if not p:
                    raise HTTPException(status_code=500, detail="Could not create/find destination product")
                pid = p["id"]

            cur.execute("SELECT stock FROM products WHERE id=%s FOR UPDATE", (pid,))
            cur_stock = int(cur.fetchone()["stock"])
            new_stock = cur_stock + int(it["quantity"])
            # Update stock, cost (latest), and expiry if provided
            if it["expiry_date"]:
                cur.execute(
                    "UPDATE products SET stock=%s, cost=%s, expiry_date=%s WHERE id=%s",
                    (new_stock, it["unit_cost"], it["expiry_date"], pid),
                )
            else:
                cur.execute(
                    "UPDATE products SET stock=%s, cost=%s WHERE id=%s",
                    (new_stock, it["unit_cost"], pid),
                )
            cur.execute("UPDATE purchase_order_items SET product_id=%s WHERE id=%s",
                        (pid, it["id"]))
            log_movement(
                cur, pid, branch_id, "purchase",
                int(it["quantity"]), new_stock,
                reference_type="po", reference_id=po_id,
                reason=f"PO {po['po_number']} received",
                user_id=current_user.get("user_id"),
            )

        cur.execute(
            """UPDATE purchase_orders
               SET status='received', received_by=%s, received_at=NOW()
               WHERE id=%s""",
            (current_user.get("user_id"), po_id),
        )
        conn.commit()
        return {"ok": True, "status": "received"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/purchase-orders/{po_id}/cancel")
def cancel_po(po_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM purchase_orders WHERE id=%s FOR UPDATE", (po_id,))
        po = cur.fetchone()
        if not po:
            raise HTTPException(status_code=404, detail="PO not found")
        if po["status"] != "draft":
            raise HTTPException(status_code=400, detail=f"Cannot cancel PO in status '{po['status']}'")
        _assert_po_branch_access(current_user, po["branch_id"])
        cur.execute(
            "UPDATE purchase_orders SET status='cancelled', cancelled_at=NOW() WHERE id=%s",
            (po_id,),
        )
        conn.commit()
        return {"ok": True, "status": "cancelled"}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─── SUPPLIER PAYMENTS & STATEMENT ────────────────────────────────────────

class PaymentIn(BaseModel):
    amount: float
    payment_method: Optional[str] = "cash"
    po_id: Optional[int] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


@router.post("/suppliers/{supplier_id}/payments")
def record_payment(supplier_id: int, req: PaymentIn,
                   current_user=Depends(get_current_user)):
    _admin_only(current_user)
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id FROM suppliers WHERE id=%s", (supplier_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Supplier not found")
        if req.po_id:
            cur.execute("SELECT id FROM purchase_orders WHERE id=%s AND supplier_id=%s",
                        (req.po_id, supplier_id))
            if not cur.fetchone():
                raise HTTPException(status_code=400, detail="PO does not belong to this supplier")
        cur.execute(
            """INSERT INTO supplier_payments
               (supplier_id, po_id, amount, payment_method, reference, notes, recorded_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (supplier_id, req.po_id, req.amount, req.payment_method,
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


@router.get("/suppliers/{supplier_id}/statement")
def supplier_statement(supplier_id: int,
                       current_user=Depends(get_current_user)):
    """Combined chronological ledger of PO charges and payments with running balance.

    Branch-scoped for non-admins: only rows tied to their branch are visible. Payments
    not tied to any PO are admin-only (cannot be branch-attributed).
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM suppliers WHERE id=%s", (supplier_id,))
    sup = cur.fetchone()
    if not sup:
        conn.close()
        raise HTTPException(status_code=404, detail="Supplier not found")
    if current_user.get("role") != "admin":
        ub = current_user.get("branch_id")
        if ub is None:
            conn.close()
            raise HTTPException(status_code=403, detail="No branch assigned")
        cur.execute(
            """SELECT 'po' AS kind, po.id AS ref_id, po.po_number AS reference,
                      po.received_at AS at, po.total AS debit, 0 AS credit, po.notes
               FROM purchase_orders po
               WHERE po.supplier_id=%s AND po.status='received' AND po.branch_id=%s
               UNION ALL
               SELECT 'payment' AS kind, sp.id, sp.reference, sp.paid_at AS at,
                      0 AS debit, sp.amount AS credit, sp.notes
               FROM supplier_payments sp
               JOIN purchase_orders po ON sp.po_id = po.id
               WHERE sp.supplier_id=%s AND po.branch_id=%s
               ORDER BY at ASC NULLS LAST""",
            (supplier_id, ub, supplier_id, ub),
        )
    else:
        cur.execute(
            """SELECT 'po' AS kind, id AS ref_id, po_number AS reference,
                      received_at AS at, total AS debit, 0 AS credit, notes
               FROM purchase_orders
               WHERE supplier_id=%s AND status='received'
               UNION ALL
               SELECT 'payment' AS kind, id, reference, paid_at AS at,
                      0 AS debit, amount AS credit, notes
               FROM supplier_payments
               WHERE supplier_id=%s
               ORDER BY at ASC NULLS LAST""",
            (supplier_id, supplier_id),
        )
    txns = [dict(r) for r in cur.fetchall()]
    running = 0.0
    for t in txns:
        running += float(t["debit"] or 0) - float(t["credit"] or 0)
        t["balance"] = round(running, 2)
    conn.close()
    return {
        "supplier": dict(sup),
        "transactions": txns,
        "balance": round(running, 2),
    }
