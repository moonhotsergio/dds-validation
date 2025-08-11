import { Pool } from 'pg';
import sqliteDb from './sqlite-connection';

/**
 * Admin Data Migration Script
 * Migrates admin-generated supplier links from SQLite to PostgreSQL
 */

const postgresPool = new Pool({
    connectionString: 'postgresql://localhost/dds_validation',
    ssl: false
});

async function migrateAdminData() {
    console.log('🚀 Starting Admin Data Migration...');
    
    try {
        // Step 1: Get admin data from SQLite
        console.log('\n📊 Step 1: Reading Admin Data from SQLite');
        console.log('==========================================');
        
        const adminLinksQuery = `
            SELECT id, shared_with, url, created_on, state, valid_until, supplier_name, admin_notes
            FROM admin_supplier_links
        `;
        
        const adminLinks = await sqliteDb.query(adminLinksQuery);
        console.log(`✅ Found ${adminLinks.rows.length} admin links in SQLite`);
        
        if (adminLinks.rows.length === 0) {
            console.log('ℹ️  No admin data to migrate');
            return;
        }
        
        // Step 2: Link existing supplier IDs to admin links
        console.log('\n🔄 Step 2: Linking Existing Supplier IDs');
        console.log('=========================================');
        
        for (const link of adminLinks.rows) {
            try {
                // Extract supplier email from the shared_with field
                const supplierEmail = link.shared_with;
                
                // Find existing supplier link in PostgreSQL
                const supplierQuery = await postgresPool.query(
                    'SELECT id FROM supplier_links WHERE supplier_identifier = $1',
                    [supplierEmail]
                );
                
                if (supplierQuery.rows.length === 0) {
                    console.log(`   ⚠️  No supplier link found for ${supplierEmail}`);
                    continue;
                }
                
                const supplierId = supplierQuery.rows[0].id;
                console.log(`   ✅ Found existing supplier ID: ${supplierId} for ${supplierEmail}`);
                
                // Update the admin link URL to use existing supplier ID
                const newUrl = `http://127.0.0.1:3004/supplier/${supplierId}`;
                
                // Insert admin link with new URL
                await postgresPool.query(`
                    INSERT INTO admin_supplier_links 
                    (id, shared_with, url, created_on, state, valid_until, supplier_name, admin_notes)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    link.id,
                    link.shared_with,
                    newUrl,
                    link.created_on,
                    link.state,
                    link.valid_until,
                    link.supplier_name,
                    link.admin_notes
                ]);
                
                console.log(`   🔗 Updated URL: ${newUrl}`);
                
            } catch (error) {
                console.error(`   ❌ Failed to migrate link for ${link.shared_with}:`, error);
            }
        }
        
        // Step 3: Verify migration
        console.log('\n🔍 Step 3: Verifying Migration');
        console.log('===============================');
        
        const verifyQuery = await postgresPool.query('SELECT COUNT(*) as count FROM admin_supplier_links');
        const adminCount = parseInt(verifyQuery.rows[0].count);
        
        const supplierQuery = await postgresPool.query('SELECT COUNT(*) as count FROM supplier_links');
        const supplierCount = parseInt(supplierQuery.rows[0].count);
        
        console.log(`📊 Migration Results:`);
        console.log(`   Admin Links: ${adminCount}`);
        console.log(`   Supplier Links: ${supplierCount}`);
        
        if (adminCount > 0 && supplierCount > 0) {
            console.log('✅ Admin data migration completed successfully!');
            console.log('\n🎯 Next Steps:');
            console.log('   1. Refresh the admin interface at http://127.0.0.1:3004/admin');
            console.log('   2. You should now see the new supplier IDs (XXXX-XXXX format)');
            console.log('   3. The old UUIDs have been replaced with new format IDs');
        } else {
            console.log('⚠️  Migration may not be complete. Please check the logs above.');
        }
        
    } catch (error) {
        console.error('❌ Admin data migration failed:', error);
        throw error;
    } finally {
        await postgresPool.end();
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateAdminData()
        .then(() => {
            console.log('\n✅ Admin data migration completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Admin data migration failed:', error);
            process.exit(1);
        });
}

export default migrateAdminData;
