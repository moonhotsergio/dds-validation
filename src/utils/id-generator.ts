import pool from '../database/connection';

/**
 * Supplier ID Generator for DDS Validation Project
 * Generates and validates new 8-character supplier IDs (XXXX-XXXX format)
 * Handles migration from UUID format to new format
 */

export interface SupplierIdInfo {
    id: string;
    oldId?: string;
    isNew: boolean;
    createdAt: Date;
}

export interface MigrationMapping {
    oldId: string;
    newId: string;
    migratedAt: Date;
}

// Character set for ID generation (excluding problematic characters)
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// ID format: XXXX-XXXX (4 characters, dash, 4 characters)
const ID_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Generate a new unique 8-character supplier ID
 */
export function generateSupplierId(): string {
    const part1 = Array.from({ length: 4 }, () => 
        ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
    ).join('');
    
    const part2 = Array.from({ length: 4 }, () => 
        ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
    ).join('');
    
    return `${part1}-${part2}`;
}

/**
 * Validate supplier ID format
 */
export function isValidSupplierId(id: string): boolean {
    return ID_PATTERN.test(id);
}

/**
 * Check if supplier ID is already in use
 */
export async function isSupplierIdUnique(id: string): Promise<boolean> {
    try {
        const result = await pool.query(
            'SELECT COUNT(*) as count FROM supplier_links WHERE id = $1',
            [id]
        );
        
        return parseInt(result.rows[0].count) === 0;
    } catch (error) {
        console.error('❌ Failed to check ID uniqueness:', error);
        return false;
    }
}

/**
 * Generate a unique supplier ID (with collision checking)
 */
export async function generateUniqueSupplierId(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
        const id = generateSupplierId();
        
        if (await isSupplierIdUnique(id)) {
            return id;
        }
        
        attempts++;
    }
    
    throw new Error('Failed to generate unique supplier ID after maximum attempts');
}

/**
 * Create new supplier link with 8-character ID
 */
export async function createSupplierLink(supplierIdentifier: string): Promise<SupplierIdInfo> {
    try {
        const newId = await generateUniqueSupplierId();
        
        const result = await pool.query(
            'INSERT INTO supplier_links (id, supplier_identifier, created_at, is_active) VALUES ($1, $2, NOW(), true) RETURNING *',
            [newId, supplierIdentifier]
        );
        
        const supplierLink = result.rows[0];
        
        console.log(`✅ Created new supplier link: ${newId}`);
        
        return {
            id: supplierLink.id,
            isNew: true,
            createdAt: supplierLink.created_at
        };
        
    } catch (error) {
        console.error('❌ Failed to create supplier link:', error);
        throw error;
    }
}

/**
 * Migrate existing UUID supplier links to new format
 */
