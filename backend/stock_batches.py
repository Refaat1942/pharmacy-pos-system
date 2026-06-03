"""FEFO stock batches — multiple expiry dates per product."""
from datetime import date
from typing import Optional, List, Any

from fastapi import HTTPException

_SENTINEL = date(9999, 12, 31)


def _expiry_key(expiry: Optional[date]) -> date:
    return expiry if expiry is not None else _SENTINEL


def ensure_batches_migrated(cur, product_id: int) -> None:
    """If product has stock but no batch rows, seed from products table."""
    cur.execute("SELECT 1 FROM product_batches WHERE product_id=%s LIMIT 1", (product_id,))
    if cur.fetchone():
        return
    cur.execute(
        "SELECT stock, branch_id, expiry_date FROM products WHERE id=%s",
        (product_id,),
    )
    p = cur.fetchone()
    if not p or int(p["stock"] or 0) <= 0:
        return
    cur.execute(
        """INSERT INTO product_batches (product_id, branch_id, expiry_date, quantity)
           VALUES (%s, %s, %s, %s)""",
        (product_id, p["branch_id"], p["expiry_date"], int(p["stock"])),
    )


def sync_product_from_batches(cur, product_id: int) -> int:
    """Set products.stock and products.expiry_date from batch rows. Returns new stock."""
    cur.execute(
        """UPDATE products SET stock = COALESCE((
               SELECT SUM(quantity)::int FROM product_batches WHERE product_id = %s
             ), 0)
           WHERE id = %s
           RETURNING stock""",
        (product_id, product_id),
    )
    row = cur.fetchone()
    cur.execute(
        """SELECT expiry_date FROM product_batches
           WHERE product_id = %s AND quantity > 0
           ORDER BY COALESCE(expiry_date, DATE '9999-12-31') ASC
           LIMIT 1""",
        (product_id,),
    )
    earliest = cur.fetchone()
    exp = earliest["expiry_date"] if earliest else None
    cur.execute("UPDATE products SET expiry_date = %s WHERE id = %s", (exp, product_id))
    return int(row["stock"]) if row else 0


def list_batches(cur, product_id: int) -> List[dict]:
    ensure_batches_migrated(cur, product_id)
    cur.execute(
        """SELECT id, product_id, branch_id, expiry_date, quantity, created_at, updated_at
           FROM product_batches
           WHERE product_id = %s AND quantity > 0
           ORDER BY COALESCE(expiry_date, DATE '9999-12-31') ASC, id ASC""",
        (product_id,),
    )
    return [dict(r) for r in cur.fetchall()]


def add_batch_stock(
    cur,
    product_id: int,
    branch_id: Optional[int],
    qty: int,
    expiry_date: Optional[date] = None,
) -> None:
    if qty <= 0:
        return
    ensure_batches_migrated(cur, product_id)
    key = _expiry_key(expiry_date)
    cur.execute(
        """UPDATE product_batches
           SET quantity = quantity + %s, updated_at = NOW()
           WHERE product_id = %s
             AND COALESCE(expiry_date, DATE '9999-12-31') = %s
           RETURNING id""",
        (qty, product_id, key),
    )
    if not cur.fetchone():
        cur.execute(
            """INSERT INTO product_batches (product_id, branch_id, expiry_date, quantity)
               VALUES (%s, %s, %s, %s)""",
            (product_id, branch_id, expiry_date, qty),
        )
    sync_product_from_batches(cur, product_id)


def set_batch_quantity(
    cur,
    batch_id: int,
    quantity: int,
    expiry_date: Optional[date] = None,
    *,
    expiry_set: bool = False,
) -> dict:
    if quantity < 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be negative")
    cur.execute(
        "SELECT * FROM product_batches WHERE id=%s FOR UPDATE",
        (batch_id,),
    )
    batch = cur.fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    product_id = batch["product_id"]
    if quantity == 0:
        cur.execute("DELETE FROM product_batches WHERE id=%s", (batch_id,))
    elif expiry_set and expiry_date != batch["expiry_date"]:
        # Move qty to another expiry row
        cur.execute("DELETE FROM product_batches WHERE id=%s", (batch_id,))
        add_batch_stock(cur, product_id, batch["branch_id"], quantity, expiry_date)
    else:
        sets = ["quantity = %s", "updated_at = NOW()"]
        vals: list[Any] = [quantity]
        if expiry_set:
            sets.append("expiry_date = %s")
            vals.append(expiry_date)
        vals.append(batch_id)
        cur.execute(
            f"UPDATE product_batches SET {', '.join(sets)} WHERE id=%s",
            vals,
        )
    new_stock = sync_product_from_batches(cur, product_id)
    return {"product_id": product_id, "new_stock": new_stock}


