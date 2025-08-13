# Platform Fundamental Changes Plan — Organisations and Admin Authentication

## Goals
- Replace “Supplier/Customer” with a single term: “Organisation”.
- Introduce admin login with password-based authentication.
- Model a unique Connection between an admin and an organisation via a unique link.
- Organisation portal exposes two actions: Submit and Retrieve.
- Admin can submit references for testing from the Connection details screen; history shows Sent vs Received with filtering.
- Remove postcode from all user/admin flows.

## Key Changes Summary
1. Admin Authentication
   - Add email + password login for admins.
   - Passwords stored using strong hashing (bcrypt/argon2), sessions via JWT + HTTP-only cookies.

2. Terminology & Routing
   - “Supplier” and “Customer” become “Organisation”.
   - Unique links represent a Connection between Admin and Organisation.
   - Update UI labels: tabs are “Submit” and “Retrieve”.
   - URL scheme: `/external/:id` where `:id` matches `[A-Z0-9]{4}-[A-Z0-9]{4}` (e.g., `ABCD-1234`).

3. Unique Connection Model
   - Admin creates a unique link to an Organisation, establishing a 1:1 Connection between that admin and that organisation (multiple connections are possible across different admins and organisations).
   - The link token identifies the Connection and scopes all operations (submissions, history, retrieval).

4. Admin UI — Create Connection
   - On the create form, select Organisation from a dropdown with:
     - Scrollable list of organisations.
     - Inline filtering as the user types (client-side filter with debounce; upgrade to server-side search when needed).

5. Organisation Portal — Submit and Retrieve
   - Submit: Organisation submits references (PO Number and/or Delivery ID, Reference, Validation). No postcode.
   - History: As-is styling, showing submissions from the Organisation.
   - Retrieve: Shows references sent by the Admin to the Organisation; identical table styling to history but represents received items.

6. Admin — Connection Details (Testing Support)
   - Left: Connection information box (as-is style, adapted to Organisations/Connections).
   - Right: Submission form (same fields and validations as Organisation “Submit”) to simulate admin sending.
   - Bottom: History table with filters, combined view of Sent and Received with an extra Direction column and a filter (All, Sent, Received).

7. Remove Postcode Everywhere
   - Eliminate postcode requirements and UI from Organisation and Admin workflows.
   - Remove postcode logic from backend endpoints and database where applicable.

## Data Model Changes

### New / Updated Tables
- admin_users
  - id (uuid)
  - email (unique)
  - password_hash
  - created_at, updated_at

- organisations (rename or consolidate existing supplier concept)
  - id (uuid)
  - name (unique where applicable)
  - created_at, updated_at

- connections (replaces supplier_links concept)
  - id (uuid)
  - admin_user_id (fk admin_users)
  - organisation_id (fk organisations)
  - token (unique, short link id for URL)
  - is_active (boolean)
  - created_at, last_used

- reference_events (generalised from reference_submissions)
  - id (uuid)
  - connection_id (fk connections)
  - po_number (nullable)
  - delivery_id (nullable)
  - reference_number
  - validation_number (nullable)
  - direction (enum: 'sent' | 'received')
    - Perspective: direction is from the Organisation’s point of view.
    - sent = Organisation → Admin; received = Admin → Organisation.
  - submitted_by_email (nullable)
  - submitted_at (timestamp)

### Schema Migration Notes
- Map existing supplier_links → connections (admin_user_id will need assignment or migration default to a single admin until users exist).
- Map reference_submissions → reference_events
  - supplier_link_id → connection_id
  - delivery_postcode → DROP
  - Introduce direction = 'sent' for existing rows (Organisation-submitted historical data).
- Add necessary indexes:
  - connections(token), reference_events(connection_id), reference_events(submitted_at), reference_events(direction), reference_events(po_number, delivery_id)

## API Changes

### Admin Auth
- POST /api/admin/login { email, password } → JWT cookie/session
- POST /api/admin/logout → clear session
- Optional: POST /api/admin/register for bootstrap environments (or seed first admin)

### Admin — Organisations & Connections
- GET /api/admin/organisations?search=... → list organisations (for dropdown, supports filtering)
- POST /api/admin/connections { organisationId } → create unique connection and token
- GET /api/admin/connections/:id → connection details (metadata)
- GET /api/admin/connections/:id/history?direction=all|sent|received → unified history
- POST /api/admin/connections/:id/submit { poNumber?, deliveryId?, referenceNumber, validationNumber? } → create Admin → Organisation reference_event (direction = received)

### External Portal (via Connection Token)
- POST /api/external/:id/submit { poNumber?, deliveryId?, referenceNumber, validationNumber? } — `:id` is `XXXX-XXXX` format
- GET /api/external/:id/history → organisation-sent (direction = sent)
- GET /api/external/:id/retrieve → admin-sent (direction = received)

