import express from 'express';
import pool from '../database/connection';
import { sendOTP } from '../utils/email';

// Generate supplier link ID in XXXX-XXXX format
function createSupplierLink(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const part1 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const part2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part1}-${part2}`;
}

const router = express.Router();

// Generate new supplier link
router.post('/generate-link', async (req, res) => {
    try {
        const { supplierName, supplierEmail, validUntil, adminNotes } = req.body;

        if (!supplierEmail || !validUntil) {
            return res.status(400).json({ 
                error: 'Supplier email and valid until date are required' 
            });
        }

        // Check if supplier link already exists for this email
        const existingSupplier = await pool.query(
            'SELECT id FROM supplier_links WHERE supplier_identifier = $1',
            [supplierEmail]
        );

        let linkId;
        if (existingSupplier.rows.length > 0) {
            // Use existing supplier link ID
            linkId = existingSupplier.rows[0].id;
        } else {
            // Generate new unique link ID using new format
            const supplierLinkInfo = await createSupplierLink(supplierEmail);
            linkId = supplierLinkInfo.id;
        }

        const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3004';
        const uniqueUrl = `${baseUrl}/supplier/${linkId}`;

        // Create admin link record with explicit values
        const adminLinkId = crypto.randomUUID();
        const currentTime = new Date().toISOString();
        
        const result = await pool.query(
            `INSERT INTO admin_supplier_links 
             (id, shared_with, url, created_on, state, valid_until, supplier_name, admin_notes) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING *`,
            [adminLinkId, supplierEmail, uniqueUrl, currentTime, 'Pending', validUntil, supplierName || null, adminNotes || null]
        );

        // Send email to supplier with the link (only if email credentials are configured)
        try {
            if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
                await sendOTP(supplierEmail, uniqueUrl, 'supplier-link');
            }
        } catch (emailError) {
            console.error('Failed to send email:', emailError);
            // Continue even if email fails
        }

        res.json({
            message: 'Link generated successfully',
            link: result.rows[0],
            uniqueUrl
        });
    } catch (error) {
        console.error('Error generating link:', error);
        res.status(500).json({ error: 'Failed to generate link' });
    }
});

// Get all admin links
router.get('/links', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM admin_supplier_links ORDER BY created_on DESC');
        const links = result.rows;
        
        // Get total count for pagination
        const countResult = await pool.query('SELECT COUNT(*) as total FROM admin_supplier_links');
        const totalItems = parseInt(countResult.rows[0].total);
        
        res.json({
            links: links,
            total_items: totalItems
        });
    } catch (error) {
        console.error('Error fetching admin links:', error);
        res.status(500).json({ error: 'Failed to fetch admin links' });
    }
});

// Get specific link details
router.get('/links/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            `SELECT * FROM admin_supplier_links WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Link not found' });
        }

        res.json({ link: result.rows[0] });
    } catch (error) {
        console.error('Error fetching link:', error);
        res.status(500).json({ error: 'Failed to fetch link' });
    }
});

// Update link state (Freeze/Unfreeze)
router.patch('/links/:id/state', async (req, res) => {
    try {
        const { id } = req.params;
        const { state } = req.body;

        if (!['Active', 'Pending', 'Frozen'].includes(state)) {
            return res.status(400).json({ 
                error: 'Invalid state. Must be Active, Pending, or Frozen' 
            });
        }

        // First, let's check if the link exists
        const checkResult = await pool.query(
            `SELECT * FROM admin_supplier_links WHERE id = $1`,
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Link not found' });
        }

        // Update admin link state (without RETURNING for SQLite compatibility)
        await pool.query(
            `UPDATE admin_supplier_links SET state = $1 WHERE id = $2`,
            [state, id]
        );

        // Fetch the updated row
        const updatedResult = await pool.query(
            `SELECT * FROM admin_supplier_links WHERE id = $1`,
            [id]
        );

        if (updatedResult.rows.length === 0) {
            return res.status(404).json({ error: 'Link not found after update' });
        }

        // Update supplier link active status
        const supplierLinkId = updatedResult.rows[0].url.split('/').pop();
        await pool.query(
            `UPDATE supplier_links SET is_active = $1 WHERE id = $2`,
            [state !== 'Frozen', supplierLinkId]
        );

        res.json({ 
            message: 'Link state updated successfully',
            link: updatedResult.rows[0]
        });
    } catch (error) {
        console.error('Error updating link state:', error);
        res.status(500).json({ error: 'Failed to update link state' });
    }
});

// Delete link (soft delete by setting state to Frozen)
router.delete('/links/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get the link details first
        const linkResult = await pool.query(
            `SELECT * FROM admin_supplier_links WHERE id = $1`,
            [id]
        );

        if (linkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Link not found' });
        }

        // Update state to Frozen instead of hard delete
        const result = await pool.query(
            `UPDATE admin_supplier_links SET state = 'Frozen' WHERE id = $1 RETURNING *`,
            [id]
        );

        // Also deactivate the supplier link
        const supplierLinkId = result.rows[0].url.split('/').pop();
        await pool.query(
            `UPDATE supplier_links SET is_active = false WHERE id = $1`,
            [supplierLinkId]
        );

        res.json({ 
            message: 'Link frozen successfully',
            link: result.rows[0]
        });
    } catch (error) {
        console.error('Error freezing link:', error);
        res.status(500).json({ error: 'Failed to freeze link' });
    }
});

// Direct activation endpoint - bypasses OTP authentication
router.post('/links/:id/activate', async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNotes } = req.body;

        // Get the link details first
        const linkResult = await pool.query(
            `SELECT * FROM admin_supplier_links WHERE id = $1`,
            [id]
        );

        if (linkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Link not found' });
        }

        const link = linkResult.rows[0];
        
        // Check if link is already active
        if (link.state === 'Active') {
            return res.status(400).json({ error: 'Link is already active' });
        }

        // Extract supplier link ID from URL
        const supplierLinkId = link.url.split('/').pop();
        
        // Update admin link state to Active
        await pool.query(
            `UPDATE admin_supplier_links SET state = 'Active', admin_notes = COALESCE($1, admin_notes) WHERE id = $2`,
            [adminNotes, id]
        );

        // Activate the supplier link
        await pool.query(
            `UPDATE supplier_links SET is_active = true WHERE id = $1`,
            [supplierLinkId]
        );

        // Create a direct activation record (for audit purposes)
        await pool.query(
            `INSERT INTO supplier_direct_activations (supplier_link_id, activated_by_admin, activated_at, admin_notes) 
             VALUES ($1, 'admin', NOW(), $2)`,
            [supplierLinkId, adminNotes || 'Directly activated by admin']
        );

        // Fetch the updated admin link
        const updatedResult = await pool.query(
            `SELECT * FROM admin_supplier_links WHERE id = $1`,
            [id]
        );

        res.json({ 
            message: 'Link activated successfully - OTP authentication bypassed',
            link: updatedResult.rows[0],
            supplierLinkId: supplierLinkId
        });
    } catch (error) {
        console.error('Error activating link:', error);
        res.status(500).json({ error: 'Failed to activate link' });
    }
});

export default router;