def deduct_stock_fefo(
    cur,
    product_id: int,
    qty: int,
    *,
    today: Optional[date] = None,
    sellable_only: bool = True,
) -> None:
    """Deduct stock from batches (FEFO). When sellable_only, skip expired lots."""
    if qty <= 0:
        return
    ensure_batches_migrated(cur, product_id)
    today = today or date.today()
    remaining = qty
    if sellable_only:
        cur.execute(
            """SELECT id, quantity FROM product_batches
               WHERE product_id = %s AND quantity > 0
                 AND (expiry_date IS NULL OR expiry_date >= %s)
               ORDER BY COALESCE(expiry_date, DATE '9999-12-31') ASC
               FOR UPDATE""",
            (product_id, today),
        )
    else:
        cur.execute(
            """SELECT id, quantity FROM product_batches
               WHERE product_id = %s AND quantity > 0
               ORDER BY COALESCE(expiry_date, DATE '9999-12-31') ASC
               FOR UPDATE""",
            (product_id,),
        )
    batches = cur.fetchall()
    available = sum(int(b["quantity"]) for b in batches)
    if available < qty:
        if sellable_only:
            cur.execute(
                """SELECT 1 FROM product_batches
                   WHERE product_id = %s AND quantity > 0
                     AND expiry_date IS NOT NULL AND expiry_date < %s
                   LIMIT 1""",
                (product_id, today),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Cannot sell: available stock is expired or insufficient unexpired quantity",
                )
        raise HTTPException(status_code=400, detail="Insufficient stock")
    for b in batches:
        if remaining <= 0:
            break
        take = min(remaining, int(b["quantity"]))
        new_q = int(b["quantity"]) - take
        if new_q == 0:
            cur.execute("DELETE FROM product_batches WHERE id=%s", (b["id"],))
        else:
            cur.execute(
                "UPDATE product_batches SET quantity=%s, updated_at=NOW() WHERE id=%s",
                (new_q, b["id"]),
            )
        remaining -= take
    sync_product_from_batches(cur, product_id)


def earliest_sellable_expiry(cur, product_id: int, today: Optional[date] = None) -> Optional[date]:
    """Earliest expiry among batches with sellable stock (for POS warnings)."""
    ensure_batches_migrated(cur, product_id)
    today = today or date.today()
    cur.execute(
        """SELECT expiry_date FROM product_batches
           WHERE product_id = %s AND quantity > 0
             AND (expiry_date IS NULL OR expiry_date >= %s)
           ORDER BY COALESCE(expiry_date, DATE '9999-12-31') ASC
           LIMIT 1""",
        (product_id, today),
    )
    row = cur.fetchone()
    return row["expiry_date"] if row else None


def assert_sellable(cur, product_id: int, today: Optional[date] = None) -> None:
    """Block sale when no unexpired batch stock remains."""
    today = today or date.today()
    ensure_batches_migrated(cur, product_id)
    cur.execute(
        """SELECT COALESCE(SUM(quantity), 0)::int AS q FROM product_batches
           WHERE product_id = %s AND quantity > 0
             AND (expiry_date IS NULL OR expiry_date >= %s)""",
        (product_id, today),
    )
    sellable = int(cur.fetchone()["q"])
    if sellable > 0:
        return
    cur.execute(
        """SELECT 1 FROM product_batches
           WHERE product_id = %s AND quantity > 0
             AND expiry_date IS NOT NULL AND expiry_date < %s
           LIMIT 1""",
        (product_id, today),
    )
    if cur.fetchone():
        cur.execute("SELECT name_en FROM products WHERE id=%s", (product_id,))
        name = (cur.fetchone() or {}).get("name_en", product_id)
        raise HTTPException(
            status_code=400,
            detail=f"Cannot sell expired product '{name}'",
        )