### Removals/Deprecations
- Remove postcode fields and validation from all endpoints.
- Deprecate old customer endpoints; maintain temporary redirects where needed.

## Frontend Changes

### Admin
- Login screen for admin.
- Connections list: “Create Connection” opens modal/page with Organisation dropdown (scrollable + type-to-filter).
- Connection details page layout:
  - Left: Connection info box (token, organisation name, status, created_at, last_used, link URL).
  - Right: “Submit References” form (fields: PO Number optional if Delivery ID present; Delivery ID optional if PO Number present; Reference; Validation).
  - Bottom: History table (columns: PO, Delivery, Reference, Validation, Direction [Sent/Received], Submitted At). Filters for PO/Delivery/date and Direction.

### External Portal
- Keep two tabs: Submit and Retrieve.
- Submit tab: form and “Your References” panel (no postcode anywhere).
- Retrieve tab: table styled exactly like history, but data source = admin-sent (direction = received).
- History tab optional: If we maintain a separate “History” tab for organisations, it shows direction = sent only.

## Validation Rules
- Either PO Number OR Delivery ID is required (both optional, at least one must be present).
- Reference Number required; Validation Number optional.
- No postcode anywhere.

### Field Formats (Proposed)
- Reference Number: 1–64 chars, allowed: A–Z, a–z, 0–9, `-`, `_`, `/`, spaces.
- Validation Number (optional): 1–64 chars, same allowed set as Reference Number.
- PO Number and Delivery ID: 1–64 chars, same allowed set; at least one required.

## Security & Sessions
- Admin: password-based login, JWT with short-lived access token + refresh or session cookie; enforce strong password policy. Seed the first admin in a migration or script; disable public self-registration in production.
- Organisation: continue using connection tokens (magic-link style) and keep OTP verification bound to the connection. Removing postcode does not affect org authentication.
- Rate limiting remains on submit endpoints; CSRF protection for admin forms.

## Migration Plan
1. Add new tables (admin_users, organisations if needed, connections, reference_events) without removing old.
2. Backfill connections from supplier_links, create temp default admin mapping if needed.
3. Migrate reference_submissions → reference_events with direction = sent; drop delivery_postcode.
4. Update backend codepaths to use new tables; add compatibility adapters as needed.
5. Switch frontend to new endpoints and remove postcode fields.
6. Remove deprecated columns/tables after validation.

## Testing Plan
- Unit tests: authentication, access control, direction logic, validators (either PO or Delivery).
- Integration tests: admin creates connection, organisation submits, admin submits, history filters All/Sent/Received.
- UI tests: dropdown filtering, tab behavior, history tables.

## Rollout
- Phase 1: Deploy behind feature flags; dual-write to new reference_events.
- Phase 2: Switch reads to new API; sunset old endpoints.
- Phase 3: Remove old tables/columns and flags.

## Seed Data (Testing Only)
- Create two admin users during setup (no public self-registration):
  - Admin 1: email `sergio.andrade@moonshot.partners`, password `Moonshot2020!`
  - Admin 2: email `sa@iov42.com`, password `Moonshot2020!`

Notes:
- Passwords will be hashed (bcrypt/argon2) in the seed script; plaintext is for setup only.
- Optionally require password change on first login in non-dev environments.

## Decisions Confirmed
- Organisations keep OTP verification.
- URL path uses `/external/:id` with `XXXX-XXXX` format.
- Seed the first admin; no public admin self-registration.

## Plan Maintenance Workflow (per major step)
1. Update this plan with the new status and any relevant notes (what changed, why, impact).
2. Commit the changes:
   - Example: `git add _plans-docs/fundamental-platform-changes-plan.md && git commit -m "docs(plan): update status - <short summary>"`
3. Sync with GitHub:
   - Example: `git push origin v2-development`

## Implementation Status - Phase 2 Complete ✅

### Completed Components
1. **Database Schema V2** ✅
   - Created new tables: `admin_users`, `organisations`, `connections`, `reference_events`
   - Removed postcode requirements from all tables
   - Added direction support for reference events (sent/received)
   - Implemented proper foreign key relationships and constraints

2. **Admin Authentication System** ✅
   - Password-based login with bcrypt hashing
   - JWT token management with HTTP-only cookies
   - Admin middleware for route protection
   - Login/logout/registration endpoints

3. **V2 API Routes** ✅
   - `/api/admin/auth/*` - Admin authentication endpoints
   - `/api/admin-v2/*` - New admin management endpoints
   - `/api/external/*` - External portal endpoints
   - All endpoints support new data model without postcodes

4. **Frontend Interfaces** ✅
   - `admin-v2.html` - New admin dashboard with organisation management
   - `external-portal.html` - External portal with Submit/Retrieve tabs
   - Modern UI with responsive design
   - Real-time data loading and form validation

