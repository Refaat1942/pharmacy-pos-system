"""Inventory & Stock module — items, manual adjustments, movement ledger."""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import date
import io
import psycopg2.extras
from db import get_db_connection
from deps import get_current_user, get_active_branch_id

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def _assert_branch_access(user, product_branch_id):
    """Non-admin users may only act on products in their own branch."""
    if user.get("role") == "admin":
        return
    user_branch = user.get("branch_id")
    if product_branch_id is not None and user_branch is not None and product_branch_id != user_branch:
        raise HTTPException(status_code=403, detail="Cross-branch access denied")


def log_movement(cur, product_id: int, branch_id, movement_type: str,
                 quantity: int, balance_after: int,
                 reference_type: Optional[str] = None,
                 reference_id: Optional[int] = None,
                 reason: Optional[str] = None,
                 user_id: Optional[int] = None):
    """Insert a stock movement row. Caller manages transaction."""
    cur.execute(
        """INSERT INTO stock_movements
           (product_id, branch_id, movement_type, quantity, balance_after,
            reference_type, reference_id, reason, user_id)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (product_id, branch_id, movement_type, quantity, balance_after,
         reference_type, reference_id, reason, user_id),
    )


# ─── PRODUCT CRUD (extends /api/products) ─────────────────────────────────

class ProductUpdate(BaseModel):
    barcode: Optional[str] = None
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    min_stock: Optional[int] = None
    expiry_date: Optional[date] = None
    active: Optional[bool] = None




ALLOWED_UPDATE_FIELDS = {"barcode", "name_ar", "name_en", "category", "unit",
                         "price", "cost", "min_stock", "expiry_date", "active"}


@router.put("/products/{product_id}")
def update_product(product_id: int, req: ProductUpdate,
                   current_user=Depends(get_current_user)):
    fields = {k: v for k, v in req.model_dump(exclude_unset=True).items()
              if k in ALLOWED_UPDATE_FIELDS}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT branch_id FROM products WHERE id=%s", (product_id,))
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Product not found")
        _assert_branch_access(current_user, existing["branch_id"])
        sets = ", ".join(f"{k}=%s" for k in fields.keys())
        values = list(fields.values()) + [product_id]
        cur.execute(f"UPDATE products SET {sets} WHERE id=%s RETURNING *", values)
        product = cur.fetchone()
        conn.commit()
        return dict(product)
    finally:
        conn.close()


@router.delete("/products/{product_id}")
def delete_product(product_id: int,
                   current_user=Depends(get_current_user)):
    """Soft delete — sets active=false."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT branch_id FROM products WHERE id=%s", (product_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Product not found")
        _assert_branch_access(current_user, row["branch_id"])
        cur.execute("UPDATE products SET active=false WHERE id=%s", (product_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ─── LIST WITH FILTERS ─────────────────────────────────────────────────────

@router.get("/items")
def list_items(q: str = "", branch_id: Optional[int] = None,
               stock_filter: Optional[str] = None,
               category: Optional[str] = None,
               include_inactive: bool = False,
               current_user=Depends(get_current_user),
               active_branch=Depends(get_active_branch_id)):
    """stock_filter: 'low' | 'zero' | 'ok'"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    where = []
    params = []
    if not include_inactive:
        where.append("p.active = true")
    if q:
        where.append("(p.name_ar ILIKE %s OR p.name_en ILIKE %s OR p.barcode ILIKE %s)")
        s = f"%{q}%"
        params += [s, s, s]
    if branch_id is not None and current_user.get("role") != "admin":
        if branch_id != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Cross-branch access denied")
    effective_branch = branch_id if branch_id is not None else active_branch
    if effective_branch is not None:
        where.append("p.branch_id = %s")
        params.append(effective_branch)
    if category:
        where.append("p.category = %s")
        params.append(category)
    if stock_filter == "low":
        where.append("p.stock > 0 AND p.stock <= p.min_stock")
    elif stock_filter == "zero":
        where.append("p.stock <= 0")
    elif stock_filter == "ok":
        where.append("p.stock > p.min_stock")

    sql = (
        "SELECT p.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar "
        "FROM products p LEFT JOIN branches b ON p.branch_id = b.id"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY p.name_en LIMIT 500"
    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/items/across-branches")
def search_across_branches(q: str,
                           current_user=Depends(get_current_user)):
    """Search by name/barcode across ALL branches — shows per-branch stock."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    s = f"%{q}%"
    cur.execute(
        """SELECT p.id, p.barcode, p.name_ar, p.name_en, p.unit, p.price,
                  p.stock, p.min_stock, p.branch_id,
                  b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
           FROM products p LEFT JOIN branches b ON p.branch_id = b.id
           WHERE p.active = true
             AND (p.name_ar ILIKE %s OR p.name_en ILIKE %s OR p.barcode ILIKE %s)
           ORDER BY p.name_en, b.name_en LIMIT 200""",
        (s, s, s),
    )
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── CATEGORIES ─────────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY category"
    )
    rows = [r[0] for r in cur.fetchall()]
    conn.close()
    return rows


# ─── BRANCHES ───────────────────────────────────────────────────────────────

@router.get("/branches")
def list_branches(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM branches ORDER BY name_en")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── MANUAL STOCK ADJUSTMENT ────────────────────────────────────────────────

class AdjustmentRequest(BaseModel):
    product_id: int
    delta: int  # positive or negative
    reason: str


@router.post("/adjustments")
def create_adjustment(req: AdjustmentRequest,
                      current_user=Depends(get_current_user)):
    if req.delta == 0:
        raise HTTPException(status_code=400, detail="Delta cannot be zero")
    if not req.reason or not req.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, stock, branch_id FROM products WHERE id=%s FOR UPDATE",
                    (req.product_id,))
        product = cur.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        _assert_branch_access(current_user, product["branch_id"])
        new_stock = int(product["stock"]) + req.delta
        if new_stock < 0:
            raise HTTPException(status_code=400, detail="Adjustment would result in negative stock")
        cur.execute("UPDATE products SET stock=%s WHERE id=%s",
                    (new_stock, req.product_id))
        log_movement(
            cur, req.product_id, product["branch_id"], "adjustment",
            req.delta, new_stock,
            reference_type="adjustment", reason=req.reason,
            user_id=current_user.get("user_id"),
        )
        conn.commit()
        return {"ok": True, "new_stock": new_stock}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─── STOCK MOVEMENT REPORT ─────────────────────────────────────────────────

@router.get("/movements")
def list_movements(product_id: Optional[int] = None,
                   branch_id: Optional[int] = None,
                   movement_type: Optional[str] = None,
                   start_date: Optional[date] = None,
                   end_date: Optional[date] = None,
                   limit: int = 200,
                   current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    where = []
    params = []
    if product_id:
        where.append("m.product_id = %s"); params.append(product_id)
    if branch_id:
        where.append("m.branch_id = %s"); params.append(branch_id)
    if movement_type:
        where.append("m.movement_type = %s"); params.append(movement_type)
    if start_date:
        where.append("DATE(m.created_at) >= %s"); params.append(start_date)
    if end_date:
        where.append("DATE(m.created_at) <= %s"); params.append(end_date)

    sql = (
        """SELECT m.*, p.name_ar AS product_name_ar, p.name_en AS product_name_en,
                  p.barcode, u.name_en AS user_name_en, u.name_ar AS user_name_ar,
                  b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
           FROM stock_movements m
           LEFT JOIN products p ON m.product_id = p.id
           LEFT JOIN users u ON m.user_id = u.id
           LEFT JOIN branches b ON m.branch_id = b.id"""
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY m.created_at DESC LIMIT %s"
    params.append(limit)
    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── FAST / SLOW / DEAD CLASSIFICATION ─────────────────────────────────────

@router.get("/velocity")
def velocity_classification(days: int = 90,
                            current_user=Depends(get_current_user)):
    """
    Classify items by sales velocity over the last N days.
    - fast:  >= 10 units sold
    - slow:  1-9 units sold
    - dead:  0 units sold
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT p.id, p.name_ar, p.name_en, p.barcode, p.stock, p.unit, p.price,
                  COALESCE(SUM(ii.quantity) FILTER (
                      WHERE i.created_at >= NOW() - INTERVAL '%s days'
                  ), 0) AS sold_qty
           FROM products p
           LEFT JOIN invoice_items ii ON ii.product_id = p.id
           LEFT JOIN invoices i ON ii.invoice_id = i.id AND i.status='completed'
           WHERE p.active = true
           GROUP BY p.id
           ORDER BY sold_qty DESC""" % days
    )
    rows = cur.fetchall()
    conn.close()
    result = []
    for r in rows:
        sold = int(r["sold_qty"] or 0)
        if sold >= 10:
            cls = "fast"
        elif sold >= 1:
            cls = "slow"
        else:
            cls = "dead"
        item = dict(r)
        item["sold_qty"] = sold
        item["classification"] = cls
        result.append(item)
    return result


# ─── CONSUMPTION-BASED MIN STOCK SUGGESTION ────────────────────────────────

@router.get("/bulk-template")
def bulk_template(current_user=Depends(get_current_user)):
    """Download a blank Excel template for bulk item upload."""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Items"
    headers = ["barcode", "name_en", "name_ar", "category", "unit",
               "price", "cost", "stock", "min_stock"]
    ws.append(headers)
    ws.append(["1234567890123", "Panadol Extra 500mg", "بانادول إكسترا 500مج",
               "Painkillers", "box", 35.50, 22.00, 100, 10])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="items_template.xlsx"'},
    )


@router.post("/bulk-upload")
async def bulk_upload(file: UploadFile = File(...),
                      current_user=Depends(get_current_user)):
    """Bulk import items from Excel/CSV. Existing barcodes are updated."""
    from openpyxl import load_workbook
    content = await file.read()
    name = (file.filename or "").lower()

    rows = []
    if name.endswith(".csv"):
        import csv
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    else:
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
        headers = [str(c.value).strip().lower() if c.value else "" for c in ws[1]]
        for r in ws.iter_rows(min_row=2, values_only=True):
            if not any(r):
                continue
            row = {headers[i]: r[i] for i in range(min(len(headers), len(r)))}
            rows.append(row)

    inserted = updated = errors = 0
    error_details = []
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    branch_id = current_user.get("branch_id")
    user_id = current_user.get("user_id")

    for idx, r in enumerate(rows, start=2):
        cur.execute("SAVEPOINT row_sp")
        try:
            name_en = (r.get("name_en") or "").strip()
            name_ar = (r.get("name_ar") or "").strip()
            if not name_en or not name_ar:
                raise ValueError("name_en and name_ar are required")
            barcode = str(r.get("barcode") or "").strip() or None
            category = (r.get("category") or "").strip() or None
            unit = (r.get("unit") or "box").strip()
            price = float(r.get("price") or 0)
            cost = float(r.get("cost")) if r.get("cost") not in (None, "") else None
            stock = int(r.get("stock") or 0)
            min_stock = int(r.get("min_stock") or 5)

            existing = None
            if barcode:
                cur.execute("SELECT id, stock FROM products WHERE barcode=%s", (barcode,))
                existing = cur.fetchone()

            if existing:
                cur.execute(
                    """UPDATE products SET name_en=%s, name_ar=%s, category=%s, unit=%s,
                       price=%s, cost=%s, min_stock=%s, active=true WHERE id=%s""",
                    (name_en, name_ar, category, unit, price, cost, min_stock, existing["id"]),
                )
                if stock and stock != existing["stock"]:
                    delta = stock - int(existing["stock"])
                    cur.execute("UPDATE products SET stock=%s WHERE id=%s", (stock, existing["id"]))
                    log_movement(
                        cur, existing["id"], branch_id, "adjustment",
                        delta, stock,
                        reference_type="bulk_upload", reason="Bulk upload sync",
                        user_id=user_id,
                    )
                updated += 1
            else:
                cur.execute(
                    """INSERT INTO products (barcode, name_ar, name_en, category, unit,
                       price, cost, stock, min_stock, branch_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (barcode, name_ar, name_en, category, unit,
                     price, cost, stock, min_stock, branch_id),
                )
                new_id = cur.fetchone()["id"]
                if stock > 0:
                    log_movement(
                        cur, new_id, branch_id, "initial",
                        stock, stock,
                        reference_type="bulk_upload", reason="Bulk upload",
                        user_id=user_id,
                    )
                inserted += 1
            cur.execute("RELEASE SAVEPOINT row_sp")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT row_sp")
            errors += 1
            error_details.append(f"Row {idx}: {e}")

    conn.commit()
    conn.close()
    return {
        "inserted": inserted, "updated": updated, "errors": errors,
        "error_details": error_details[:50],
    }


@router.get("/consumption-alerts")
def consumption_alerts(days: int = 30,
                       coverage_days: int = 7,
                       current_user=Depends(get_current_user)):
    """
    Alert when current stock < (avg daily consumption × coverage_days).
    Based on last `days` days of sales.
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT p.id, p.name_ar, p.name_en, p.barcode, p.stock, p.min_stock,
                  COALESCE(s.sold, 0)::float / %s AS avg_daily
           FROM products p
           LEFT JOIN (
               SELECT ii.product_id, SUM(ii.quantity) AS sold
               FROM invoice_items ii
               JOIN invoices i ON ii.invoice_id = i.id
               WHERE i.status='completed'
                 AND i.created_at >= NOW() - (%s || ' days')::interval
               GROUP BY ii.product_id
           ) s ON s.product_id = p.id
           WHERE p.active = true""",
        (days, days),
    )
    rows = cur.fetchall()
    conn.close()
    alerts = []
    for r in rows:
        avg = float(r["avg_daily"] or 0)
        suggested_min = round(avg * coverage_days)
        if avg > 0 and int(r["stock"]) < suggested_min:
            d = dict(r)
            d["avg_daily"] = round(avg, 2)
            d["suggested_min"] = suggested_min
            d["days_remaining"] = round(int(r["stock"]) / avg, 1) if avg > 0 else None
            alerts.append(d)
    return alerts
