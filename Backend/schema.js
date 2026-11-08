const db = require("./database");

db.exec(`
CREATE TABLE IF NOT EXISTS developer_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supermarkets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dealers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supermarket_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    FOREIGN KEY (supermarket_id) REFERENCES supermarkets(id)
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supermarket_id INTEGER NOT NULL,
    dealer_id INTEGER,
    name TEXT NOT NULL,
    barcode TEXT,
    purchase_cost REAL DEFAULT 0,
    mrp REAL DEFAULT 0,
    selling_price REAL DEFAULT 0,
    current_stock REAL DEFAULT 0,
    low_stock_threshold REAL DEFAULT 0,
    auto_order_quantity REAL DEFAULT 0,
    FOREIGN KEY (supermarket_id) REFERENCES supermarkets(id),
    FOREIGN KEY (dealer_id) REFERENCES dealers(id),
    UNIQUE(supermarket_id, barcode)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supermarket_id INTEGER NOT NULL,
    dealer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    status TEXT DEFAULT 'created',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT,
    dealer_response_at TEXT,
    received_at TEXT,
    FOREIGN KEY (supermarket_id) REFERENCES supermarkets(id),
    FOREIGN KEY (dealer_id) REFERENCES dealers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supermarket_id INTEGER NOT NULL,
    invoice_number TEXT UNIQUE NOT NULL,
    customer_email TEXT,
    total_amount REAL NOT NULL,
    payment_method TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supermarket_id) REFERENCES supermarkets(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supermarket_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supermarket_id) REFERENCES supermarkets(id)
);
`);

console.log("StockPilot database tables created successfully!");

module.exports = db;
