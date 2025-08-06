# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DDS Validation Portal is an External Reference Number Portal that facilitates secure exchange of reference numbers between suppliers and customers. The system provides multiple authentication methods and secure access controls for both parties.

## Development Commands

### Setup and Installation
- `npm install` - Install dependencies
- `cp .env.example .env` - Create environment file (configure database and email settings)
- `npm run migrate:dev` - Run database migrations

### Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run migrate` - Run database migrations in production

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode

## Architecture

### Database Schema
- **supplier_links**: Persistent unique access links for suppliers
- **reference_submissions**: Reference numbers submitted by suppliers
- **customer_access_logs**: Audit trail of customer access attempts
- **access_tokens**: Temporary tokens for shareable links
- **otp_tokens**: One-time passwords for supplier email verification
- **supplier_sessions**: Active supplier authentication sessions

### API Structure
- **Supplier endpoints** (`/api/supplier/`): Email verification, OTP validation, reference submission, bulk CSV upload
- **Customer endpoints** (`/api/customer/`): Access via postcode/email, shareable link generation, CSV download

### Frontend Pages
- **Landing page** (`/`): Portal introduction and role selection
- **Supplier portal** (`/supplier/:linkId`): Reference submission interface with CSV upload
- **Customer portal** (`/customer`): Reference access with multiple verification methods

### Security Features
- Rate limiting on sensitive endpoints
- JWT-based supplier sessions with 30-day expiry
- Email verification with 6-digit OTP (10-minute expiry)
- Bcrypt password hashing for shareable links
- SQL injection protection via parameterized queries
- XSS protection with Helmet middleware

### Key Implementation Details
- TypeScript with Express.js backend
- PostgreSQL database with UUID primary keys
- Nodemailer for email delivery
- Multer for CSV file uploads
- Client-side JavaScript for interactive frontend
- Mobile-responsive design

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT signing
- SMTP settings for email delivery
- Rate limiting and OTP configuration

## File Structure Notes
- `src/routes/`: API endpoint implementations
- `src/middleware/`: Authentication and rate limiting
- `src/database/`: Schema and connection management
- `src/utils/`: Email sending and validation schemas
- `public/`: Static HTML pages with embedded JavaScript