import fs from 'fs';
import path from 'path';
import pool from './connection';

async function migrate() {
    try {
        console.log('Running database migration...');
        
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        await pool.query(schema);
        
        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    migrate();
}