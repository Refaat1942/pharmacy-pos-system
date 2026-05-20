from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import psycopg2.extras
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel
from auth import create_token, verify_password
from db import get_db_connection
from deps import get_current_user
from inventory import router as inventory_router, log_movement

app = FastAPI(title="PharmaPOS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inventory_router)


# ─── AUTH ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM users WHERE username = %s AND status = 'active'",
        (req.username,)
    )
    user = cur.fetchone()
    conn.close()
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({
        "user_id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "name_ar": user["name_ar"],
        "name_en": user["name_en"],
        "branch_id": user["branch_id"],
    })
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "name_ar": user["name_ar"],
            "name_en": user["name_en"],
            "role": user["role"],
            "branch_id": user["branch_id"],
        },
    }


@app.get("/api/auth/me")
def get_me(current_user=Depends(get_current_user)):
    return current_user


# ─── PRODUCTS ────────────────────────────────────────────────────────────────

@app.get("/api/products")
def search_products(q: str = "", current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    search = f"%{q}%"
    cur.execute(
        """SELECT * FROM products
           WHERE active = true
             AND (name_ar ILIKE %s OR name_en ILIKE %s OR barcode = %s)
           ORDER BY name_en LIMIT 60""",
        (search, search, q),
    )
    products = cur.fetchall()
    conn.close()
    return [dict(p) for p in products]


@app.get("/api/products/{product_id}")
def get_product(product_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM products WHERE id = %s", (product_id,))
    product = cur.fetchone()
    conn.close()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return dict(product)


class ProductCreate(BaseModel):
    barcode: Optional[str] = None
    name_ar: str
    name_en: str
    category: Optional[str] = None
    unit: Optional[str] = "box"
    price: float
    cost: Optional[float] = None
    stock: int = 0
    min_stock: int = 5
    expiry_date: Optional[date] = None


@app.post("/api/products")
def create_product(req: ProductCreate, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        branch_id = current_user.get("branch_id")
        cur.execute(
            """INSERT INTO products (barcode, name_ar, name_en, category, unit, price, cost, stock, min_stock, expiry_date, branch_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (req.barcode, req.name_ar, req.name_en, req.category, req.unit,
             req.price, req.cost, req.stock, req.min_stock, req.expiry_date,
             branch_id),
        )
        product = cur.fetchone()
        if req.stock and req.stock > 0:
            log_movement(
                cur, product["id"], branch_id, "initial",
                req.stock, req.stock,
                reference_type="initial", reason="Initial stock on item creation",
                user_id=current_user.get("user_id"),
            )
        conn.commit()
        return dict(product)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─── CUSTOMERS ───────────────────────────────────────────────────────────────

@app.get("/api/customers")
def list_customers(q: str = "", current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM customers WHERE name ILIKE %s OR phone ILIKE %s ORDER BY name LIMIT 30",
        (f"%{q}%", f"%{q}%"),
    )
    customers = cur.fetchall()
    conn.close()
    return [dict(c) for c in customers]


class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    notes: Optional[str] = None


@app.post("/api/customers")
def create_customer(req: CustomerCreate, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "INSERT INTO customers (name, phone, notes, branch_id) VALUES (%s,%s,%s,%s) RETURNING *",
        (req.name, req.phone, req.notes, current_user.get("branch_id")),
    )
    customer = cur.fetchone()
    conn.commit()
    conn.close()
    return dict(customer)


# ─── EMPLOYEES ───────────────────────────────────────────────────────────────

@app.get("/api/employees")
def list_employees(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, name_ar, name_en, role, status FROM users WHERE status='active' ORDER BY name_en"
    )
    employees = cur.fetchall()
    conn.close()
    return [dict(e) for e in employees]


# ─── SALES ───────────────────────────────────────────────────────────────────

class InvoiceItemInput(BaseModel):
    product_id: int
    quantity: int
    unit_price: float
    discount: float = 0.0


class SaleRequest(BaseModel):
    type: str
    payment_method: str
    digital_type: Optional[str] = None
    items: List[InvoiceItemInput]
    discount: float = 0.0
    cash_amount: Optional[float] = None
    visa_amount: Optional[float] = None
    customer_id: Optional[int] = None
    seller_id: Optional[int] = None
    notes: Optional[str] = None


@app.post("/api/sales")
def create_sale(req: SaleRequest, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        subtotal = sum(i.quantity * i.unit_price for i in req.items)
        net_total = subtotal - req.discount

        cur.execute("SELECT COUNT(*) AS cnt FROM invoices")
        count = cur.fetchone()["cnt"]
        invoice_number = f"INV-{datetime.now().strftime('%Y%m%d')}-{int(count)+1:04d}"

        change = 0.0
        if req.payment_method == "cash" and req.cash_amount:
            change = max(0.0, req.cash_amount - net_total)

        seller_id = req.seller_id or current_user.get("user_id")
        branch_id = current_user.get("branch_id")

        cur.execute(
            """INSERT INTO invoices
               (invoice_number, type, payment_method, digital_type,
                subtotal, discount, net_total, cash_amount, visa_amount,
                change_amount, seller_id, customer_id, branch_id, notes)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (invoice_number, req.type, req.payment_method, req.digital_type,
             subtotal, req.discount, net_total, req.cash_amount, req.visa_amount,
             change, seller_id, req.customer_id, branch_id, req.notes),
        )
        invoice = cur.fetchone()
        invoice_id = invoice["id"]

        for item in req.items:
            if item.quantity <= 0:
                raise HTTPException(status_code=400, detail=f"Invalid quantity for product {item.product_id}")
            cur.execute("SELECT name_ar, name_en, barcode, stock, branch_id, active FROM products WHERE id=%s FOR UPDATE",
                        (item.product_id,))
            prod = cur.fetchone()
            if not prod or not prod["active"]:
                raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
            if int(prod["stock"]) < item.quantity:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {prod['name_en']} (have {prod['stock']}, need {item.quantity})")
            item_total = item.quantity * item.unit_price - item.discount
            cur.execute(
                """INSERT INTO invoice_items
                   (invoice_id, product_id, product_name_ar, product_name_en,
                    barcode, quantity, unit_price, discount, total)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (invoice_id, item.product_id, prod["name_ar"], prod["name_en"],
                 prod["barcode"], item.quantity, item.unit_price, item.discount, item_total),
            )
            new_stock = int(prod["stock"]) - item.quantity
            cur.execute("UPDATE products SET stock=%s WHERE id=%s",
                        (new_stock, item.product_id))
            log_movement(
                cur, item.product_id, prod["branch_id"] or branch_id, "sale",
                -item.quantity, new_stock,
                reference_type="invoice", reference_id=invoice_id,
                reason=f"Sale {invoice_number}",
                user_id=seller_id,
            )

        conn.commit()
        cur.execute("SELECT * FROM invoices WHERE id=%s", (invoice_id,))
        full_invoice = cur.fetchone()
        cur.execute("SELECT * FROM invoice_items WHERE invoice_id=%s", (invoice_id,))
        items = cur.fetchall()
        return {"invoice": dict(full_invoice), "items": [dict(i) for i in items]}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/sales")
def list_sales(limit: int = 50, offset: int = 0, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT i.*, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                  c.name AS customer_name
           FROM invoices i
           LEFT JOIN users u ON i.seller_id = u.id
           LEFT JOIN customers c ON i.customer_id = c.id
           ORDER BY i.created_at DESC LIMIT %s OFFSET %s""",
        (limit, offset),
    )
    invoices = cur.fetchall()
    conn.close()
    return [dict(i) for i in invoices]


@app.get("/api/sales/{invoice_id}")
def get_sale(invoice_id: int, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """SELECT i.*, u.name_en AS seller_name_en, u.name_ar AS seller_name_ar,
                  c.name AS customer_name
           FROM invoices i
           LEFT JOIN users u ON i.seller_id = u.id
           LEFT JOIN customers c ON i.customer_id = c.id
           WHERE i.id=%s""",
        (invoice_id,),
    )
    invoice = cur.fetchone()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    cur.execute("SELECT * FROM invoice_items WHERE invoice_id=%s", (invoice_id,))
    items = cur.fetchall()
    conn.close()
    return {"invoice": dict(invoice), "items": [dict(i) for i in items]}


class ReturnItem(BaseModel):
    invoice_item_id: int
    quantity: int


class ReturnRequest(BaseModel):
    items: List[ReturnItem]
    reason: Optional[str] = None


@app.post("/api/sales/{invoice_id}/return")
def process_return(invoice_id: int, req: ReturnRequest, current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT COUNT(*) AS cnt FROM returns")
        count = cur.fetchone()["cnt"]
        return_number = f"RET-{datetime.now().strftime('%Y%m%d')}-{int(count)+1:04d}"

        total_returned = 0.0
        for item in req.items:
            cur.execute("SELECT unit_price FROM invoice_items WHERE id=%s AND invoice_id=%s",
                        (item.invoice_item_id, invoice_id))
            inv_item = cur.fetchone()
            if not inv_item:
                raise HTTPException(status_code=404, detail="Invoice item not found on this invoice")
            total_returned += float(inv_item["unit_price"]) * item.quantity

        cur.execute(
            """INSERT INTO returns
               (original_invoice_id, return_invoice_number, type, total_returned, reason, seller_id, branch_id)
               VALUES (%s,%s,'partial',%s,%s,%s,%s) RETURNING *""",
            (invoice_id, return_number, total_returned, req.reason,
             current_user.get("user_id"), current_user.get("branch_id")),
        )
        ret = cur.fetchone()

        for item in req.items:
            if item.quantity <= 0:
                raise HTTPException(status_code=400, detail="Invalid return quantity")
            cur.execute(
                """SELECT ii.*, COALESCE((
                       SELECT SUM(ri.quantity) FROM return_items ri WHERE ri.invoice_item_id = ii.id
                   ), 0) AS already_returned
                   FROM invoice_items ii WHERE ii.id=%s AND ii.invoice_id=%s""",
                (item.invoice_item_id, invoice_id),
            )
            inv_item = cur.fetchone()
            if not inv_item:
                raise HTTPException(status_code=404, detail="Invoice item not found on this invoice")
            remaining = int(inv_item["quantity"]) - int(inv_item["already_returned"])
            if item.quantity > remaining:
                raise HTTPException(status_code=400, detail=f"Return qty {item.quantity} exceeds remaining {remaining}")
            item_total = float(inv_item["unit_price"]) * item.quantity
            cur.execute(
                """INSERT INTO return_items
                   (return_id, invoice_item_id, product_id, quantity, unit_price, total)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                (ret["id"], item.invoice_item_id, inv_item["product_id"],
                 item.quantity, inv_item["unit_price"], item_total),
            )
            cur.execute("SELECT stock, branch_id FROM products WHERE id=%s FOR UPDATE",
                        (inv_item["product_id"],))
            p = cur.fetchone()
            new_stock = int(p["stock"]) + item.quantity
            cur.execute("UPDATE products SET stock=%s WHERE id=%s",
                        (new_stock, inv_item["product_id"]))
            log_movement(
                cur, inv_item["product_id"], p["branch_id"], "return",
                item.quantity, new_stock,
                reference_type="return", reference_id=ret["id"],
                reason=f"Return {return_number}: {req.reason or ''}".strip(),
                user_id=current_user.get("user_id"),
            )

        conn.commit()
        return dict(ret)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─── DASHBOARD ───────────────────────────────────────────────────────────────

@app.get("/api/dashboard/summary")
def dashboard_summary(current_user=Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    today = date.today()
    cur.execute(
        "SELECT COALESCE(SUM(net_total),0) AS total, COUNT(*) AS cnt FROM invoices WHERE DATE(created_at)=%s AND status='completed'",
        (today,),
    )
    today_data = cur.fetchone()
    cur.execute(
        "SELECT COALESCE(SUM(total_returned),0) AS total FROM returns WHERE DATE(created_at)=%s",
        (today,),
    )
    returns_data = cur.fetchone()
    cur.execute("SELECT COUNT(*) AS cnt FROM products WHERE stock <= min_stock AND active=true")
    low_stock = cur.fetchone()
    conn.close()
    net = float(today_data["total"]) - float(returns_data["total"])
    return {
        "date": str(today),
        "today_sales": float(today_data["total"]),
        "invoice_count": int(today_data["cnt"]),
        "returns_total": float(returns_data["total"]),
        "net_sales": net,
        "low_stock_count": int(low_stock["cnt"]),
    }


@app.get("/")
def root():
    return {"status": "PharmaPOS API running", "version": "2.0"}
