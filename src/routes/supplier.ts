import express from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { parse } from 'csv-parse';
import pool from '../database/connection';
import { sendOTP } from '../utils/email';
import { strictLimiter } from '../middleware/rateLimiter';
import { authenticateSupplier, AuthRequest } from '../middleware/auth';
import { 
    supplierEmailSchema, 
    otpValidationSchema, 
    referenceSubmissionSchema,
    bulkSubmissionSchema 
} from '../utils/validation';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Test bypass endpoint for development
router.post('/test-login', async (req, res) => {
    try {
        const { supplierLinkId } = req.body;
        
        if (!supplierLinkId) {
            return res.status(400).json({ error: 'Supplier link ID required' });
        }

        // Verify supplier link exists and is active
        const supplierResult = await pool.query(
            'SELECT id FROM supplier_links WHERE id = $1 AND is_active = true',
            [supplierLinkId]
        );

        if (supplierResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid supplier link' });
        }

        // Create test session directly
        const testEmail = 'test@example.com';
        const jwtSecret = process.env.JWT_SECRET as string;
        const sessionToken = jwt.sign(
            { supplierLinkId, email: testEmail },
            jwtSecret,
            { expiresIn: '30d' }
        );

        const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days

        // Store session
        await pool.query(
            'INSERT INTO supplier_sessions (supplier_link_id, session_token, email, expires_at) VALUES ($1, $2, $3, $4)',
            [supplierLinkId, sessionToken, testEmail, expiresAt]
        );

        // Update last_used for supplier link
        await pool.query(
            'UPDATE supplier_links SET last_used = datetime("now") WHERE id = $1',
            [supplierLinkId]
        );

        res.json({ 
            token: sessionToken,
            message: 'Test authentication successful',
            email: testEmail
        });
    } catch (error) {
        console.error('Error in test login:', error);
        res.status(500).json({ error: 'Failed to create test session' });
    }
});

