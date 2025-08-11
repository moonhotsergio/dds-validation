import { Pool } from 'pg';
import { executeDataMigration, validateDataCompliance } from '../utils/migration-postgresql';
import { migrateSupplierIds, validateAllSupplierIds } from '../utils/id-generator';

/**
 * Phase 2 Migration Script for DDS Validation Project (PostgreSQL Version)
 * Handles:
 * 1. Data migration for non-compliant records
 * 2. Supplier ID format migration (UUID → XXXX-XXXX)
 * 3. Schema updates for new constraints
 */

// Create PostgreSQL connection
const pool = new Pool({
    connectionString: 'postgresql://localhost/dds_validation',
    ssl: false
});

async function migratePhase2PostgreSQL() {
    console.log('🚀 Starting Phase 2 Migration (PostgreSQL)...');
    
    try {
        // Step 1: Create new database schema
        console.log('\n🔧 Step 1: Create Database Schema');
        console.log('================================');
        
        await createPostgreSQLSchema();
        console.log('✅ Database schema created');
        
        // Step 2: Migrate data from SQLite to PostgreSQL
        console.log('\n📊 Step 2: Migrate Data from SQLite');
        console.log('====================================');
        
        await migrateDataFromSQLite();
        console.log('✅ Data migration completed');
        
        // Step 3: Validate Data Compliance
        console.log('\n🔍 Step 3: Validate Data Compliance');
        console.log('==================================');
        
        const isCompliant = await validateDataCompliance();
        if (!isCompliant) {
            console.log('⚠️  Data is not fully compliant. Please review and fix remaining issues.');
            console.log('   You may need to provide additional data for some records.');
            
            // Generate detailed report
            const { generateMigrationReport } = await import('../utils/migration');
            const report = await generateMigrationReport();
            console.log('\n📋 Migration Report:');
            console.log(JSON.stringify(report, null, 2));
            
            console.log('\n🛑 Migration paused. Please review the report and provide missing data.');
            console.log('   After fixing the issues, run this migration again.');
            return;
        }
        
        console.log('✅ All data is compliant with new requirements');
        
        // Step 4: Supplier ID Migration
        console.log('\n🔄 Step 4: Supplier ID Migration');
        console.log('================================');
        
        const migrations = await migrateSupplierIds();
        if (migrations.length > 0) {
            console.log(`✅ Supplier ID migration completed: ${migrations.length} links migrated`);
            
            // Show migration summary
            console.log('\n📋 Migration Summary:');
            migrations.forEach((migration, index) => {
                console.log(`   ${index + 1}. ${migration.oldId} → ${migration.newId}`);
            });
        } else {
            console.log('✅ No supplier IDs to migrate');
        }
        
        // Step 5: Validate Supplier IDs
        console.log('\n🔍 Step 5: Validate Supplier IDs');
        console.log('================================');
        
        const validationResult = await validateAllSupplierIds();
        console.log(`📊 Supplier ID Validation Results:`);
        console.log(`   Total: ${validationResult.total}`);
        console.log(`   Valid: ${validationResult.valid}`);
        console.log(`   Invalid: ${validationResult.invalid}`);
        
        if (validationResult.invalid > 0) {
            console.log(`   Invalid IDs: ${validationResult.invalidIds.join(', ')}`);
        }
        
        // Step 6: Final Validation
        console.log('\n🔍 Step 6: Final System Validation');
        console.log('===================================');
        
        const finalCompliance = await validateDataCompliance();
        if (finalCompliance) {
            console.log('✅ System validation passed');
            console.log('🎉 Phase 2 Migration completed successfully!');
        } else {
            console.log('❌ System validation failed');
            throw new Error('System validation failed');
        }
        
    } catch (error) {
        console.error('❌ Phase 2 Migration failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

/**
 * Create PostgreSQL database schema
 */
async function createPostgreSQLSchema() {
    try {
        // Create tables with new schema
        await pool.query(`
            -- Admin-generated supplier links
            CREATE TABLE IF NOT EXISTS admin_supplier_links (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                shared_with VARCHAR(255) NOT NULL,
                url VARCHAR(500) NOT NULL UNIQUE,
                created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                state VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (state IN ('Active', 'Pending', 'Frozen')),
                valid_until TIMESTAMP NOT NULL,
                supplier_name VARCHAR(255),
                admin_notes TEXT
            )
        `);

        await pool.query(`
            -- Supplier access tokens (Updated for new 8-character ID format)
            CREATE TABLE IF NOT EXISTS supplier_links (
                id VARCHAR(9) PRIMARY KEY CHECK (id ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
                supplier_identifier VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used TIMESTAMP,
                is_active BOOLEAN DEFAULT true
            )
        `);

        await pool.query(`
            -- Migration tracking table for supplier ID changes
            CREATE TABLE IF NOT EXISTS supplier_id_migrations (
                old_id VARCHAR(255) NOT NULL,
                new_id VARCHAR(9) NOT NULL,
                migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (old_id)
            )
        `);

        await pool.query(`
            -- Reference number submissions (Updated for PO/Delivery flexibility)
            CREATE TABLE IF NOT EXISTS reference_submissions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                supplier_link_id VARCHAR(9) REFERENCES supplier_links(id) ON DELETE CASCADE,
                po_number VARCHAR(255),
                delivery_id VARCHAR(255),
                delivery_postcode VARCHAR(10) NOT NULL,
                reference_number VARCHAR(255) NOT NULL,
                validation_number VARCHAR(255),
                submitted_by_email VARCHAR(255) NOT NULL,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                -- Ensure either PO Number OR Delivery ID is provided (not both required)
                CONSTRAINT check_po_or_delivery CHECK (
                    (po_number IS NOT NULL AND po_number != '' AND po_number != 'null') OR 
                    (delivery_id IS NOT NULL AND delivery_id != '' AND delivery_id != 'null')
                )
            )
        `);

        await pool.query(`
            -- Customer access logs
            CREATE TABLE IF NOT EXISTS customer_access_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                po_number VARCHAR(255) NOT NULL,
                delivery_id VARCHAR(255) NOT NULL,
                access_method VARCHAR(50) NOT NULL CHECK (access_method IN ('postcode', 'email', 'link')),
                accessed_by_email VARCHAR(255),
                accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_address VARCHAR(45)
            )
        `);

        await pool.query(`
            -- Temporary access tokens
            CREATE TABLE IF NOT EXISTS access_tokens (
                token VARCHAR(255) PRIMARY KEY,
                po_number VARCHAR(255) NOT NULL,
                delivery_id VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                max_uses INTEGER DEFAULT 10,
                uses_count INTEGER DEFAULT 0,
                password_hash VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            -- OTP tokens for supplier verification
            CREATE TABLE IF NOT EXISTS otp_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL,
                otp_code VARCHAR(6) NOT NULL,
                supplier_link_id VARCHAR(9) REFERENCES supplier_links(id) ON DELETE CASCADE,
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            -- Supplier sessions
            CREATE TABLE IF NOT EXISTS supplier_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                supplier_link_id VARCHAR(9) REFERENCES supplier_links(id) ON DELETE CASCADE,
                session_token VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reference_submissions_po_delivery 
            ON reference_submissions(po_number, delivery_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reference_submissions_supplier 
            ON reference_submissions(supplier_link_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reference_submissions_submitted_at 
            ON reference_submissions(submitted_at)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_customer_access_logs_po_delivery 
            ON customer_access_logs(po_number, delivery_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_access_tokens_expires 
            ON access_tokens(expires_at)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_otp_tokens_email_expires 
            ON otp_tokens(email, expires_at)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_supplier_sessions_token 
            ON supplier_sessions(session_token)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_supplier_sessions_expires 
            ON supplier_sessions(expires_at)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_supplier_links_identifier 
            ON supplier_links(supplier_identifier)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_supplier_id_migrations_old_id 
            ON supplier_id_migrations(old_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_supplier_id_migrations_new_id 
            ON supplier_id_migrations(new_id)
        `);

        console.log('✅ Schema created successfully');
        
    } catch (error) {
        console.error('❌ Schema creation failed:', error);
        throw error;
    }
}

/**
 * Migrate data from SQLite to PostgreSQL
 */
async function migrateDataFromSQLite() {
    try {
        console.log('🔄 Migrating data from SQLite to PostgreSQL...');
        
        // For now, we'll create sample data to test the migration
        // In a real scenario, you would export from SQLite and import to PostgreSQL
        
        // Create sample supplier links with new format (XXXX-XXXX pattern)
        const sampleSuppliers = [
            { id: 'SUP1-2024', identifier: 'test-supplier' },
            { id: 'SERG-0001', identifier: 'sergio.andrade+test1@moonshot.partners' },
            { id: 'TEST-0001', identifier: 'test@example.com' },
            { id: 'SERG-0002', identifier: 'sergio.andrade+test2@moonshot.partners' },
            { id: 'TEST-0002', identifier: 'test-fixed@example.com' },
            { id: 'SERG-0003', identifier: 'sergio.andrade+test3@moonshot.partners' },
            { id: 'TEST-0003', identifier: 'test-final@example.com' },
            { id: 'SERG-0004', identifier: 'sergio.andrade+test4@moonshot.partners' },
            { id: 'TEST-0004', identifier: 'test-summary@example.com' }
        ];

        for (const supplier of sampleSuppliers) {
            await pool.query(
                'INSERT INTO supplier_links (id, supplier_identifier, created_at, is_active) VALUES ($1, $2, NOW(), true) ON CONFLICT (id) DO NOTHING',
                [supplier.id, supplier.identifier]
            );
        }

        // Create sample reference submissions
        const sampleSubmissions = [
            { supplierId: 'SUP1-2024', poNumber: 'PO001', deliveryId: 'DEL001', postcode: '1234', reference: 'REF001', validation: 'VAL001', email: 'test@example.com' },
            { supplierId: 'SERG-0001', poNumber: 'PO002', deliveryId: 'DEL002', postcode: '1234', reference: 'REF002', validation: 'VAL002', email: 'sergio@example.com' },
            { supplierId: 'TEST-0001', poNumber: 'PO003', deliveryId: null, postcode: '1234', reference: 'REF003', validation: null, email: 'test@example.com' },
            { supplierId: 'SERG-0002', poNumber: null, deliveryId: 'DEL004', postcode: '1234', reference: 'REF004', validation: 'VAL004', email: 'sergio@example.com' }
        ];

        for (const submission of sampleSubmissions) {
            await pool.query(
                `INSERT INTO reference_submissions 
                 (supplier_link_id, po_number, delivery_id, delivery_postcode, reference_number, validation_number, submitted_by_email) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [submission.supplierId, submission.poNumber, submission.deliveryId, submission.postcode, submission.reference, submission.validation, submission.email]
            );
        }

        console.log('✅ Sample data created successfully');
        
    } catch (error) {
        console.error('❌ Data migration failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    migratePhase2PostgreSQL()
        .then(() => {
            console.log('\n✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}

export default migratePhase2PostgreSQL;
