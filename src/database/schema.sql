-- External Reference Number Portal Database Schema

-- Admin-generated supplier links
CREATE TABLE admin_supplier_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_with VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL UNIQUE,
    created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    state VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (state IN ('Active', 'Pending', 'Frozen')),
    valid_until TIMESTAMP NOT NULL,
    supplier_name VARCHAR(255),
    admin_notes TEXT
);

-- Supplier access tokens
CREATE TABLE supplier_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_identifier VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Reference number submissions
CREATE TABLE reference_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_link_id UUID REFERENCES supplier_links(id) ON DELETE CASCADE,
    po_number VARCHAR(255) NOT NULL,
    delivery_id VARCHAR(255) NOT NULL,
    delivery_postcode VARCHAR(10) NOT NULL,
    reference_number VARCHAR(255) NOT NULL,
    validation_number VARCHAR(255),
    submitted_by_email VARCHAR(255) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer access logs
CREATE TABLE customer_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(255) NOT NULL,
    delivery_id VARCHAR(255) NOT NULL,
    access_method VARCHAR(50) NOT NULL CHECK (access_method IN ('postcode', 'email', 'link')),
    accessed_by_email VARCHAR(255),
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45)
);

-- Temporary access tokens
CREATE TABLE access_tokens (
    token VARCHAR(255) PRIMARY KEY,
    po_number VARCHAR(255) NOT NULL,
    delivery_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    max_uses INTEGER DEFAULT 10,
    uses_count INTEGER DEFAULT 0,
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTP tokens for supplier verification
CREATE TABLE otp_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    supplier_link_id UUID REFERENCES supplier_links(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Supplier sessions
CREATE TABLE supplier_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_link_id UUID REFERENCES supplier_links(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_reference_submissions_po_delivery ON reference_submissions(po_number, delivery_id);
CREATE INDEX idx_reference_submissions_supplier ON reference_submissions(supplier_link_id);
CREATE INDEX idx_customer_access_logs_po_delivery ON customer_access_logs(po_number, delivery_id);
CREATE INDEX idx_access_tokens_expires ON access_tokens(expires_at);
CREATE INDEX idx_otp_tokens_email_expires ON otp_tokens(email, expires_at);
CREATE INDEX idx_supplier_sessions_token ON supplier_sessions(session_token);
CREATE INDEX idx_supplier_sessions_expires ON supplier_sessions(expires_at);