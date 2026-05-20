"""Create all database tables. Run once before seeding. Idempotent."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from db import get_db_connection


SQL = """
CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL,
    branch_id INTEGER REFERENCES branches(id),
    salary DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(50),
    name_ar VARCHAR(200) NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    unit VARCHAR(30) DEFAULT 'box',
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2),
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    expiry_date DATE,
    branch_id INTEGER REFERENCES branches(id),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    notes TEXT,
    balance DECIMAL(10,2) DEFAULT 0,
    branch_id INTEGER REFERENCES branches(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(30) UNIQUE NOT NULL,
    type VARCHAR(30) NOT NULL,
    payment_method VARCHAR(30) NOT NULL,
    digital_type VARCHAR(30),
    subtotal DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    net_total DECIMAL(10,2) NOT NULL,
    cash_amount DECIMAL(10,2),
    visa_amount DECIMAL(10,2),
    change_amount DECIMAL(10,2) DEFAULT 0,
    seller_id INTEGER REFERENCES users(id),
    customer_id INTEGER REFERENCES customers(id),
    branch_id INTEGER REFERENCES branches(id),
    status VARCHAR(20) DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name_ar VARCHAR(200),
    product_name_en VARCHAR(200),
    barcode VARCHAR(50),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS returns (
    id SERIAL PRIMARY KEY,
    original_invoice_id INTEGER REFERENCES invoices(id),
    return_invoice_number VARCHAR(30) UNIQUE NOT NULL,
    type VARCHAR(30),
    total_returned DECIMAL(10,2),
    reason TEXT,
    seller_id INTEGER REFERENCES users(id),
    branch_id INTEGER REFERENCES branches(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_items (
    id SERIAL PRIMARY KEY,
    return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
    invoice_item_id INTEGER REFERENCES invoice_items(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL
);

-- ─── Inventory Ledger (audit + reports + classification source) ─────────────
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id),
    movement_type VARCHAR(30) NOT NULL,
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_type VARCHAR(30),
    reference_id INTEGER,
    reason TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_branch ON stock_movements(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(movement_type);

CREATE TABLE IF NOT EXISTS stock_transfers (
    id SERIAL PRIMARY KEY,
    transfer_number VARCHAR(40) UNIQUE NOT NULL,
    from_branch_id INTEGER NOT NULL REFERENCES branches(id),
    to_branch_id INTEGER NOT NULL REFERENCES branches(id),
    status VARCHAR(20) NOT NULL DEFAULT 'in_transit',
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    received_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    received_at TIMESTAMP,
    cancelled_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON stock_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON stock_transfers(to_branch_id);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id SERIAL PRIMARY KEY,
    transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    source_product_id INTEGER NOT NULL REFERENCES products(id),
    dest_product_id INTEGER REFERENCES products(id),
    barcode VARCHAR(50),
    product_name_ar TEXT,
    product_name_en TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON stock_transfer_items(transfer_id);

CREATE SEQUENCE IF NOT EXISTS stock_transfer_seq START 1;

-- ─── PURCHASING & SUPPLIERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(40),
    email VARCHAR(200),
    address TEXT,
    tax_number VARCHAR(50),
    notes TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(active);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(40) UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    supplier_invoice_number VARCHAR(80),
    supplier_invoice_date DATE,
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    tax DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    received_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    received_at TIMESTAMP,
    cancelled_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_branch ON purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    barcode VARCHAR(50),
    product_name_ar TEXT,
    product_name_en TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost DECIMAL(12,2) NOT NULL,
    expiry_date DATE,
    total DECIMAL(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

CREATE TABLE IF NOT EXISTS supplier_payments (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    po_id INTEGER REFERENCES purchase_orders(id),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30),
    reference VARCHAR(100),
    notes TEXT,
    paid_at TIMESTAMP DEFAULT NOW(),
    recorded_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sup_pay_supplier ON supplier_payments(supplier_id, paid_at DESC);

CREATE SEQUENCE IF NOT EXISTS purchase_order_seq START 1;
SELECT setval('purchase_order_seq',
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM purchase_orders), 1));
SELECT setval('stock_transfer_seq',
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM stock_transfers), 1));

-- Migration: replace single-column UNIQUE(barcode) with composite UNIQUE(barcode, branch_id)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_barcode_key') THEN
        ALTER TABLE products DROP CONSTRAINT products_barcode_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_barcode_branch_key') THEN
        ALTER TABLE products ADD CONSTRAINT products_barcode_branch_key UNIQUE (barcode, branch_id);
    END IF;
END $$;
"""


def init():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(SQL)
    conn.commit()
    conn.close()
    print("✅ Database tables created successfully!")


if __name__ == "__main__":
    init()
