"""Supplier returns (مرتجع مشتريات) — send expired / damaged / surplus stock back.

A return takes the goods out of the chosen lots (FEFO when no expiry is given, so
expired lots go first), and credits the supplier: balance = charged − paid − returned.
Cancelling puts the same lots back.
"""
import json
from datetime import date
from typing import List, Optional

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import get_db_connection
from deps import get_current_user, require_user_feature
from inventory import log_movement
from pack_units import normalize_unit_type, unit_label, unit_multiple
from stock_batches import add_batch_stock, ensure_batches_migrated, sync_product_from_batches

router = APIRouter(prefix="/api/supplier-returns", tags=["supplier-returns"])

REASONS = ("expired", "near_expiry", "damaged", "surplus", "recall", "other")


class ReturnItemIn(BaseModel):
    product_id: int
    quantity: float
    unit_type: str = "pack"
    unit_cost: float                       # credit per returned unit (box/strip/tablet)
    expiry_date: Optional[date] = None     # take from this lot only; None = earliest first


class ReturnIn(BaseModel):
    supplier_id: int
    branch_id: int
    reason: str = "expired"
    notes: Optional[str] = None
    po_id: Optional[int] = None
    items: List[ReturnItemIn]


def _assert_branch(user, branch_id: int):
    if user.get("role") != "admin" and user.get("branch_id") != branch_id:
        raise HTTPException(status_code=403, detail="Cannot manage returns for another branch")


def _take_lots(cur, product_id: int, qty: int, expiry: Optional[date]) -> list:
    """Remove qty (smallest units) from positive lots; expired / earliest first.
    Returns [(expiry, qty)] so a cancel can restore the same lots."""
    ensure_batches_migrated(cur, product_id)
    if expiry is not None:
        cur.execute(
            """SELECT id, quantity, expiry_date FROM product_batches
               WHERE product_id=%s AND quantity > 0 AND expiry_date=%s
               ORDER BY id FOR UPDATE""",
            (product_id, expiry),
        )
    else:
        cur.execute(
            """SELECT id, quantity, expiry_date FROM product_batches
               WHERE product_id=%s AND quantity > 0
               ORDER BY COALESCE(expiry_date, DATE '9999-12-31'), id FOR UPDATE""",
            (product_id,),
        )
    lots = cur.fetchall()
    if sum(int(b["quantity"]) for b in lots) < qty:
        return []
    taken, remaining = [], qty
    for b in lots:
        if remaining <= 0:
            break
        take = min(remaining, int(b["quantity"]))
        left = int(b["quantity"]) - take
        if left:
            cur.execute("UPDATE product_batches SET quantity=%s, updated_at=NOW() WHERE id=%s", (left, b["id"]))
        else:
            cur.execute("DELETE FROM product_batches WHERE id=%s", (b["id"],))
        taken.append((b["expiry_date"], take))
        remaining -= take
    return taken


def _next_number(cur) -> str:
    cur.execute("SELECT nextval('supplier_return_seq') AS n")
    return f"SR-{int(cur.fetchone()['n']):06d}"


