import { Router, Request, Response } from 'express';
import pool from '../database/connection';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Submit reference from organisation (direction = 'sent')
router.post('/:id/submit', async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // This is the connection token (XXXX-XXXX format)
        const { poNumber, deliveryId, referenceNumber, validationNumber } = req.body;
        
        // Validate required fields
        if (!referenceNumber || (!poNumber && !deliveryId)) {
            return res.status(400).json({ 
                error: 'Reference number and either PO number or delivery ID are required' 
            });
        }
        
        // Validate token format
        if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) {
            return res.status(400).json({ error: 'Invalid connection token format' });
        }
        
        // Get connection details
        const connection = await pool.query(
            `SELECT c.id, c.is_active, o.name as organisation_name
             FROM connections c
             JOIN organisations o ON c.organisation_id = o.id
             WHERE c.token = $1`,
            [id]
        );
        
        if (connection.rows.length === 0) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        
        if (!connection.rows[0].is_active) {
            return res.status(403).json({ error: 'Connection is not active' });
        }
        
        // Create reference event (direction = 'sent' from org perspective)
        const result = await pool.query(
            `INSERT INTO reference_events (
                connection_id, po_number, delivery_id, reference_number, 
                validation_number, direction, submitted_by_email
            ) VALUES ($1, $2, $3, $4, $5, 'sent', $6) RETURNING *`,
            [
                connection.rows[0].id,
                poNumber || null,
                deliveryId || null,
                referenceNumber,
                validationNumber || null,
                req.body.email || null
            ]
        );
        
        // Update last_used timestamp
        await pool.query(
            'UPDATE connections SET last_used = CURRENT_TIMESTAMP WHERE id = $1',
            [connection.rows[0].id]
        );
        
        res.status(201).json({
            success: true,
            reference: result.rows[0],
            organisation: connection.rows[0].organisation_name
        });
        
    } catch (error) {
        console.error('Error submitting reference:', error);
        res.status(500).json({ error: 'Failed to submit reference' });
    }
});

// Get organisation's submitted references with direction filtering
router.get('/:id/history', async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // Connection token
        const { direction } = req.query; // Filter by direction: 'sent', 'received', or undefined for all
        
        // Validate token format
        if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) {
            return res.status(400).json({ error: 'Invalid connection token format' });
        }
        
        // Build query based on direction filter
        let query = `
            SELECT re.*, o.name as organisation_name
            FROM reference_events re
            JOIN connections c ON re.connection_id = c.id
            JOIN organisations o ON c.organisation_id = o.id
            WHERE c.token = $1
        `;
        
        let params = [id];
        
        // Add direction filter if specified
        if (direction && (direction === 'sent' || direction === 'received')) {
            query += ` AND re.direction = $2`;
            params.push(direction);
        }
        
        query += ` ORDER BY re.submitted_at DESC`;
        
        // Get references based on filter
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            references: result.rows,
            organisation: result.rows[0]?.organisation_name || 'Unknown'
        });
        
    } catch (error) {
        console.error('Error fetching organisation history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Get references sent by admin to organisation (direction = 'received')
router.get('/:id/retrieve', async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // Connection token
        
        // Validate token format
        if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) {
            return res.status(400).json({ error: 'Invalid connection token format' });
        }
        
        // Get references sent by admin to organisation
        const result = await pool.query(
            `SELECT re.*, o.name as organisation_name
             FROM reference_events re
             JOIN connections c ON re.connection_id = c.id
             JOIN organisations o ON c.organisation_id = o.id
             WHERE c.token = $1 AND re.direction = 'received'
             ORDER BY re.submitted_at DESC`,
            [id]
        );
        
        res.json({
            success: true,
            references: result.rows,
            organisation: result.rows[0]?.organisation_name || 'Unknown'
        });
        
    } catch (error) {
        console.error('Error fetching admin references:', error);
        res.status(500).json({ error: 'Failed to fetch references' });
    }
});

// Get connection info (public info only)
router.get('/:id/info', async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // Connection token
        
        // Validate token format
        if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) {
            return res.status(400).json({ error: 'Invalid connection token format' });
        }
        
        // Get connection info
        const result = await pool.query(
            `SELECT c.token, c.is_active, c.created_at, c.last_used,
                    o.name as organisation_name
             FROM connections c
             JOIN organisations o ON c.organisation_id = o.id
             WHERE c.token = $1`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        
        res.json({
            success: true,
            connection: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error fetching connection info:', error);
        res.status(500).json({ error: 'Failed to fetch connection info' });
    }
});

export default router;
