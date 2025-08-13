-- DDS Validation V2 Database Schema
-- Fundamental Platform Changes: Organisations and Admin Authentication

-- Admin users table for password-based authentication
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organisations table (replaces supplier concept)
CREATE TABLE organisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Connections table (replaces supplier_links concept)
-- Represents unique connection between admin and organisation
CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    token VARCHAR(9) NOT NULL UNIQUE CHECK (token ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    UNIQUE(admin_user_id, organisation_id)
);

-- Reference events table (generalized from reference_submissions)
-- Supports both sent and received directions
CREATE TABLE reference_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    po_number VARCHAR(255),
    delivery_id VARCHAR(255),
    reference_number VARCHAR(255) NOT NULL,
    validation_number VARCHAR(255),
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('sent', 'received')),
    -- Perspective: direction is from Organisation's point of view
    -- sent = Organisation → Admin; received = Admin → Organisation
    submitted_by_email VARCHAR(255),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Ensure either PO Number OR Delivery ID is provided (not both required)
    CONSTRAINT check_po_or_delivery CHECK (
        (po_number IS NOT NULL AND po_number != '' AND po_number != 'null') OR 
        (delivery_id IS NOT NULL AND delivery_id != '' AND delivery_id != 'null')
    )
);

-- OTP tokens for organisation verification (kept from V1)
CREATE TABLE otp_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    connection_id VARCHAR(9) NOT NULL REFERENCES connections(token) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organisation sessions (kept from V1, updated for connections)
CREATE TABLE organisation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id VARCHAR(9) NOT NULL REFERENCES connections(token) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin direct activations (for bypassing OTP authentication)
CREATE TABLE organisation_direct_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id VARCHAR(9) NOT NULL REFERENCES connections(token) ON DELETE CASCADE,
    activated_by_admin UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    admin_notes TEXT,
    UNIQUE(connection_id)
);

-- Create indexes for better performance
CREATE INDEX idx_connections_token ON connections(token);
CREATE INDEX idx_connections_admin_org ON connections(admin_user_id, organisation_id);
CREATE INDEX idx_connections_is_active ON connections(is_active);

CREATE INDEX idx_reference_events_connection ON reference_events(connection_id);
CREATE INDEX idx_reference_events_direction ON reference_events(direction);
CREATE INDEX idx_reference_events_submitted_at ON reference_events(submitted_at);
CREATE INDEX idx_reference_events_po_delivery ON reference_events(po_number, delivery_id);

CREATE INDEX idx_otp_tokens_email_expires ON otp_tokens(email, expires_at);
CREATE INDEX idx_otp_tokens_connection ON otp_tokens(connection_id);

CREATE INDEX idx_organisation_sessions_token ON organisation_sessions(session_token);
CREATE INDEX idx_organisation_sessions_expires ON organisation_sessions(expires_at);
CREATE INDEX idx_organisation_sessions_connection ON organisation_sessions(connection_id);

-- Seed data for testing
INSERT INTO admin_users (email, password_hash) VALUES 
    ('sergio.andrade@moonshot.partners', '$2b$10$dummy.hash.for.testing.only'),
    ('sa@iov42.com', '$2b$10$dummy.hash.for.testing.only');

-- Insert some sample organisations for testing
INSERT INTO organisations (name) VALUES 
    ('Acme Corporation'),
    ('Tech Solutions Ltd'),
    ('Global Industries'),
    ('Innovation Corp');