@router.post("")
def create_return(req: ReturnIn, current_user=Depends(get_current_user)):
    require_user_feature(current_user, "purchases")
    _assert_branch(current_user, req.branch_id)
    if not req.items:
        raise HTTPException(status_code=400, detail="At least one item required")
    reason = req.reason if req.reason in REASONS else "other"
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT id, name FROM suppliers WHERE id=%s", (req.supplier_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Invalid supplier")
        if req.po_id:
            cur.execute("SELECT supplier_id, branch_id FROM purchase_orders WHERE id=%s", (req.po_id,))
            po = cur.fetchone()
            if not po or po["supplier_id"] != req.supplier_id or po["branch_id"] != req.branch_id:
                raise HTTPException(status_code=400, detail="Purchase order does not match supplier / branch")

        number = _next_number(cur)
        cur.execute(
            """INSERT INTO supplier_returns (return_number, supplier_id, branch_id, po_id, reason, notes, created_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (number, req.supplier_id, req.branch_id, req.po_id, reason,
             (req.notes or "").strip() or None, current_user.get("user_id")),
        )
        rid = cur.fetchone()["id"]
        total = 0.0
        for it in req.items:
            if it.quantity <= 0:
                raise HTTPException(status_code=400, detail="Quantity must be positive")
            if it.unit_cost < 0:
                raise HTTPException(status_code=400, detail="Cost cannot be negative")
            cur.execute(
                """SELECT id, branch_id, name_ar, name_en, pack_size, unit, sub_unit, mid_unit, mid_size
                   FROM products WHERE id=%s FOR UPDATE""",
                (it.product_id,),
            )
            p = cur.fetchone()
            if not p or p["branch_id"] != req.branch_id:
                raise HTTPException(status_code=400, detail=f"Product {it.product_id} is not in this branch")
            ut = normalize_unit_type(it.unit_type, p)
            sub_qty = it.quantity * unit_multiple(p, ut)
            if abs(sub_qty - round(sub_qty)) > 1e-6:
                raise HTTPException(status_code=400, detail="Quantity must be whole in the smallest unit")
            sub_qty = int(round(sub_qty))
            name = p["name_ar"] or p["name_en"]
            lots = _take_lots(cur, p["id"], sub_qty, it.expiry_date)
            if not lots:
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough stock of '{name}'"
                    + (f" with expiry {it.expiry_date}" if it.expiry_date else "") + " to return",
                )
            new_stock = sync_product_from_batches(cur, p["id"])
            line_total = round(it.quantity * it.unit_cost, 2)
            total += line_total
            cur.execute(
                """INSERT INTO supplier_return_items
                   (return_id, product_id, product_name, quantity, unit_type, sub_quantity,
                    unit_cost, total, expiry_date, lots)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (rid, p["id"], name, it.quantity, ut, sub_qty, it.unit_cost, line_total,
                 it.expiry_date, json.dumps([[str(e) if e else None, q] for e, q in lots])),
            )
            log_movement(
                cur, p["id"], req.branch_id, "supplier_return", -sub_qty, new_stock,
                reference_type="supplier_return", reference_id=rid,
                reason=f"{number} ({it.quantity:g} {unit_label(p, ut)}) — {reason}",
                user_id=current_user.get("user_id"),
            )
        cur.execute("UPDATE supplier_returns SET total=%s WHERE id=%s", (round(total, 2), rid))
        conn.commit()
        return {"id": rid, "return_number": number, "total": round(total, 2)}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("")
