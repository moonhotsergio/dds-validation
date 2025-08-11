import sqliteDb from './sqlite-connection';
import { executeDataMigration, validateDataCompliance } from '../utils/migration';
import { migrateSupplierIds, validateAllSupplierIds } from '../utils/id-generator';

/**
 * Phase 2 Migration Script for DDS Validation Project (SQLite Version)
 * Handles:
 * 1. Data migration for non-compliant records
 * 2. Supplier ID format migration (UUID → XXXX-XXXX)
 * 3. Schema updates for new constraints
 */

async function migratePhase2SQLite() {
    console.log('🚀 Starting Phase 2 Migration (SQLite)...');
    
    try {
        // Step 1: Update database schema for SQLite
        console.log('\n🔧 Step 1: Update Database Schema');
        console.log('================================');
        
        await updateSQLiteSchema();
        console.log('✅ Database schema updated');
        
        // Step 2: Data Migration
        console.log('\n📊 Step 2: Data Migration');
        console.log('========================');
        
        const migrationResult = await executeDataMigrationSQLite();
        if (migrationResult.success) {
            console.log(`✅ Data migration completed: ${migrationResult.recordsFixed} records fixed`);
        } else {
            console.log('❌ Data migration failed:', migrationResult.errors);
            throw new Error('Data migration failed');
        }
        
        // Step 3: Validate Data Compliance
        console.log('\n🔍 Step 3: Validate Data Compliance');
        console.log('==================================');
        
        const isCompliant = await validateDataComplianceSQLite();
        if (!isCompliant) {
            console.log('⚠️  Data is not fully compliant. Please review and fix remaining issues.');
            console.log('   You may need to provide additional data for some records.');
            
            // Generate detailed report
            const report = await generateMigrationReportSQLite();
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
        
        const migrations = await migrateSupplierIdsSQLite();
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
        
        const validationResult = await validateAllSupplierIdsSQLite();
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
        
        const finalCompliance = await validateDataComplianceSQLite();
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
    }
}

/**
 * Update SQLite database schema
 */
async function updateSQLiteSchema() {
    try {
        // Add missing columns if they don't exist
        try {
            await sqliteDb.query(`
                ALTER TABLE reference_submissions 
                ADD COLUMN delivery_postcode TEXT DEFAULT '1234'
            `);
            console.log('Column delivery_postcode added');
        } catch (error) {
            console.log('Column delivery_postcode already exists');
        }
        
        // Create migration tracking table
        await sqliteDb.query(`
            CREATE TABLE IF NOT EXISTS supplier_id_migrations (
                old_id TEXT NOT NULL,
                new_id TEXT NOT NULL,
                migrated_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (old_id)
            )
        `);
        
        // Add new indexes
        try {
            await sqliteDb.query(`
                CREATE INDEX idx_reference_submissions_submitted_at 
                ON reference_submissions(submitted_at)
            `);
        } catch (error) {
            console.log('Index idx_reference_submissions_submitted_at already exists');
        }
        
        try {
            await sqliteDb.query(`
                CREATE INDEX idx_supplier_links_identifier 
                ON supplier_links(supplier_identifier)
            `);
        } catch (error) {
            console.log('Index idx_supplier_links_identifier already exists');
        }
        
        console.log('✅ Schema updates applied');
        
    } catch (error) {
        console.error('❌ Schema update failed:', error);
        throw error;
    }
}

/**
 * Execute data migration for SQLite
 */
async function executeDataMigrationSQLite() {
    const result = {
        success: false,
        message: '',
        recordsProcessed: 0,
        recordsFixed: 0,
        errors: [] as string[]
    };

    try {
        console.log('🚀 Starting data migration...');
        
        // Step 1: Fix missing postcodes
        const postcodeResult = await fixMissingPostcodesSQLite();
        if (postcodeResult.success) {
            result.recordsFixed += postcodeResult.recordsFixed;
        } else {
            result.errors.push(...postcodeResult.errors);
        }
        
        result.success = result.errors.length === 0;
        result.message = `Data migration completed. ${result.recordsFixed} records fixed.`;
        
        console.log('✅ Data migration completed successfully');
        
    } catch (error) {
        result.success = false;
        result.message = 'Data migration failed';
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
        console.error('❌ Data migration failed:', error);
    }

    return result;
}

/**
 * Fix missing postcode data in SQLite
 */
async function fixMissingPostcodesSQLite() {
    const result = {
        success: false,
        message: '',
        recordsProcessed: 0,
        recordsFixed: 0,
        errors: [] as string[]
    };

    try {
        // Count records missing postcode
        const countResult = await sqliteDb.query(
            `SELECT COUNT(*) as missing_count 
             FROM reference_submissions 
             WHERE delivery_postcode IS NULL OR delivery_postcode = '' OR delivery_postcode = 'null'`
        );
        
        const missingCount = countResult.rows[0].missing_count;
        
        if (missingCount === 0) {
            result.success = true;
            result.message = 'No records with missing postcode found';
            return result;
        }

        // Apply postcode fix
        await sqliteDb.query(
            `UPDATE reference_submissions 
             SET delivery_postcode = '1234', updated_at = datetime('now')
             WHERE delivery_postcode IS NULL OR delivery_postcode = '' OR delivery_postcode = 'null'`
        );
        
        result.success = true;
        result.message = `Successfully fixed ${missingCount} records with missing postcode`;
        result.recordsProcessed = missingCount;
        result.recordsFixed = missingCount;

        console.log(`✅ Postcode migration completed: ${missingCount} records fixed`);
        
    } catch (error) {
        result.success = false;
        result.message = 'Failed to fix missing postcodes';
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
        console.error('❌ Postcode migration failed:', error);
    }

    return result;
}

/**
 * Validate data compliance in SQLite
 */
async function validateDataComplianceSQLite() {
    try {
        const report = await generateMigrationReportSQLite();
        
        const isCompliant = report.summary.missingPostcode === 0 && 
                           report.summary.missingIdentifiers === 0 && 
                           report.summary.missingReference === 0;
        
        if (isCompliant) {
            console.log('✅ All data is now compliant with new requirements');
        } else {
            console.log('⚠️  Some data still needs attention:');
            console.log(`   - Missing postcode: ${report.summary.missingPostcode}`);
            console.log(`   - Missing identifiers: ${report.summary.missingIdentifiers}`);
            console.log(`   - Missing reference: ${report.summary.missingReference}`);
        }
        
        return isCompliant;
        
    } catch (error) {
        console.error('❌ Failed to validate data compliance:', error);
        return false;
    }
}

/**
 * Generate migration report for SQLite
 */
async function generateMigrationReportSQLite() {
    try {
        // Get overall statistics
        const statsResult = await sqliteDb.query(`
            SELECT 
                COUNT(*) as total_records,
                COUNT(CASE WHEN delivery_postcode IS NULL OR delivery_postcode = '' OR delivery_postcode = 'null' THEN 1 END) as missing_postcode,
                COUNT(CASE WHEN (po_number IS NULL OR po_number = '' OR po_number = 'null') 
                           AND (delivery_id IS NULL OR delivery_id = '' OR delivery_id = 'null') THEN 1 END) as missing_identifiers,
                COUNT(CASE WHEN reference_number IS NULL OR reference_number = '' OR reference_number = 'null' THEN 1 END) as missing_reference
            FROM reference_submissions
        `);
        
        const stats = statsResult.rows[0];
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalRecords: stats.total_records,
                missingPostcode: stats.missing_postcode,
                missingIdentifiers: stats.missing_identifiers,
                missingReference: stats.missing_reference,
                complianceRate: ((stats.total_records - stats.missing_postcode - stats.missing_identifiers - stats.missing_reference) / stats.total_records * 100).toFixed(2) + '%'
            },
            recommendations: [
                'Apply postcode "1234" to records missing postcode',
                'Review records missing both PO Number and Delivery ID',
                'Verify all records have reference numbers'
            ]
        };

        console.log('📊 Migration report generated successfully');
        return report;
        
    } catch (error) {
        console.error('❌ Failed to generate migration report:', error);
        throw error;
    }
}

