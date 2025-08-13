import { Router, Request, Response } from 'express';
import { adminLogin, generateAdminToken, verifyAdminToken, AdminRequest } from '../middleware/adminAuth';
import pool from '../database/connection';
import bcrypt from 'bcrypt';

const router = Router();

// Admin login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        const loginResult = await adminLogin(email, password);
        
        if (!loginResult.success) {
            return res.status(401).json({ error: loginResult.error });
        }
        
        // Set JWT token as HTTP-only cookie
        res.cookie('adminToken', loginResult.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        res.json({
            success: true,
            admin: loginResult.admin,
            message: 'Login successful'
        });
        
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Admin logout
router.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('adminToken');
    res.json({ success: true, message: 'Logout successful' });
});

// Admin registration (for development/testing only)
router.post('/register', async (req: Request, res: Response) => {
    try {
        // Only allow registration in development
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Registration not allowed in production' });
        }
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long' });
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        
        // Check if admin already exists
        const existingAdmin = await pool.query(
            'SELECT id FROM admin_users WHERE email = $1',
            [email]
        );
        
        if (existingAdmin.rows.length > 0) {
            return res.status(400).json({ error: 'Admin user already exists' });
        }
        
        // Create admin user
        const result = await pool.query(
            'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
            [email, passwordHash]
        );
        
        res.status(201).json({
            success: true,
            admin: result.rows[0],
            message: 'Admin user created successfully'
        });
        
    } catch (error) {
        console.error('Admin registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Get current admin user info
router.get('/me', verifyAdminToken, async (req: AdminRequest, res: Response) => {
    try {
        if (!req.adminUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        res.json({
            success: true,
            admin: req.adminUser
        });
        
    } catch (error) {
        console.error('Get admin info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