def list_returns(supplier_id: Optional[int] = None, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    where, params = [], []
    if supplier_id:
        where.append("r.supplier_id=%s")
        params.append(supplier_id)
    if current_user.get("role") != "admin":
        where.append("r.branch_id=%s")
        params.append(current_user.get("branch_id"))
    cur.execute(
        f"""SELECT r.*, s.name AS supplier_name, b.name_ar AS branch_name_ar, b.name_en AS branch_name_en,
                   u.name_ar AS created_by_name, po.po_number,
                   (SELECT COUNT(*) FROM supplier_return_items i WHERE i.return_id=r.id) AS item_count
            FROM supplier_returns r
            JOIN suppliers s ON s.id=r.supplier_id
            LEFT JOIN branches b ON b.id=r.branch_id
            LEFT JOIN users u ON u.id=r.created_by
            LEFT JOIN purchase_orders po ON po.id=r.po_id
            {"WHERE " + " AND ".join(where) if where else ""}
            ORDER BY r.created_at DESC LIMIT 500""",
        params,
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.get("/{rid:int}")
def get_return(rid: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT r.*, s.name AS supplier_name, po.po_number FROM supplier_returns r
           JOIN suppliers s ON s.id=r.supplier_id
           LEFT JOIN purchase_orders po ON po.id=r.po_id WHERE r.id=%s""",
        (rid,),
    )
    r = cur.fetchone()
    if not r:
        conn.close()
        raise HTTPException(status_code=404, detail="Return not found")
    _assert_branch(current_user, r["branch_id"])
    cur.execute("SELECT * FROM supplier_return_items WHERE return_id=%s ORDER BY id", (rid,))
    items = [dict(i) for i in cur.fetchall()]
    conn.close()
    return {**dict(r), "items": items}


@router.post("/{rid:int}/cancel")
def cancel_return(rid: int, current_user=Depends(get_current_user)):
    """Undo a return made by mistake: the same lots go back on the shelf."""
    require_user_feature(current_user, "purchases")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM supplier_returns WHERE id=%s FOR UPDATE", (rid,))
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Return not found")
        _assert_branch(current_user, r["branch_id"])
        if r["status"] != "done":
            raise HTTPException(status_code=400, detail="Return is already cancelled")
        cur.execute("SELECT * FROM supplier_return_items WHERE return_id=%s ORDER BY id", (rid,))
        for it in cur.fetchall():
            cur.execute("SELECT id FROM products WHERE id=%s FOR UPDATE", (it["product_id"],))
            if not cur.fetchone():
                continue
            for exp, q in it["lots"] or []:
                add_batch_stock(cur, it["product_id"], r["branch_id"], int(q),
                                date.fromisoformat(exp) if exp else None)
            new_stock = sync_product_from_batches(cur, it["product_id"])
            log_movement(
                cur, it["product_id"], r["branch_id"], "supplier_return_cancel", int(it["sub_quantity"]), new_stock,
                reference_type="supplier_return", reference_id=rid,
                reason=f"{r['return_number']} cancelled", user_id=current_user.get("user_id"),
            )
        cur.execute(
            "UPDATE supplier_returns SET status='cancelled', cancelled_at=NOW(), cancelled_by=%s WHERE id=%s",
            (current_user.get("user_id"), rid),
        )
        conn.commit()
        return {"ok": True}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/product/{pid:int}")
def product_return_info(pid: int, supplier_id: Optional[int] = None, current_user=Depends(get_current_user)):
    """Lots on hand and a suggested credit per box (last cost from this supplier, else average cost)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT id, branch_id, name_ar, name_en, barcode, pack_size, unit, sub_unit, mid_unit, mid_size,
                  cost, avg_cost, supplier_id
           FROM products WHERE id=%s""",
        (pid,),
    )
    p = cur.fetchone()
    if not p:
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")
    _assert_branch(current_user, p["branch_id"])
    ensure_batches_migrated(cur, pid)
    cur.execute(
        """SELECT expiry_date, SUM(quantity)::int AS quantity FROM product_batches
           WHERE product_id=%s AND quantity > 0
           GROUP BY expiry_date ORDER BY COALESCE(expiry_date, DATE '9999-12-31')""",
        (pid,),
    )
    lots = [dict(r) for r in cur.fetchall()]
    box_cost = None
    if supplier_id:
        # Last received cost from this supplier, per box (PO lines may be per strip/tablet).
        cur.execute(
            """SELECT poi.unit_cost, poi.discount_pct, poi.vat_pct, poi.unit_type
               FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.po_id
               WHERE poi.product_id=%s AND po.supplier_id=%s AND po.status='received'
               ORDER BY po.received_at DESC NULLS LAST, poi.id DESC LIMIT 1""",
            (pid, supplier_id),
        )
        last = cur.fetchone()
        if last:
            from purchasing import _eff_unit_cost
            per = unit_multiple(p, last.get("unit_type"))
            eff = _eff_unit_cost(last["unit_cost"], last.get("discount_pct"), last.get("vat_pct"))
            box_cost = round(eff * max(1, int(p["pack_size"] or 1)) / per, 2)
    if box_cost is None:
        box_cost = round(float(p["avg_cost"] or p["cost"] or 0), 2)
    conn.close()
    return {"product": dict(p), "lots": lots, "box_cost": box_cost}
