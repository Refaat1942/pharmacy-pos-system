"""Create all database tables. Run once before seeding. Idempotent."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from db import get_db_connection


SQL = """
CREATE TABLE IF NOT EXISTS pharmacy_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name_ar VARCHAR(150),
    name_en VARCHAR(150),
    address_ar TEXT,
    address_en TEXT,
    phone VARCHAR(40),
    tax_id VARCHAR(60),
    logo_data_url TEXT,
    receipt_header_ar TEXT,
    receipt_header_en TEXT,
    receipt_footer_ar TEXT DEFAULT 'شكراً لزيارتكم',
    receipt_footer_en TEXT DEFAULT 'Thank you for your visit',
    receipt_language VARCHAR(10) DEFAULT 'auto',
    receipt_paper VARCHAR(10) DEFAULT '80mm',
    receipt_accent VARCHAR(20) DEFAULT '#0EA5E9',
    show_logo BOOLEAN DEFAULT true,
    show_tax_id BOOLEAN DEFAULT true,
    show_seller BOOLEAN DEFAULT true,
    show_customer BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT pharmacy_profile_singleton CHECK (id = 1)
);
INSERT INTO pharmacy_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

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

ALTER TABLE products ALTER COLUMN name_ar DROP NOT NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_customer_name VARCHAR(120);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_customer_phone VARCHAR(40);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_person_id INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_person_name VARCHAR(120);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20);
UPDATE invoices SET delivery_status='pending' WHERE type='delivery' AND delivery_status IS NULL;

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

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS pack_size INTEGER;
UPDATE invoice_items ii
SET pack_size = CASE
        WHEN COALESCE(p.pack_size, 1) > 1 AND ii.unit_label IS DISTINCT FROM p.sub_unit
            THEN COALESCE(p.pack_size, 1)
        ELSE 1 END
FROM products p
WHERE ii.product_id = p.id AND ii.pack_size IS NULL;

ALTER TABLE return_items ADD COLUMN IF NOT EXISTS sub_quantity INTEGER;
UPDATE return_items ri
SET sub_quantity = ri.quantity * COALESCE(ii.pack_size, 1)
FROM invoice_items ii
WHERE ri.invoice_item_id = ii.id AND ri.sub_quantity IS NULL;

UPDATE products
SET branch_id = COALESCE(
        (SELECT id FROM branches WHERE name_en = 'Seventh District Branch' ORDER BY id LIMIT 1),
        (SELECT id FROM branches ORDER BY id LIMIT 1)
    )
WHERE branch_id IS NULL AND EXISTS (SELECT 1 FROM branches);

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

-- Extend customers + suppliers with region + structured fields
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(200);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_details TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_number VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_details TEXT;

CREATE TABLE IF NOT EXISTS customer_payments (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    invoice_id INTEGER REFERENCES invoices(id),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30),
    reference VARCHAR(100),
    notes TEXT,
    paid_at TIMESTAMP DEFAULT NOW(),
    recorded_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_cust_pay_customer ON customer_payments(customer_id, paid_at DESC);

-- Per-branch customer authorization (admins open accounts; non-admins limited to authorized branches)
CREATE TABLE IF NOT EXISTS customer_branches (
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    authorized_at TIMESTAMP DEFAULT NOW(),
    authorized_by INTEGER REFERENCES users(id),
    PRIMARY KEY (customer_id, branch_id)
);
-- Backfill: any customer who already has an invoice in a branch is authorized there
INSERT INTO customer_branches (customer_id, branch_id)
SELECT DISTINCT customer_id, branch_id FROM invoices
WHERE customer_id IS NOT NULL AND branch_id IS NOT NULL
ON CONFLICT DO NOTHING;
-- Backfill: any customer with a legacy branch_id assignment is authorized there
INSERT INTO customer_branches (customer_id, branch_id)
SELECT id, branch_id FROM customers WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS purchase_order_seq START 1;
SELECT setval('purchase_order_seq',
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM purchase_orders), 1));
SELECT setval('stock_transfer_seq',
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM stock_transfers), 1));

