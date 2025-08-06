import fs from 'fs';
import path from 'path';
import sqliteDb from './sqlite-connection';

async function migrate() {
    try {
        console.log('Running SQLite database migration...');
        
        const schemaPath = path.join(__dirname, 'sqlite-schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Split schema into individual statements
        const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);
        
        for (const statement of statements) {
            await sqliteDb.query(statement + ';');
        }
        
        console.log('SQLite migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('SQLite migration failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    migrate();
}