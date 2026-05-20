"""Create all database tables. Run once before seeding."""
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
    barcode VARCHAR(50) UNIQUE,
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