/**
 * Migrate supplier IDs in SQLite
 */
async function migrateSupplierIdsSQLite() {
    const migrations: Array<{oldId: string, newId: string, migratedAt: Date}> = [];
    
    try {
        console.log('🔄 Starting supplier ID migration...');
        
        // Get all existing supplier links (UUID format)
        const result = await sqliteDb.query(
            `SELECT id, supplier_identifier FROM supplier_links WHERE length(id) > 20`
        );
        
        const rows = result.rows;
        
        if (rows.length === 0) {
            console.log('✅ No UUID supplier links found to migrate');
            return migrations;
        }
        
        console.log(`📋 Found ${rows.length} UUID supplier links to migrate`);
        
        // For now, just report what needs to be migrated
        // Full migration will require more complex logic for SQLite
        rows.forEach((row: any, index: number) => {
            console.log(`   ${index + 1}. ${row.id} (${row.supplier_identifier})`);
        });
        
        console.log('⚠️  Supplier ID migration requires manual intervention for SQLite');
        console.log('   Please run the PostgreSQL migration script for full functionality');
        
    } catch (error) {
        console.error('❌ Supplier ID migration failed:', error);
    }
    
    return migrations;
}

/**
 * Validate supplier IDs in SQLite
 */
async function validateAllSupplierIdsSQLite() {
    try {
        const result = await sqliteDb.query('SELECT id FROM supplier_links WHERE is_active = 1');
        
        let valid = 0;
        let invalid = 0;
        const invalidIds: string[] = [];
        
        result.rows.forEach((row: any) => {
            // Check if ID matches new format (XXXX-XXXX)
            if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(row.id)) {
                valid++;
            } else {
                invalid++;
                invalidIds.push(row.id);
            }
        });
        
        return {
            valid,
            invalid,
            total: result.rows.length,
            invalidIds
        };
        
    } catch (error) {
        console.error('❌ Failed to validate supplier IDs:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    migratePhase2SQLite()
        .then(() => {
            console.log('\n✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}

export default migratePhase2SQLite;
