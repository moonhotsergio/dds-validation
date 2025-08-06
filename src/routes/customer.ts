import express from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { stringify } from 'csv-stringify';
import pool from '../database/connection';
import { sendAccessLink } from '../utils/email';
import { strictLimiter } from '../middleware/rateLimiter';
import { customerAccessSchema, shareableLinkSchema } from '../utils/validation';

const router = express.Router();

// Helper function to generate references HTML
function generateReferencesHTML(references: any[]): string {
    // Group references by PO/Delivery
    const grouped: any = {};
    references.forEach((ref: any) => {
        const key = `${ref.poNumber}-${ref.deliveryId}`;
        if (!grouped[key]) {
            grouped[key] = {
                poNumber: ref.poNumber,
                deliveryId: ref.deliveryId,
                references: [],
                latestSubmission: ref.submittedAt
            };
        }
        grouped[key].references.push({
            referenceNumber: ref.referenceNumber,
            validationNumber: ref.validationNumber,
            submittedAt: ref.submittedAt
        });
        
        // Keep track of latest submission
        if (new Date(ref.submittedAt) > new Date(grouped[key].latestSubmission)) {
            grouped[key].latestSubmission = ref.submittedAt;
        }
    });

    // Generate HTML for grouped references
    return Object.values(grouped).map((group: any) => `
        <div class="reference-group">
            <div class="group-header">
                <div>
                    <div class="group-title">PO: ${group.poNumber} | Delivery: ${group.deliveryId}</div>
                    <div class="group-subtitle">${group.references.length} reference${group.references.length !== 1 ? 's' : ''} found</div>
                </div>
                <div class="group-subtitle">
                    Latest: ${new Date(group.latestSubmission).toLocaleString()}
                </div>
            </div>
            <div class="references-table">
                <div class="table-header">
                    <div>Reference Number</div>
                    <div>Validation Number</div>
                    <div>Submitted</div>
                    <div>Actions</div>
                </div>
                ${group.references.map((ref: any) => `
                    <div class="table-row">
                        <div class="ref-number">${ref.referenceNumber}</div>
                        <div class="val-number">${ref.validationNumber || '-'}</div>
                        <div class="submitted-time">${new Date(ref.submittedAt).toLocaleString()}</div>
                        <div class="row-actions">
                            <button class="btn copy-btn" onclick="copyToClipboard('${ref.referenceNumber}')">Copy Ref</button>
                            ${ref.validationNumber ? `<button class="btn copy-btn" onclick="copyToClipboard('${ref.validationNumber}')">Copy Val</button>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Request access via postcode or email
router.post('/request-access', async (req, res) => {
    try {
        const { error, value } = customerAccessSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { poNumber, deliveryId, postcode, email } = value;
        const clientIp = req.ip || req.connection.remoteAddress;

        // Check if references exist for this PO/Delivery (case-insensitive)
        const searchQuery = deliveryId 
            ? 'SELECT * FROM reference_submissions WHERE LOWER(po_number) = LOWER($1) AND LOWER(delivery_id) = LOWER($2)'
            : 'SELECT * FROM reference_submissions WHERE LOWER(po_number) = LOWER($1)';
        
        const searchParams = deliveryId ? [poNumber, deliveryId] : [poNumber];
        const referencesResult = await pool.query(searchQuery, searchParams);

        if (referencesResult.rows.length === 0) {
            return res.status(404).json({ error: 'No references found for the provided PO/Delivery' });
        }

        if (postcode) {
            // For postcode verification, we would need to validate against delivery address
            // This is a placeholder - in real implementation, you'd validate against delivery postcode
            // For now, we'll assume validation passes and return references directly
            
            // Log access
            await pool.query(
                'INSERT INTO customer_access_logs (po_number, delivery_id, access_method, accessed_at, ip_address) VALUES ($1, $2, $3, NOW(), $4)',
                [poNumber, deliveryId || '', 'postcode', clientIp]
            );

            res.json({ 
                references: referencesResult.rows.map((row: any) => ({
                    poNumber: row.po_number,
                    deliveryId: row.delivery_id,
                    referenceNumber: row.reference_number,
                    validationNumber: row.validation_number,
                    submittedAt: row.submitted_at
                }))
            });
        } else if (email) {
            // Generate access token
            const token = uuidv4();
            const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours

            await pool.query(
                'INSERT INTO access_tokens (token, po_number, delivery_id, expires_at) VALUES ($1, $2, $3, $4)',
                [token, poNumber, deliveryId || '', expiresAt]
            );

            // Send access email
            const accessUrl = `${req.protocol}://${req.get('host')}/api/customer/access/${token}`;
            await sendAccessLink(email, poNumber, deliveryId || '', accessUrl);

            // Log access attempt
            await pool.query(
                'INSERT INTO customer_access_logs (po_number, delivery_id, access_method, accessed_by_email, accessed_at, ip_address) VALUES ($1, $2, $3, $4, NOW(), $5)',
                [poNumber, deliveryId || '', 'email', email, clientIp]
            );

            res.json({ message: 'Access link sent to your email' });
        }
    } catch (error) {
        console.error('Error processing access request:', error);
        res.status(500).json({ error: 'Failed to process access request' });
    }
});

