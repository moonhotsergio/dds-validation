import pool from './connection';

async function migrate() {
    try {
        console.log('Starting database migration...');

        // Drop and recreate admin_supplier_links table
        await pool.query(`DROP TABLE IF EXISTS admin_supplier_links`);
        
        // Create table with simple SQL
        await pool.query(`
            CREATE TABLE admin_supplier_links (
                id TEXT PRIMARY KEY,
                shared_with TEXT NOT NULL,
                url TEXT NOT NULL,
                created_on TEXT,
                state TEXT NOT NULL,
                valid_until TEXT NOT NULL,
                supplier_name TEXT,
                admin_notes TEXT
            )
        `);
        
        console.log('✅ admin_supplier_links table created/verified');

        console.log('🎉 Database migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    migrate().catch(console.error);
}

export default migrate;