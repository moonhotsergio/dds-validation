import { Pool } from 'pg';
import dotenv from 'dotenv';
import sqliteDb from './sqlite-connection';

dotenv.config();

// Use SQLite for development/testing, PostgreSQL for production
const usePostgreSQL = process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://');

let pool: any;

if (usePostgreSQL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
} else {
    // Use SQLite wrapper that provides pg-like interface
    pool = sqliteDb;
}

export default pool;