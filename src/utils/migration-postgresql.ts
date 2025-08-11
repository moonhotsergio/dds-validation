import { Pool } from 'pg';

/**
 * Data Migration Utilities for DDS Validation Project (PostgreSQL Version)
 * Handles migration of existing data to comply with new requirements
 */

const pool = new Pool({
    connectionString: 'postgresql://localhost/dds_validation',
    ssl: false
});

export interface MigrationResult {
    success: boolean;
    message: string;
    recordsProcessed: number;
    recordsFixed: number;
    errors: string[];
    details?: any;
}

export interface NonCompliantRecord {
    id: string;
    poNumber: string | null;
    deliveryId: string | null;
    postcode: string | null;
    issue: string;
    requiredData?: string[];
}

/**
 * Fix missing postcode data by applying default value "1234"
 */
export async function fixMissingPostcodes(): Promise<MigrationResult> {
    const result: MigrationResult = {
        success: false,
        message: '',
        recordsProcessed: 0,
        recordsFixed: 0,
        errors: []
    };

    try {
        // Step 1: Count records missing postcode
        const countQuery = `
            SELECT COUNT(*) as missing_count 
            FROM reference_submissions 
            WHERE delivery_postcode IS NULL OR delivery_postcode = '' OR delivery_postcode = 'null'
        `;
        
        const countResult = await pool.query(countQuery);
        const missingCount = parseInt(countResult.rows[0].missing_count);
        
        if (missingCount === 0) {
            result.success = true;
            result.message = 'No records with missing postcode found';
            result.recordsProcessed = 0;
            result.recordsFixed = 0;
            return result;
        }

        // Step 2: Apply postcode fix
        const updateQuery = `
            UPDATE reference_submissions 
            SET delivery_postcode = '1234', updated_at = NOW()
            WHERE delivery_postcode IS NULL OR delivery_postcode = '' OR delivery_postcode = 'null'
        `;
        
        await pool.query(updateQuery);
        
        result.success = true;
        result.message = `Successfully fixed ${missingCount} records with missing postcode`;
        result.recordsProcessed = missingCount;
        result.recordsFixed = missingCount;
        result.details = {
            defaultPostcode: '1234',
            updatedAt: new Date().toISOString()
        };

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
 * Identify records that don't comply with new requirements
 */
export async function identifyNonCompliantRecords(): Promise<NonCompliantRecord[]> {
    const nonCompliantRecords: NonCompliantRecord[] = [];

    try {
        // Find records missing both PO Number and Delivery ID
        const query = `
            SELECT id, po_number, delivery_id, delivery_postcode
            FROM reference_submissions 
            WHERE (po_number IS NULL OR po_number = '' OR po_number = 'null') 
               AND (delivery_id IS NULL OR delivery_id = '' OR delivery_id = 'null')
        `;
        
        const result = await pool.query(query);
        
        result.rows.forEach((row: any) => {
            nonCompliantRecords.push({
                id: row.id,
                poNumber: row.po_number,
                deliveryId: row.delivery_id,
                postcode: row.delivery_postcode,
                issue: 'Missing both PO Number and Delivery ID',
                requiredData: ['poNumber', 'deliveryId']
            });
        });

        // Find records with other compliance issues
        const otherIssuesQuery = `
            SELECT id, po_number, delivery_id, delivery_postcode
            FROM reference_submissions 
            WHERE reference_number IS NULL OR reference_number = '' OR reference_number = 'null'
        `;
        
        const otherResult = await pool.query(otherIssuesQuery);
        
        otherResult.rows.forEach((row: any) => {
            nonCompliantRecords.push({
                id: row.id,
                poNumber: row.po_number,
                deliveryId: row.delivery_id,
                postcode: row.delivery_postcode,
                issue: 'Missing Reference Number',
                requiredData: ['referenceNumber']
            });
        });

        console.log(`🔍 Found ${nonCompliantRecords.length} non-compliant records`);
        
    } catch (error) {
        console.error('❌ Failed to identify non-compliant records:', error);
    }

    return nonCompliantRecords;
}

/**
 * Generate comprehensive migration report
 */
export async function generateMigrationReport(): Promise<any> {
    try {
        // Get overall statistics
        const statsQuery = `
            SELECT 
                COUNT(*) as total_records,
                COUNT(CASE WHEN delivery_postcode IS NULL OR delivery_postcode = '' OR delivery_postcode = 'null' THEN 1 END) as missing_postcode,
                COUNT(CASE WHEN (po_number IS NULL OR po_number = '' OR po_number = 'null') 
                           AND (delivery_id IS NULL OR delivery_id = '' OR delivery_id = 'null') THEN 1 END) as missing_identifiers,
                COUNT(CASE WHEN reference_number IS NULL OR reference_number = '' OR reference_number = 'null' THEN 1 END) as missing_reference
            FROM reference_submissions
        `;
        
        const statsResult = await pool.query(statsQuery);
        const stats = statsResult.rows[0];
        
        // Get non-compliant records
        const nonCompliantRecords = await identifyNonCompliantRecords();
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalRecords: parseInt(stats.total_records),
                missingPostcode: parseInt(stats.missing_postcode),
                missingIdentifiers: parseInt(stats.missing_identifiers),
                missingReference: parseInt(stats.missing_reference),
                complianceRate: ((parseInt(stats.total_records) - parseInt(stats.missing_postcode) - parseInt(stats.missing_identifiers) - parseInt(stats.missing_reference)) / parseInt(stats.total_records) * 100).toFixed(2) + '%'
            },
            nonCompliantRecords,
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
 * Execute complete data migration
 */
export async function executeDataMigration(): Promise<MigrationResult> {
    const result: MigrationResult = {
        success: false,
        message: '',
        recordsProcessed: 0,
        recordsFixed: 0,
        errors: []
    };

    try {
        console.log('🚀 Starting data migration...');
        
        // Step 1: Generate initial report
        const initialReport = await generateMigrationReport();
        result.recordsProcessed = initialReport.summary.totalRecords;
        
        // Step 2: Fix missing postcodes
        const postcodeResult = await fixMissingPostcodes();
        if (postcodeResult.success) {
            result.recordsFixed += postcodeResult.recordsFixed;
        } else {
            result.errors.push(...postcodeResult.errors);
        }
        
        // Step 3: Generate final report
        const finalReport = await generateMigrationReport();
        
        result.success = result.errors.length === 0;
        result.message = `Data migration completed. ${result.recordsFixed} records fixed.`;
        result.details = {
            initialReport,
            finalReport,
            postcodeMigration: postcodeResult
        };
        
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
 * Validate data compliance after migration
 */
export async function validateDataCompliance(): Promise<boolean> {
    try {
        const report = await generateMigrationReport();
        
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

export default {
    fixMissingPostcodes,
    identifyNonCompliantRecords,
    generateMigrationReport,
    executeDataMigration,
    validateDataCompliance
};
