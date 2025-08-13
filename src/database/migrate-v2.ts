import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/dds_validation'
});

async function migrateToV2() {
    const client = await pool.connect();
    
    try {
        console.log('Starting V2 migration...');
        await client.query('BEGIN');
        
        // Create V2 tables
        console.log('Creating V2 tables...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS organisations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS connections (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
                organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
                token VARCHAR(9) NOT NULL UNIQUE CHECK (token ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used TIMESTAMP,
                UNIQUE(admin_user_id, organisation_id)
            );
            
            CREATE TABLE IF NOT EXISTS reference_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                po_number VARCHAR(255),
                delivery_id VARCHAR(255),
                reference_number VARCHAR(255) NOT NULL,
                validation_number VARCHAR(255),
                direction VARCHAR(20) NOT NULL CHECK (direction IN ('sent', 'received')),
                submitted_by_email VARCHAR(255),
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT check_po_or_delivery CHECK (
                    (po_number IS NOT NULL AND po_number != '' AND po_number != 'null') OR 
                    (delivery_id IS NOT NULL AND delivery_id != '' AND delivery_id != 'null')
                )
            );
        `);
        
        // Create indexes
        console.log('Creating indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_connections_token ON connections(token);
            CREATE INDEX IF NOT EXISTS idx_connections_admin_org ON connections(admin_user_id, organisation_id);
            CREATE INDEX IF NOT EXISTS idx_connections_is_active ON connections(is_active);
            CREATE INDEX IF NOT EXISTS idx_reference_events_connection ON reference_events(connection_id);
            CREATE INDEX IF NOT EXISTS idx_reference_events_direction ON reference_events(direction);
            CREATE INDEX IF NOT EXISTS idx_reference_events_submitted_at ON reference_events(submitted_at);
            CREATE INDEX IF NOT EXISTS idx_reference_events_po_delivery ON reference_events(po_number, delivery_id);
        `);
        
        // Seed admin users
        console.log('Seeding admin users...');
        const passwordHash = await bcrypt.hash('Moonshot2020!', 10);
        
        await client.query(`
            INSERT INTO admin_users (email, password_hash) VALUES 
                ('sergio.andrade@moonshot.partners', $1),
                ('sa@iov42.com', $2)
            ON CONFLICT (email) DO NOTHING
        `, [passwordHash, passwordHash]);
        
        // Insert sample organisations
        console.log('Inserting sample organisations...');
        await client.query(`
            INSERT INTO organisations (name) VALUES 
                ('Acme Corporation'),
                ('Tech Solutions Ltd'),
                ('Global Industries'),
                ('Innovation Corp')
            ON CONFLICT (name) DO NOTHING
        `);
        
        await client.query('COMMIT');
        console.log('V2 migration completed successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

if (require.main === module) {
    migrateToV2()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

export { migrateToV2 };