// Generate and send OTP for supplier email verification
router.post('/verify-email', strictLimiter, async (req, res) => {
    try {
        const { error, value } = supplierEmailSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { email, supplierLinkId } = value;

        // Verify supplier link exists and is active
        const supplierResult = await pool.query(
            'SELECT id FROM supplier_links WHERE id = $1 AND is_active = true',
            [supplierLinkId]
        );

        if (supplierResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid supplier link' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRES_MINUTES || '10') * 60 * 1000));

        // Store OTP in database
        await pool.query(
            'INSERT INTO otp_tokens (email, otp_code, supplier_link_id, expires_at) VALUES ($1, $2, $3, $4)',
            [email, otp, supplierLinkId, expiresAt]
        );

        // Send OTP via email
        await sendOTP(email, otp);

        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Validate OTP and create session
router.post('/validate-otp', strictLimiter, async (req, res) => {
    try {
        const { error, value } = otpValidationSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { email, otp, supplierLinkId } = value;

        // Verify OTP
        const otpResult = await pool.query(
            'SELECT id FROM otp_tokens WHERE email = $1 AND otp_code = $2 AND supplier_link_id = $3 AND expires_at > NOW() AND used = false',
            [email, otp, supplierLinkId]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // Mark OTP as used
        await pool.query('UPDATE otp_tokens SET used = true WHERE id = $1', [otpResult.rows[0].id]);

        // Create session token
        const jwtSecret = process.env.JWT_SECRET as string;
        const sessionToken = jwt.sign(
            { supplierLinkId, email },
            jwtSecret,
            { expiresIn: '30d' }
        );

        const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days

        // Store session
        await pool.query(
            'INSERT INTO supplier_sessions (supplier_link_id, session_token, email, expires_at) VALUES ($1, $2, $3, $4)',
            [supplierLinkId, sessionToken, email, expiresAt]
        );

        // Update last_used for supplier link
        await pool.query(
            'UPDATE supplier_links SET last_used = NOW() WHERE id = $1',
            [supplierLinkId]
        );

        res.json({ 
            token: sessionToken,
            message: 'Authentication successful' 
        });
    } catch (error) {
        console.error('Error validating OTP:', error);
        res.status(500).json({ error: 'Failed to validate OTP' });
    }
});

// Get supplier's past submissions
router.get('/submissions', authenticateSupplier, async (req: AuthRequest, res) => {
    try {
        const result = await pool.query(
            `SELECT po_number, delivery_id, reference_number, validation_number, 
                    submitted_at, updated_at 
             FROM reference_submissions 
             WHERE supplier_link_id = $1 
             ORDER BY submitted_at DESC`,
            [req.supplierLinkId]
        );

        res.json({ submissions: result.rows });
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

// Submit reference numbers
router.post('/submit', authenticateSupplier, async (req: AuthRequest, res) => {
    try {
        const { error, value } = referenceSubmissionSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { poNumber, deliveryId, deliveryPostcode, referenceNumber, validationNumber } = value;

        // Always create new submission (allow multiple references per PO/Delivery)
        await pool.query(
            `INSERT INTO reference_submissions 
             (supplier_link_id, po_number, delivery_id, delivery_postcode, reference_number, validation_number, submitted_by_email) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.supplierLinkId, poNumber, deliveryId, deliveryPostcode, referenceNumber, validationNumber, req.email]
        );

        res.json({ message: 'Reference submitted successfully' });
    } catch (error) {
        console.error('Error submitting reference:', error);
        res.status(500).json({ error: 'Failed to submit reference' });
    }
});

// Bulk upload via CSV
router.post('/bulk-upload', authenticateSupplier, upload.single('csvFile'), async (req: AuthRequest, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No CSV file provided' });
        }

        const records: any[] = [];
        
        // Parse CSV (handle both comma and semicolon delimiters)
        const parser = parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
            delimiter: [',', ';'] // Support both comma and semicolon
        });

        parser.on('data', (record) => {
            records.push(record);
        });

        parser.on('error', (error) => {
            throw error;
        });

        parser.on('end', async () => {
            try {
                // Map CSV columns to expected format (handle various column name formats)
                const submissions = records.map(record => ({
                    poNumber: record.po_number || record.poNumber || record['PO Number'] || record['Po Number'],
                    deliveryId: record.delivery_id || record.deliveryId || record['Delivery ID'] || record['delivery id'],
                    deliveryPostcode: record.delivery_postcode || record.deliveryPostcode || record['Delivery Postcode'] || record['delivery postcode'],
                    referenceNumber: record.reference_number || record.referenceNumber || record['Reference Number'] || record['reference number'],
                    validationNumber: record.validation_number || record.validationNumber || record['Validation Number'] || record['validation number']
                }));

                // Validate all submissions
                const { error } = bulkSubmissionSchema.validate(submissions);
                if (error) {
                    return res.status(400).json({ error: error.details[0].message });
                }

                // Process submissions
                const results = [];
                for (const submission of submissions) {
                    try {
                        const { poNumber, deliveryId, deliveryPostcode, referenceNumber, validationNumber } = submission;

                        // Always create new submission (allow multiple references per PO/Delivery)
                        await pool.query(
                            `INSERT INTO reference_submissions 
                             (supplier_link_id, po_number, delivery_id, delivery_postcode, reference_number, validation_number, submitted_by_email) 
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [req.supplierLinkId, poNumber, deliveryId, deliveryPostcode, referenceNumber, validationNumber, req.email]
                        );
                        results.push({ ...submission, status: 'created' });
                    } catch (submissionError) {
                        results.push({ ...submission, status: 'error', error: submissionError });
                    }
                }

                res.json({ 
                    message: 'Bulk upload completed',
                    results,
                    summary: {
                        total: results.length,
                        created: results.filter(r => r.status === 'created').length,
                        errors: results.filter(r => r.status === 'error').length
                    }
                });
            } catch (processError) {
                console.error('Error processing CSV:', processError);
                res.status(500).json({ error: 'Failed to process CSV file' });
            }
        });

        const fs = require('fs');
        const csvContent = fs.readFileSync(req.file.path, 'utf8');
        parser.write(csvContent);
        parser.end();

    } catch (error) {
        console.error('Error uploading CSV:', error);
        res.status(500).json({ error: 'Failed to upload CSV' });
    }
});

export default router;