// Access via token (from email link)
router.get('/access/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.query;

        // Verify token (handle SQLite timestamp format)
        const currentTime = Date.now();
        const tokenResult = await pool.query(
            'SELECT * FROM access_tokens WHERE token = $1 AND expires_at > $2 AND uses_count < max_uses',
            [token, currentTime]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid or expired access token' });
        }

        const accessToken = tokenResult.rows[0];

        // Check password if required
        if (accessToken.password_hash && !password) {
            // Return HTML page for password input instead of JSON error
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Password Required - DDS Validation</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
                        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .form-group { margin-bottom: 1rem; }
                        label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
                        input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
                        .btn { background: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 5px; cursor: pointer; width: 100%; }
                        .btn:hover { background: #218838; }
                        .error { color: #dc3545; margin-top: 10px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>Password Required</h2>
                        <p>This link is password protected. Please enter the password to view the reference numbers.</p>
                        <form id="password-form">
                            <div class="form-group">
                                <label for="password">Password:</label>
                                <input type="password" id="password" required>
                            </div>
                            <button type="submit" class="btn">Access References</button>
                        </form>
                        <div id="error" class="error" style="display:none;"></div>
                    </div>
                    <script>
                        document.getElementById('password-form').addEventListener('submit', function(e) {
                            e.preventDefault();
                            const password = document.getElementById('password').value;
                            const currentUrl = new URL(window.location);
                            currentUrl.searchParams.set('password', password);
                            window.location.href = currentUrl.toString();
                        });
                    </script>
                </body>
                </html>
            `);
        }

        if (accessToken.password_hash && password) {
            const passwordValid = await bcrypt.compare(password as string, accessToken.password_hash);
            if (!passwordValid) {
                // Return HTML with error message
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Invalid Password - DDS Validation</title>
                        <style>
                            body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
                            .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                            .form-group { margin-bottom: 1rem; }
                            label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
                            input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
                            .btn { background: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 5px; cursor: pointer; width: 100%; }
                            .btn:hover { background: #218838; }
                            .error { color: #dc3545; margin-top: 10px; background: #f8d7da; padding: 10px; border-radius: 4px; }
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <h2>Password Required</h2>
                            <p>This link is password protected. Please enter the password to view the reference numbers.</p>
                            <form id="password-form">
                                <div class="form-group">
                                    <label for="password">Password:</label>
                                    <input type="password" id="password" required>
                                </div>
                                <button type="submit" class="btn">Access References</button>
                            </form>
                            <div class="error">Invalid password. Please try again.</div>
                        </div>
                        <script>
                            document.getElementById('password-form').addEventListener('submit', function(e) {
                                e.preventDefault();
                                const password = document.getElementById('password').value;
                                const currentUrl = new URL(window.location);
                                currentUrl.searchParams.set('password', password);
                                window.location.href = currentUrl.toString();
                            });
                        </script>
                    </body>
                    </html>
                `);
            }
        }

        // Get references
        const searchQuery = accessToken.delivery_id 
            ? 'SELECT * FROM reference_submissions WHERE po_number = $1 AND delivery_id = $2'
            : 'SELECT * FROM reference_submissions WHERE po_number = $1';
        
        const searchParams = accessToken.delivery_id 
            ? [accessToken.po_number, accessToken.delivery_id] 
            : [accessToken.po_number];
        
        const referencesResult = await pool.query(searchQuery, searchParams);

        // Increment usage count
        await pool.query(
            'UPDATE access_tokens SET uses_count = uses_count + 1 WHERE token = $1',
            [token]
        );

        // Log access
        const clientIp = req.ip || req.connection.remoteAddress;
        await pool.query(
            'INSERT INTO customer_access_logs (po_number, delivery_id, access_method, accessed_at, ip_address) VALUES ($1, $2, $3, $4, $5)',
            [accessToken.po_number, accessToken.delivery_id, 'link', Date.now(), clientIp]
        );

        // Return references as JSON (for API compatibility)
        const references = referencesResult.rows.map((row: any) => ({
            poNumber: row.po_number,
            deliveryId: row.delivery_id,
            referenceNumber: row.reference_number,
            validationNumber: row.validation_number,
            submittedAt: row.submitted_at
        }));

        // Return HTML page with references displayed
        return res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Shared References - DDS Validation</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; }
                    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
                    .header { background: #17a2b8; color: white; padding: 2rem; text-align: center; border-radius: 8px; margin-bottom: 2rem; }
                    .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 2rem; }
                    .alert { padding: 15px; margin: 15px 0; border-radius: 4px; }
                    .alert-info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
                    .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                    .reference-group { margin-bottom: 25px; border: 1px solid #e9ecef; border-radius: 8px; overflow: hidden; }
                    .group-header { background: #17a2b8; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
                    .group-title { font-size: 1.2em; font-weight: bold; }
                    .group-subtitle { font-size: 0.9em; opacity: 0.9; }
                    .references-table { background: white; }
                    .table-header { background: #f8f9fa; padding: 15px; border-bottom: 1px solid #e9ecef; display: grid; grid-template-columns: 2fr 2fr 1fr auto; gap: 15px; font-weight: bold; color: #495057; }
                    .table-row { padding: 15px; border-bottom: 1px solid #f1f3f4; display: grid; grid-template-columns: 2fr 2fr 1fr auto; gap: 15px; align-items: center; }
                    .table-row:last-child { border-bottom: none; }
                    .table-row:hover { background: #f8f9fa; }
                    .ref-number { font-weight: bold; color: #007bff; }
                    .val-number { color: #28a745; }
                    .submitted-time { color: #6c757d; font-size: 0.9em; }
                    .row-actions { display: flex; gap: 5px; }
                    .btn { background: #17a2b8; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 0.9em; }
                    .btn:hover { background: #138496; }
                    .btn-secondary { background: #6c757d; }
                    .btn-secondary:hover { background: #545b62; }
                    .copy-btn { font-size: 0.8em; padding: 5px 10px; }
                    .reference-actions { margin-top: 20px; text-align: center; }
                    .limitations { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
                    .share-info { background: #e9ecef; padding: 15px; border-radius: 4px; margin-bottom: 20px; font-size: 0.9em; color: #6c757d; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔗 Shared Reference Numbers</h1>
                        <p>View-only access to reference numbers</p>
                    </div>

                    <div class="card">
                        <div class="limitations">
                            <strong>📋 Shared Access Limitations:</strong>
                            <ul style="margin-top: 10px; margin-left: 20px;">
                                <li>View and copy references only</li>
                                <li>Cannot generate new share links</li>
                                <li>Cannot access additional records</li>
                                <li>Link has limited usage and expiry</li>
                            </ul>
                        </div>

                        <div class="share-info">
                            <strong>📄 PO Number:</strong> ${accessToken.po_number}<br>
                            ${accessToken.delivery_id ? `<strong>🚚 Delivery ID:</strong> ${accessToken.delivery_id}<br>` : ''}
                            <strong>🔢 Total References:</strong> ${references.length}
                        </div>

                        <div id="references-content">
                            ${generateReferencesHTML(references)}
                        </div>
                        
                        <div class="reference-actions">
                            <button class="btn btn-secondary" onclick="copyAllReferences()">📋 Copy All References</button>
                            <button class="btn btn-secondary" onclick="downloadCSV()">📥 Download CSV</button>
                        </div>
                    </div>

                    <!-- Alert Container -->
                    <div id="alert-container"></div>
                </div>

                <script>
                    const references = ${JSON.stringify(references)};
                    const tokenData = {
                        poNumber: '${accessToken.po_number}',
                        deliveryId: '${accessToken.delivery_id}'
                    };

                    function showAlert(message, type = 'info') {
                        const alertContainer = document.getElementById('alert-container');
                        const alert = document.createElement('div');
                        alert.className = 'alert alert-' + type;
                        alert.textContent = message;
                        alertContainer.appendChild(alert);
                        setTimeout(() => alert.remove(), 5000);
                    }

                    function copyToClipboard(text) {
                        navigator.clipboard.writeText(text).then(() => {
                            showAlert('Copied to clipboard', 'success');
                        }).catch(() => {
                            showAlert('Failed to copy to clipboard', 'error');
                        });
                    }

                    function copyAllReferences() {
                        const allRefs = references.map(ref => 
                            ref.referenceNumber + (ref.validationNumber ? ' (' + ref.validationNumber + ')' : '')
                        ).join(', ');
                        
                        copyToClipboard(allRefs);
                    }

                    function downloadCSV() {
                        const params = new URLSearchParams();
                        if (tokenData.deliveryId) params.append('deliveryId', tokenData.deliveryId);
                        
                        const url = '/api/customer/download-csv/' + tokenData.poNumber + '?' + params.toString();
                        window.open(url, '_blank');
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error accessing via token:', error);
        res.status(500).json({ error: 'Failed to access references' });
    }
});

// Get references (direct access with PO/Delivery)
router.get('/references/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        const { deliveryId } = req.query;

        // This endpoint assumes the user has already been authenticated via postcode
        // In a real implementation, you'd validate the session or require additional auth

        const searchQuery = deliveryId 
            ? 'SELECT * FROM reference_submissions WHERE LOWER(po_number) = LOWER($1) AND LOWER(delivery_id) = LOWER($2)'
            : 'SELECT * FROM reference_submissions WHERE LOWER(po_number) = LOWER($1)';
        
        const searchParams = deliveryId ? [identifier, deliveryId] : [identifier];
        const referencesResult = await pool.query(searchQuery, searchParams);

        if (referencesResult.rows.length === 0) {
            return res.status(404).json({ error: 'No references found' });
        }

        res.json({ 
            references: referencesResult.rows.map((row: any) => ({
                poNumber: row.po_number,
                deliveryId: row.delivery_id,
                referenceNumber: row.reference_number,
                validationNumber: row.validation_number,
                submittedAt: row.submitted_at
            }))
        });
    } catch (error) {
        console.error('Error fetching references:', error);
        res.status(500).json({ error: 'Failed to fetch references' });
    }
});

// Generate shareable link
router.post('/generate-link', async (req, res) => {
    try {
        const { error, value } = shareableLinkSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { poNumber, deliveryId, password, expiresInHours } = value;

        // Verify references exist
        const searchQuery = deliveryId 
            ? 'SELECT COUNT(*) FROM reference_submissions WHERE LOWER(po_number) = LOWER($1) AND LOWER(delivery_id) = LOWER($2)'
            : 'SELECT COUNT(*) FROM reference_submissions WHERE LOWER(po_number) = LOWER($1)';
        
        const searchParams = deliveryId ? [poNumber, deliveryId] : [poNumber];
        const countResult = await pool.query(searchQuery, searchParams);

        if (parseInt(countResult.rows[0].count) === 0) {
            return res.status(404).json({ error: 'No references found for the provided PO/Delivery' });
        }

        // Generate token
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + (expiresInHours * 60 * 60 * 1000));
        
        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 12);
        }

        await pool.query(
            'INSERT INTO access_tokens (token, po_number, delivery_id, expires_at, password_hash) VALUES ($1, $2, $3, $4, $5)',
            [token, poNumber, deliveryId || '', expiresAt, passwordHash]
        );

        const shareUrl = `${req.protocol}://${req.get('host')}/api/customer/access/${token}`;

        res.json({ 
            shareUrl,
            expiresAt,
            passwordProtected: !!password
        });
    } catch (error) {
        console.error('Error generating shareable link:', error);
        res.status(500).json({ error: 'Failed to generate shareable link' });
    }
});

// Download references as CSV
router.get('/download-csv/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        const { deliveryId } = req.query;

        const searchQuery = deliveryId 
            ? 'SELECT * FROM reference_submissions WHERE LOWER(po_number) = LOWER($1) AND LOWER(delivery_id) = LOWER($2)'
            : 'SELECT * FROM reference_submissions WHERE LOWER(po_number) = LOWER($1)';
        
        const searchParams = deliveryId ? [identifier, deliveryId] : [identifier];
        const referencesResult = await pool.query(searchQuery, searchParams);

        if (referencesResult.rows.length === 0) {
            return res.status(404).json({ error: 'No references found' });
        }

        // Convert to CSV
        const csvData = referencesResult.rows.map((row: any) => ({
            'PO Number': row.po_number,
            'Delivery ID': row.delivery_id,
            'Reference Number': row.reference_number,
            'Validation Number': row.validation_number || '',
            'Submitted At': row.submitted_at
        }));

        stringify(csvData, { header: true }, (err, output) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to generate CSV' });
            }

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="references-${identifier}.csv"`);
            res.send(output);
        });
    } catch (error) {
        console.error('Error downloading CSV:', error);
        res.status(500).json({ error: 'Failed to download CSV' });
    }
});

export default router;