-- Cash drawer / shifts
CREATE TABLE IF NOT EXISTS shifts (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    branch_id     INTEGER NOT NULL REFERENCES branches(id),
    opened_at     TIMESTAMP NOT NULL DEFAULT now(),
    opening_cash  NUMERIC(10,2) NOT NULL DEFAULT 0,
    closed_at     TIMESTAMP,
    closing_cash  NUMERIC(10,2),
    expected_cash NUMERIC(10,2),
    variance      NUMERIC(10,2),
    status        VARCHAR(10) NOT NULL DEFAULT 'open',
    notes         TEXT
);
CREATE INDEX IF NOT EXISTS shifts_user_status_idx ON shifts(user_id, status);
CREATE INDEX IF NOT EXISTS shifts_branch_opened_idx ON shifts(branch_id, opened_at);
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_user
  ON shifts(user_id) WHERE status='open';

-- HR & Payroll
CREATE TABLE IF NOT EXISTS employees (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(150) NOT NULL,
    role         VARCHAR(50),
    branch_id    INTEGER REFERENCES branches(id),
    base_salary  NUMERIC(10,2) NOT NULL DEFAULT 0,
    hire_date    DATE,
    phone        VARCHAR(30),
    national_id  VARCHAR(50),
    active       BOOLEAN DEFAULT true,
    notes        TEXT,
    created_at   TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attendance (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_date   DATE NOT NULL,
    check_in    TIME,
    check_out   TIME,
    hours       NUMERIC(5,2),
    status      VARCHAR(20) DEFAULT 'present',
    notes       TEXT,
    UNIQUE(employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance(work_date);
CREATE TABLE IF NOT EXISTS salary_slips (
    id           SERIAL PRIMARY KEY,
    employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period_month VARCHAR(7) NOT NULL,
    base_salary  NUMERIC(10,2) NOT NULL DEFAULT 0,
    bonus        NUMERIC(10,2) DEFAULT 0,
    deductions   NUMERIC(10,2) DEFAULT 0,
    days_worked  INTEGER DEFAULT 0,
    net_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
    status       VARCHAR(20) DEFAULT 'draft',
    paid_at      TIMESTAMP,
    notes        TEXT,
    created_at   TIMESTAMP DEFAULT now(),
    UNIQUE(employee_id, period_month)
);

ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS hours_worked NUMERIC(10,2);

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

-- Migration: multi-unit packaging (e.g. 1 Box = 10 Strips)
--   unit       = main / outer pack unit (Box, Pack, Bottle …)
--   sub_unit   = inner unit (Strip, Ampoule, Tablet …) — optional
--   pack_size  = how many sub_units in one pack (default 1 = no subdivision)
--   sub_price  = price per sub_unit (optional; default = price / pack_size)
-- Stock is tracked in SUB-UNITS when pack_size > 1; otherwise in main units.
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_unit  VARCHAR(30);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS international_barcode VARCHAR(100);

-- Per-line unit label captured at sale time (e.g. "box" or "strip"), for receipts.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit_label VARCHAR(30);

-- Snapshot unit on transfer items (so detail view stays correct even if product unit changes).
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS unit_label VARCHAR(30);

-- Optional preferred supplier per product (used by auto-replenishment PO).
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);

-- Shift Visa reconciliation (counted Visa total + variance vs expected Visa sales)
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB;

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS counted_visa  NUMERIC(10,2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS variance_visa NUMERIC(10,2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type    VARCHAR(20);

-- Receipt display toggles + barcode + customizable shift windows
ALTER TABLE pharmacy_profile ADD COLUMN IF NOT EXISTS show_sale_type BOOLEAN DEFAULT true;
ALTER TABLE pharmacy_profile ADD COLUMN IF NOT EXISTS show_branch    BOOLEAN DEFAULT true;
ALTER TABLE pharmacy_profile ADD COLUMN IF NOT EXISTS show_date      BOOLEAN DEFAULT true;
ALTER TABLE pharmacy_profile ADD COLUMN IF NOT EXISTS show_time      BOOLEAN DEFAULT true;
ALTER TABLE pharmacy_profile ADD COLUMN IF NOT EXISTS show_barcode   BOOLEAN DEFAULT true;
ALTER TABLE pharmacy_profile ADD COLUMN IF NOT EXISTS shift_morning_start TIME DEFAULT '06:00';
ALTER TABLE pharmacy_profile ADD COLUMN IF NOT EXISTS shift_evening_start TIME DEFAULT '14:00';
ALTER TABLE pharmacy_profile ADD COLUMN IF NOT EXISTS shift_night_start   TIME DEFAULT '22:00';

-- Employee clock code for QR/barcode self-service attendance
ALTER TABLE employees ADD COLUMN IF NOT EXISTS clock_code VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS employees_clock_code_key ON employees(clock_code) WHERE clock_code IS NOT NULL;
-- Backfill stable codes for any employees that don't have one yet
UPDATE employees
   SET clock_code = 'EMP-' || LPAD(id::text, 4, '0') || '-' || SUBSTR(MD5(id::text || COALESCE(name,'') || 'fratelanza'), 1, 6)
 WHERE clock_code IS NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS punched_by_user_id INTEGER;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS punched_at TIMESTAMP;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS allowed BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hours_allowance NUMERIC(5,2) DEFAULT 0;

-- Per-user card code for unlocking a locked terminal by scanning a personal QR/barcode
ALTER TABLE users ADD COLUMN IF NOT EXISTS card_code VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS users_card_code_key ON users(card_code) WHERE card_code IS NOT NULL;
UPDATE users
   SET card_code = 'USR-' || LPAD(id::text, 4, '0') || '-' || SUBSTR(MD5(id::text || COALESCE(username,'') || 'fratelanza'), 1, 6)
 WHERE card_code IS NULL;

-- Link POS login users to HR employee rows (e.g. delivery drivers on the delivery roster)
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;

-- Contracted clinics that send prescriptions to the POS via a private link
CREATE TABLE IF NOT EXISTS clinics (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(150) NOT NULL,
    phone        VARCHAR(40),
    notes        TEXT,
    portal_token VARCHAR(64) NOT NULL,
    active       BOOLEAN DEFAULT true,
    created_at   TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS clinics_portal_token_key ON clinics(portal_token);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id);
CREATE INDEX IF NOT EXISTS invoices_clinic_id_idx ON invoices(clinic_id);

-- Prescriptions sent by clinics; cashier loads them into the POS cart
CREATE TABLE IF NOT EXISTS prescriptions (
    id            SERIAL PRIMARY KEY,
    clinic_id     INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    branch_id     INTEGER REFERENCES branches(id),
    patient_name  VARCHAR(150),
    patient_phone VARCHAR(40),
    doctor_name   VARCHAR(150),
    notes         TEXT,
    status        VARCHAR(20) DEFAULT 'pending',
    created_at    TIMESTAMP DEFAULT NOW(),
    handled_at    TIMESTAMP,
    handled_by    INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS prescriptions_status_idx ON prescriptions(status, branch_id);

CREATE TABLE IF NOT EXISTS prescription_items (
    id              SERIAL PRIMARY KEY,
    prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_name   VARCHAR(250) NOT NULL,
    quantity        INTEGER DEFAULT 1,
    dose            TEXT,
    note            TEXT
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS prescription_id INTEGER REFERENCES prescriptions(id);
CREATE INDEX IF NOT EXISTS invoices_prescription_id_idx ON invoices(prescription_id);

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS discount_pct DECIMAL(6,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS vat_pct      DECIMAL(6,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS public_price DECIMAL(12,2);
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