5. **Core Functionality** ✅
   - Admin can create connections to organisations
   - External portal supports Submit and Retrieve operations
   - Direction-based reference tracking (sent vs received)
   - Connection token-based access (XXXX-XXXX format)

6. **Data Migration & Testing** ✅
   - Successfully executed V2 migration script
   - Seeded admin users and sample organisations
   - Verified all API endpoints functionality
   - Tested complete workflow: admin login → create connection → organisation submit → admin submit → retrieve/history

### Technical Implementation Details
- **Database Migration**: Created `migrate-v2.ts` script for schema setup
- **Authentication**: JWT-based with secure cookie handling
- **API Design**: RESTful endpoints with proper error handling
- **Frontend**: Vanilla JavaScript with modern CSS and responsive design
- **Security**: Input validation, SQL injection protection, CSRF considerations

### Testing Results - All Systems Operational ✅
- **Admin Authentication**: Login/logout working with JWT tokens
- **Organisations Management**: CRUD operations functional
- **Connection Creation**: Admin can create unique connections with XXXX-XXXX tokens
- **External Portal Submit**: Organisation can submit references (direction: sent)
- **External Portal Retrieve**: Shows admin-sent references (direction: received)
- **Admin History**: Combined view with direction filtering (all/sent/received)
- **Direction Logic**: Correctly tracks sent vs received from organisation perspective
- **Validation**: PO Number or Delivery ID requirement enforced
- **No Postcodes**: Successfully removed from all flows

### Next Steps for Phase 3
1. **Deployment**: Switch from V1 to V2 endpoints in production
2. **Data Migration**: Migrate existing V1 data to V2 schema
3. **Cleanup**: Remove deprecated V1 code and tables
4. **Monitoring**: Verify system stability and performance

## Critical Fixes Required Before Phase 3

### 1. External Portal UI Consistency ✅ COMPLETED
- **Issue**: External portal UI doesn't match the previous supplier portal design
- **Fix**: Update `external-portal.html` to follow the same UI pattern as the supplier portal
- **Reference**: Match design from `http://127.0.0.1:3004/supplier/K2RH-5V68`
- **Priority**: High - UI consistency is critical for user experience
- **Implementation**: 
  - Completely redesigned external portal to match supplier portal UI
  - Same background, layout, typography, and styling
  - Implemented role tabs (Submit, History, Retrieve) with proper styling
  - Added sub-tabs for Submit and Retrieve functionality
  - Maintained all existing functionality while improving visual consistency

### 2. Admin Portal Organisation Search ✅ COMPLETED
- **Issue**: Admin portal has unnecessary search box for organisations
- **Fix**: Remove separate search box, integrate search directly into organisation dropdown
- **Requirement**: 
  - Organisations should be in dropdown menu
  - User can type to filter organisations by name
  - Real-time filtering as user types
- **Priority**: High - Improves admin workflow efficiency
- **Implementation**:
  - Replaced static select dropdown with searchable input field
  - Added real-time filtering as user types (300ms debounce)
  - Implemented dropdown list with hover effects and selection
  - Added proper validation to ensure organisation is selected
  - Maintained all existing connection creation functionality

### 3. External Portal Submission Pattern ✅ COMPLETED
- **Issue**: Submission form doesn't match the previous supplier portal pattern
- **Fix**: Implement the same submission workflow:
  - User defines PO Number and/or Delivery ID
  - Can add multiple pairs of reference number + validation code
  - Submit all pairs for that PO at once
  - Remove email field requirement
- **Reference**: Match pattern from `http://127.0.0.1:3004/supplier/K2RH-5V68`
- **Priority**: High - Core functionality must match existing user expectations
- **Status**: ✅ Already implemented correctly - matches requirements exactly
- **Implementation**:
  - Purchase Order/Delivery section with expandable form
  - Reference input section for adding multiple reference pairs
  - Reference panel showing all references to be submitted
  - Submit button that submits all references at once
  - No email field requirement (as specified)
  - Proper validation and error handling

### Implementation Order
1. ✅ Fix External Portal UI consistency
2. ✅ Fix Admin Portal organisation search
3. ✅ Fix External Portal submission pattern
4. ✅ Test all fixes thoroughly
5. 🔄 Ready to proceed with Phase 3 deployment

## Open Questions
1. Password policy specifics: minimum length, complexity, and whether to add 2FA.
2. Organisations model: confirm many-to-many (multiple admins per org and vice versa) via `connections`.

## Acceptance Criteria - ✅ COMPLETED
- ✅ Admin can log in with email/password and create a Connection to an Organisation via searchable dropdown.
- ✅ Connection details page provides: info box (left), admin submission form (right), combined history with Direction filter (bottom).
- ✅ Organisation portal shows Submit and Retrieve; Retrieve displays items sent by admin.
- ✅ No postcode fields or checks remain anywhere.
- ✅ Database and API support Direction for events and scope by Connection.


