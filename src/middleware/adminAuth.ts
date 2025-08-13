import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../database/connection';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AdminRequest extends Request {
    adminUser?: {
        id: string;
        email: string;
    };
}

// Middleware to verify admin JWT token
export const verifyAdminToken = async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
        
        // Verify admin still exists in database
        const result = await pool.query(
            'SELECT id, email FROM admin_users WHERE id = $1 AND email = $2',
            [decoded.id, decoded.email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        
        req.adminUser = result.rows[0];
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Admin login function
export const adminLogin = async (email: string, password: string) => {
    try {
        const result = await pool.query(
            'SELECT id, email, password_hash FROM admin_users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return { success: false, error: 'Invalid credentials' };
        }
        
        const admin = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, admin.password_hash);
        
        if (!isValidPassword) {
            return { success: false, error: 'Invalid credentials' };
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { id: admin.id, email: admin.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        return { success: true, token, admin: { id: admin.id, email: admin.email } };
    } catch (error) {
        console.error('Admin login error:', error);
        return { success: false, error: 'Login failed' };
    }
};

// Generate admin JWT token
export const generateAdminToken = (adminId: string, email: string) => {
    return jwt.sign(
        { id: adminId, email },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};
