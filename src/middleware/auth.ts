import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../database/connection';

export interface AuthRequest extends Request {
    supplierLinkId?: string;
    email?: string;
}

export const authenticateSupplier = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // First, try to decode as a bypass token (for active links)
        try {
            const bypassData = JSON.parse(Buffer.from(token, 'base64').toString());
            if (bypassData.isActive && bypassData.supplierLinkId) {
                // Verify the supplier link is still active
                const supplierResult = await pool.query(
                    'SELECT is_active FROM supplier_links WHERE id = $1',
                    [bypassData.supplierLinkId]
                );
                
                if (supplierResult.rows.length > 0 && supplierResult.rows[0].is_active) {
                    req.supplierLinkId = bypassData.supplierLinkId;
                    req.email = undefined; // Bypass tokens don't have email
                    return next();
                }
            }
        } catch (bypassError: any) {
            // Not a bypass token, continue with normal JWT validation
        }

        // Normal JWT token validation
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
        
        // Verify session exists and is not expired
        // Convert current time to timestamp for SQLite comparison
        const currentTimestamp = Date.now();
        const sessionResult = await pool.query(
            'SELECT supplier_link_id, email FROM supplier_sessions WHERE session_token = $1 AND expires_at > $2',
            [token, currentTimestamp]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        req.supplierLinkId = sessionResult.rows[0].supplier_link_id;
        req.email = sessionResult.rows[0].email;
        
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};