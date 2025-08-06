# External Reference Number Portal - Architecture & Flows

## Database Schema

```sql
-- Supplier access tokens
supplier_links (
  id UUID PRIMARY KEY,
  supplier_identifier VARCHAR,
  created_at TIMESTAMP,
  last_used TIMESTAMP,
  is_active BOOLEAN
)

-- Reference number submissions
reference_submissions (
  id UUID PRIMARY KEY,
  supplier_link_id UUID REFERENCES supplier_links,
  po_number VARCHAR,
  delivery_id VARCHAR,
  reference_number VARCHAR,
  validation_number VARCHAR,
  submitted_by_email VARCHAR,
  submitted_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Customer access logs
customer_access_logs (
  id UUID PRIMARY KEY,
  po_number VARCHAR,
  delivery_id VARCHAR,
  access_method VARCHAR, -- 'postcode', 'email', 'link'
  accessed_by_email VARCHAR,
  accessed_at TIMESTAMP,
  ip_address VARCHAR
)

-- Temporary access tokens
access_tokens (
  token VARCHAR PRIMARY KEY,
  po_number VARCHAR,
  delivery_id VARCHAR,
  expires_at TIMESTAMP,
  max_uses INTEGER,
  uses_count INTEGER DEFAULT 0
)
```

## API Endpoints

### Supplier Endpoints
- `POST /api/supplier/verify-email` - Send OTP
- `POST /api/supplier/validate-otp` - Verify OTP and create session
- `GET /api/supplier/submissions/{supplier_link_id}` - View past submissions
- `POST /api/supplier/submit` - Submit reference numbers
- `POST /api/supplier/bulk-upload` - CSV upload

### Customer Endpoints
- `POST /api/customer/request-access` - Request access (email or postcode)
- `GET /api/customer/references/{po_or_delivery}` - Retrieve reference numbers
- `POST /api/customer/generate-link` - Create shareable link
- `GET /api/customer/download-csv/{po_or_delivery}` - Download as CSV

## Detailed User Flows

### Supplier Flow

```mermaid
graph TD
    A[Supplier receives unique link] --> B[Opens link]
    B --> C{First time?}
    C -->|Yes| D[Enter email]
    C -->|No| E[Check cookie/session]
    D --> F[Receive OTP via email]
    F --> G[Enter OTP]
    G --> H[Session created]
    E --> H
    H --> I[Main submission page]
    I --> J{Upload method?}
    J -->|Manual| K[Enter PO/Delivery details]
    J -->|CSV| L[Upload CSV file]
    K --> M[Add reference/validation numbers]
    L --> N[Parse and validate CSV]
    M --> O[Validate PO/Delivery exists]
    N --> O
    O -->|Valid| P[Submit data]
    O -->|Invalid| Q[Show error]
    P --> R[Show confirmation]
    R --> S[Option to add more]
```

### Customer Flow - Postcode Verification

```mermaid
graph TD
    A[Customer landing page] --> B[Enter PO/Delivery number]
    B --> C[Enter delivery postcode]
    C --> D{Validate match}
    D -->|Valid| E[Display reference numbers]
    D -->|Invalid| F[Show error - retry]
    E --> G{Action?}
    G -->|Copy| H[Copy to clipboard]
    G -->|Download| I[Generate CSV]
    G -->|Share| J[Generate time-limited link]
    J --> K[Optional: Add password]
    K --> L[Share link generated]
```

### Customer Flow - Email Verification

```mermaid
graph TD
    A[Customer landing page] --> B[Enter PO/Delivery number]
    B --> C[Enter email address]
    C --> D[Send verification link]
    D --> E[Check email]
    E --> F[Click verification link]
    F --> G[Display reference numbers]
    G --> H{Action?}
    H -->|Copy| I[Copy to clipboard]
    H -->|Download| J[Generate CSV]
    H -->|Share| K[Generate shareable link]
```

## Security Considerations

### For Suppliers
1. **Persistent Unique Links**
   - One link per supplier relationship
   - Can be revoked if compromised
   - Track usage patterns for anomalies

2. **Email Verification**
   - OTP valid for 10 minutes
   - Session valid for 30 days
   - Option to "remember this device"

3. **Validation**
   - PO/Delivery must exist in system
   - Rate limiting on submissions
   - Duplicate detection with alerts

### For Customers
1. **Access Control Options**
   - **Basic**: PO + Postcode (like parcel tracking)
   - **Enhanced**: PO + Email verification
   - **Shareable**: Time-limited tokens with optional password

2. **Data Protection**
   - No sensitive commercial data exposed
   - Access logs for audit trail
   - GDPR compliance for email storage

3. **Rate Limiting**
   - Max 5 attempts per IP per hour
   - Exponential backoff for failures

## UI/UX Considerations

### Supplier Interface
- Clean, single-purpose page
- Clear instructions for first-time users
- Progress indicators for CSV uploads
- Success confirmations with summary
- History view of submissions

### Customer Interface
- Minimal fields, maximum clarity
- Mobile-responsive design
- Quick copy buttons for reference numbers
- Clear download options
- Share functionality with preview

## Implementation Phases

### Phase 1 - MVP
- Basic supplier submission (manual entry only)
- Customer retrieval with postcode verification
- Simple CSV download

### Phase 2 - Enhanced Features
- CSV upload for suppliers
- Email verification option
- Shareable links
- Submission history

### Phase 3 - Advanced Features
- API integration options
- Bulk operations
- Advanced duplicate handling
- Analytics dashboard

## Naming Suggestions
- "Reference Exchange Portal"
- "External Reference Hub"
- "Supplier Connect"
- "Quick Reference Access"