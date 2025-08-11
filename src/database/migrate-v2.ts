import pool from './connection';
import { executeDataMigration, validateDataCompliance } from '../utils/migration';
import { migrateSupplierIds, validateAllSupplierIds } from '../utils/id-generator';

/**
 * Phase 2 Migration Script for DDS Validation Project
 * Handles:
 * 1. Data migration for non-compliant records
 * 2. Supplier ID format migration (UUID → XXXX-XXXX)
 * 3. Schema updates for new constraints
 */

async function migratePhase2() {
    console.log('🚀 Starting Phase 2 Migration...');
    
    try {
        // Step 1: Data Migration
        console.log('\n📊 Step 1: Data Migration');
        console.log('========================');
        
        const migrationResult = await executeDataMigration();
        if (migrationResult.success) {
            console.log(`✅ Data migration completed: ${migrationResult.recordsFixed} records fixed`);
        } else {
            console.log('❌ Data migration failed:', migrationResult.errors);
            throw new Error('Data migration failed');
        }
        
        // Step 2: Validate Data Compliance
        console.log('\n🔍 Step 2: Validate Data Compliance');
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
        
        // Step 3: Supplier ID Migration
        console.log('\n🔄 Step 3: Supplier ID Migration');
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
        
        // Step 4: Validate Supplier IDs
        console.log('\n🔍 Step 4: Validate Supplier IDs');
        console.log('================================');
        
        const validationResult = await validateAllSupplierIds();
        console.log(`📊 Supplier ID Validation Results:`);
        console.log(`   Total: ${validationResult.total}`);
        console.log(`   Valid: ${validationResult.valid}`);
        console.log(`   Invalid: ${validationResult.invalid}`);
        
        if (validationResult.invalid > 0) {
            console.log(`   Invalid IDs: ${validationResult.invalidIds.join(', ')}`);
        }
        
        // Step 5: Final Validation
        console.log('\n🔍 Step 5: Final System Validation');
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
    }
}

// Run migration if called directly
if (require.main === module) {
    migratePhase2()
        .then(() => {
            console.log('\n✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}

export default migratePhase2;