export async function migrateSupplierIds(): Promise<MigrationMapping[]> {
    const migrations: MigrationMapping[] = [];
    
    try {
        console.log('🔄 Starting supplier ID migration...');
        
        // Get all existing supplier links
        const result = await pool.query(
            'SELECT id, supplier_identifier FROM supplier_links WHERE LENGTH(id) > 20'
        );
        
        if (result.rows.length === 0) {
            console.log('✅ No UUID supplier links found to migrate');
            return migrations;
        }
        
        console.log(`📋 Found ${result.rows.length} UUID supplier links to migrate`);
        
        // Create migration mapping table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS supplier_id_migrations (
                old_id VARCHAR(255) NOT NULL,
                new_id VARCHAR(255) NOT NULL,
                migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (old_id)
            )
        `);
        
        // Migrate each supplier link
        for (const row of result.rows) {
            try {
                const oldId = row.id;
                const newId = await generateUniqueSupplierId();
                
                // Create new supplier link with new ID
                await pool.query(
                    'INSERT INTO supplier_links (id, supplier_identifier, created_at, is_active) VALUES ($1, $2, NOW(), true)',
                    [newId, row.supplier_identifier]
                );
                
                // Update all references to use new ID
                await pool.query(
                    'UPDATE reference_submissions SET supplier_link_id = $1 WHERE supplier_link_id = $2',
                    [newId, oldId]
                );
                
                await pool.query(
                    'UPDATE otp_tokens SET supplier_link_id = $1 WHERE supplier_link_id = $2',
                    [newId, oldId]
                );
                
                await pool.query(
                    'UPDATE supplier_sessions SET supplier_link_id = $1 WHERE supplier_link_id = $2',
                    [newId, oldId]
                );
                
                // Record migration
                await pool.query(
                    'INSERT INTO supplier_id_migrations (old_id, new_id) VALUES ($1, $2)',
                    [oldId, newId]
                );
                
                // Deactivate old supplier link
                await pool.query(
                    'UPDATE supplier_links SET is_active = false WHERE id = $1',
                    [oldId]
                );
                
                migrations.push({
                    oldId,
                    newId,
                    migratedAt: new Date()
                });
                
                console.log(`✅ Migrated: ${oldId} → ${newId}`);
                
            } catch (error) {
                console.error(`❌ Failed to migrate supplier link ${row.id}:`, error);
            }
        }
        
        console.log(`✅ Supplier ID migration completed: ${migrations.length} links migrated`);
        
    } catch (error) {
        console.error('❌ Supplier ID migration failed:', error);
        throw error;
    }
    
    return migrations;
}

/**
 * Get migration history
 */
export async function getMigrationHistory(): Promise<MigrationMapping[]> {
    try {
        const result = await pool.query(
            'SELECT old_id, new_id, migrated_at FROM supplier_id_migrations ORDER BY migrated_at DESC'
        );
        
        return result.rows.map((row: any) => ({
            oldId: row.old_id,
            newId: row.new_id,
            migratedAt: new Date(row.migrated_at)
        }));
        
    } catch (error) {
        console.error('❌ Failed to get migration history:', error);
        return [];
    }
}

/**
 * Rollback migration for a specific supplier link
 */
export async function rollbackMigration(newId: string): Promise<boolean> {
    try {
        // Get migration record
        const migrationResult = await pool.query(
            'SELECT old_id FROM supplier_id_migrations WHERE new_id = $1',
            [newId]
        );
        
        if (migrationResult.rows.length === 0) {
            throw new Error('Migration record not found');
        }
        
        const oldId = migrationResult.rows[0].old_id;
        
        // Reactivate old supplier link
        await pool.query(
            'UPDATE supplier_links SET is_active = true WHERE id = $1',
            [oldId]
        );
        
        // Update all references back to old ID
        await pool.query(
            'UPDATE reference_submissions SET supplier_link_id = $1 WHERE supplier_link_id = $2',
            [oldId, newId]
        );
        
        await pool.query(
            'UPDATE otp_tokens SET supplier_link_id = $1 WHERE supplier_link_id = $2',
            [oldId, newId]
        );
        
        await pool.query(
            'UPDATE supplier_sessions SET supplier_link_id = $1 WHERE supplier_link_id = $2',
            [oldId, newId]
        );
        
        // Remove migration record
        await pool.query(
            'DELETE FROM supplier_id_migrations WHERE new_id = $1',
            [newId]
        );
        
        // Deactivate new supplier link
        await pool.query(
            'UPDATE supplier_links SET is_active = false WHERE id = $1',
            [newId]
        );
        
        console.log(`✅ Rollback completed: ${newId} → ${oldId}`);
        return true;
        
    } catch (error) {
        console.error('❌ Rollback failed:', error);
        return false;
    }
}

/**
 * Validate all supplier IDs in the system
 */
export async function validateAllSupplierIds(): Promise<{
    valid: number;
    invalid: number;
    total: number;
    invalidIds: string[];
}> {
    try {
        const result = await pool.query('SELECT id FROM supplier_links WHERE is_active = true');
        
        let valid = 0;
        let invalid = 0;
        const invalidIds: string[] = [];
        
        result.rows.forEach((row: any) => {
            if (isValidSupplierId(row.id)) {
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

export default {
    generateSupplierId,
    isValidSupplierId,
    isSupplierIdUnique,
    generateUniqueSupplierId,
    createSupplierLink,
    migrateSupplierIds,
    getMigrationHistory,
    rollbackMigration,
    validateAllSupplierIds
};
