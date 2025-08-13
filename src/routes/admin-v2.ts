import { Router, Request, Response } from 'express';
import { verifyAdminToken, AdminRequest } from '../middleware/adminAuth';
import pool from '../database/connection';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Apply admin authentication to all routes
router.use(verifyAdminToken);

// Get all organisations with search capability
router.get('/organisations', async (req: Request, res: Response) => {
    try {
        const { search } = req.query;
        let query = 'SELECT id, name, created_at FROM organisations ORDER BY name';
        let params: string[] = [];
        
        if (search && typeof search === 'string') {
            query = 'SELECT id, name, created_at FROM organisations WHERE name ILIKE $1 ORDER BY name';
            params = [`%${search}%`];
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching organisations:', error);
        res.status(500).json({ error: 'Failed to fetch organisations' });
    }
});

// Create a new connection between admin and organisation
router.post('/connections', async (req: AdminRequest, res: Response) => {
    try {
        const { organisationId } = req.body;
        const adminUserId = req.adminUser?.id;
        
        if (!adminUserId || !organisationId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Check if connection already exists
        const existingConnection = await pool.query(
            'SELECT id FROM connections WHERE admin_user_id = $1 AND organisation_id = $2',
            [adminUserId, organisationId]
        );
        
        if (existingConnection.rows.length > 0) {
            return res.status(400).json({ error: 'Connection already exists' });
        }
        
        // Generate unique token
        const token = generateUniqueToken();
        
        // Create connection
        const result = await pool.query(
            `INSERT INTO connections (admin_user_id, organisation_id, token) 
             VALUES ($1, $2, $3) RETURNING *`,
            [adminUserId, organisationId, token]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating connection:', error);
        res.status(500).json({ error: 'Failed to create connection' });
    }
});

// Get connection details
router.get('/connections/:id', async (req: AdminRequest, res: Response) => {
    try {
        const { id } = req.params;
        const adminUserId = req.adminUser?.id;
        
        const result = await pool.query(
            `SELECT c.*, o.name as organisation_name, o.created_at as organisation_created
             FROM connections c
             JOIN organisations o ON c.organisation_id = o.id
             WHERE c.id = $1 AND c.admin_user_id = $2`,
            [id, adminUserId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching connection:', error);
        res.status(500).json({ error: 'Failed to fetch connection' });
    }
});

// Get connection history with direction filtering
// Note: Direction is flipped for admin view (opposite of organisation's perspective)
router.get('/connections/:id/history', async (req: AdminRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { direction = 'all' } = req.query;
        const adminUserId = req.adminUser?.id;
        
        let query = `
            SELECT 
                re.id,
                re.connection_id,
                re.po_number,
                re.delivery_id,
                re.reference_number,
                re.validation_number,
                -- Flip direction for admin view: 'sent' becomes 'received', 'received' becomes 'sent'
                CASE 
                    WHEN re.direction = 'sent' THEN 'received'
                    WHEN re.direction = 'received' THEN 'sent'
                    ELSE re.direction
                END as direction,
                re.submitted_by_email,
                re.submitted_at,
                c.token as connection_token
            FROM reference_events re
            JOIN connections c ON re.connection_id = c.id
            WHERE c.id = $1 AND c.admin_user_id = $2
        `;
        let params = [id, adminUserId];
        
        if (direction !== 'all') {
            // Also flip the direction filter for admin view
            const flippedDirection = direction === 'sent' ? 'received' : 'sent';
            query += ' AND re.direction = $3';
            params.push(flippedDirection as string);
        }
        
        query += ' ORDER BY re.submitted_at DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching connection history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Admin submit reference to organisation (direction = 'received' from org perspective)
router.post('/connections/:id/submit', async (req: AdminRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { poNumber, deliveryId, referenceNumber, validationNumber } = req.body;
        const adminUserId = req.adminUser?.id;
        
        // Validate required fields
        if (!referenceNumber || (!poNumber && !deliveryId)) {
            return res.status(400).json({ 
                error: 'Reference number and either PO number or delivery ID are required' 
            });
        }
        
        // Verify connection belongs to admin
        const connection = await pool.query(
            'SELECT id FROM connections WHERE id = $1 AND admin_user_id = $2',
            [id, adminUserId]
        );
        
        if (connection.rows.length === 0) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        
        // Create reference event (direction = 'received' from org perspective)
        const result = await pool.query(
            `INSERT INTO reference_events (
                connection_id, po_number, delivery_id, reference_number, 
                validation_number, direction, submitted_by_email
            ) VALUES ($1, $2, $3, $4, $5, 'received', $6) RETURNING *`,
            [id, poNumber || null, deliveryId || null, referenceNumber, validationNumber || null, req.adminUser?.email]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error submitting reference:', error);
        res.status(500).json({ error: 'Failed to submit reference' });
    }
});

// Get all connections for admin
router.get('/connections', async (req: AdminRequest, res: Response) => {
    try {
        const adminUserId = req.adminUser?.id;
        
        const result = await pool.query(
            `SELECT c.*, o.name as organisation_name, o.created_at as organisation_created
             FROM connections c
             JOIN organisations o ON c.organisation_id = o.id
             WHERE c.admin_user_id = $1
             ORDER BY c.created_at DESC`,
            [adminUserId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching connections:', error);
        res.status(500).json({ error: 'Failed to fetch connections' });
    }
});

// Helper function to generate unique token
function generateUniqueToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    
    // Generate first part (4 chars)
    for (let i = 0; i < 4; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    token += '-';
    
    // Generate second part (4 chars)
    for (let i = 0; i < 4; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return token;
}

export default router;
