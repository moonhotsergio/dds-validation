-- SQLite version of the schema

-- Supplier access tokens
CREATE TABLE IF NOT EXISTS supplier_links (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || '4' || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))),
    supplier_identifier TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    last_used TEXT,
    is_active INTEGER DEFAULT 1
);

-- Reference number submissions
CREATE TABLE IF NOT EXISTS reference_submissions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || '4' || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))),
    supplier_link_id TEXT REFERENCES supplier_links(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL,
    delivery_id TEXT NOT NULL,
    reference_number TEXT NOT NULL,
    validation_number TEXT,
    submitted_by_email TEXT NOT NULL,
    submitted_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Customer access logs
CREATE TABLE IF NOT EXISTS customer_access_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || '4' || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))),
    po_number TEXT NOT NULL,
    delivery_id TEXT NOT NULL,
    access_method TEXT NOT NULL,
    accessed_by_email TEXT,
    accessed_at TEXT DEFAULT (datetime('now')),
    ip_address TEXT
);

-- Temporary access tokens
CREATE TABLE IF NOT EXISTS access_tokens (
    token TEXT PRIMARY KEY,
    po_number TEXT NOT NULL,
    delivery_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    max_uses INTEGER DEFAULT 10,
    uses_count INTEGER DEFAULT 0,
    password_hash TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- OTP tokens for supplier verification
CREATE TABLE IF NOT EXISTS otp_tokens (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || '4' || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))),
    email TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    supplier_link_id TEXT REFERENCES supplier_links(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Supplier sessions
CREATE TABLE IF NOT EXISTS supplier_sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || '4' || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))),
    supplier_link_id TEXT REFERENCES supplier_links(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reference_submissions_po_delivery ON reference_submissions(po_number, delivery_id);
CREATE INDEX IF NOT EXISTS idx_reference_submissions_supplier ON reference_submissions(supplier_link_id);
CREATE INDEX IF NOT EXISTS idx_customer_access_logs_po_delivery ON customer_access_logs(po_number, delivery_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires ON access_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_tokens_email_expires ON otp_tokens(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_supplier_sessions_token ON supplier_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_supplier_sessions_expires ON supplier_sessions(expires_at);

-- Insert a test supplier link for testing
INSERT OR IGNORE INTO supplier_links (id, supplier_identifier, is_active) 
VALUES ('test-supplier-id', 'test-supplier', 1);