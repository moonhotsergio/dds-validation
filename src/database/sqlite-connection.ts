import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

// SQLite wrapper to provide pg-like interface
class SQLiteWrapper {
    private db: sqlite3.Database;
    private runAsync: (sql: string, params?: any[]) => Promise<any>;
    private getAsync: (sql: string, params?: any[]) => Promise<any>;
    private allAsync: (sql: string, params?: any[]) => Promise<any[]>;

    constructor(dbPath: string) {
        this.db = new sqlite3.Database(dbPath);
        this.runAsync = promisify(this.db.run.bind(this.db));
        this.getAsync = promisify(this.db.get.bind(this.db));
        this.allAsync = promisify(this.db.all.bind(this.db));
    }

    async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
        // Convert PostgreSQL syntax to SQLite
        const sqliteSql = this.convertPostgresToSQLite(sql);
        
        if (sqliteSql.trim().toLowerCase().startsWith('select')) {
            const rows = await this.allAsync(sqliteSql, params);
            return { rows: rows || [] };
        } else {
            const result = await this.runAsync(sqliteSql, params);
            return { rows: result ? [result] : [] };
        }
    }

    private convertPostgresToSQLite(sql: string): string {
        return sql
            // Convert UUID functions
            .replace(/gen_random_uuid\(\)/g, "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || '4' || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))")
            // Convert NOW() to datetime('now')
            .replace(/NOW\(\)/g, "datetime('now')")
            // Convert CURRENT_TIMESTAMP
            .replace(/CURRENT_TIMESTAMP/g, "datetime('now')")
            // Convert TIMESTAMP to TEXT (SQLite doesn't have TIMESTAMP)
            .replace(/TIMESTAMP/g, 'TEXT')
            // Convert UUID to TEXT
            .replace(/UUID/g, 'TEXT')
            // Convert VARCHAR to TEXT
            .replace(/VARCHAR\(\d+\)/g, 'TEXT')
            // Convert BOOLEAN to INTEGER
            .replace(/BOOLEAN/g, 'INTEGER')
            // Remove PostgreSQL-specific constraints
            .replace(/DEFAULT gen_random_uuid\(\)/g, '')
            // Remove CHECK constraints for now (can be added back if needed)
            .replace(/CHECK \([^)]+\)/g, '');
    }

    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

// Create database instance
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(process.cwd(), 'database.sqlite');
const sqliteDb = new SQLiteWrapper(dbPath);

export default sqliteDb;