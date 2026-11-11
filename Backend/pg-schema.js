
const schema = `
CREATE TABLE IF NOT EXISTS developer_accounts (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supermarkets (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dealers (
    id BIGSERIAL PRIMARY KEY,
    supermarket_id BIGINT NOT NULL REFERENCES supermarkets(id),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    supermarket_id BIGINT NOT NULL REFERENCES supermarkets(id),
    dealer_id BIGINT REFERENCES dealers(id),
    name TEXT NOT NULL,
    barcode TEXT,
    purchase_cost NUMERIC(12,2) DEFAULT 0,
    mrp NUMERIC(12,2) DEFAULT 0,
    selling_price NUMERIC(12,2) DEFAULT 0,
    current_stock NUMERIC(12,3) DEFAULT 0,
    low_stock_threshold NUMERIC(12,3) DEFAULT 0,
    auto_order_quantity NUMERIC(12,3) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supermarket_id, barcode)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    supermarket_id BIGINT NOT NULL REFERENCES supermarkets(id),
    dealer_id BIGINT NOT NULL REFERENCES dealers(id),
    product_id BIGINT NOT NULL REFERENCES products(id),
    quantity NUMERIC(12,3) NOT NULL,
    status TEXT DEFAULT 'created',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ,
    dealer_response_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invoices (
    id BIGSERIAL PRIMARY KEY,
    supermarket_id BIGINT NOT NULL REFERENCES supermarkets(id),
    invoice_number TEXT UNIQUE NOT NULL,
    customer_email TEXT,
    total_amount NUMERIC(12,2) NOT NULL,
    payment_method TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id),
    product_id BIGINT NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox (
    id BIGSERIAL PRIMARY KEY,
    supermarket_id BIGINT NOT NULL REFERENCES supermarkets(id),
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_supermarket
ON products(supermarket_id);

CREATE INDEX IF NOT EXISTS idx_orders_supermarket
ON purchase_orders(supermarket_id);

CREATE INDEX IF NOT EXISTS idx_invoices_supermarket
ON invoices(supermarket_id);

CREATE INDEX IF NOT EXISTS idx_inbox_supermarket
ON inbox(supermarket_id);
`;

async function createPostgresSchema(pool) {
    await pool.query(schema);
    console.log("StockPilot PostgreSQL tables created successfully!");
}

module.exports = { createPostgresSchema };
