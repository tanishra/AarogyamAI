/**
 * Tests for family_history table migration
 * Requirements: 6.1, 6.2, 6.3, 6.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Family History Table Migration', () => {
  let pool: Pool;
  let testUserId: string;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Create a test user for foreign key reference
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-family-history@example.com', 'hashed_password', 'Patient']);
    testUserId = userResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '011_create_family_history_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '011_create_family_history_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test user
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    
    await pool.end();
  });

  it('should create family_history table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'family_history'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('patient_id');
    expect(columns).toContain('condition');
    expect(columns).toContain('category');
    expect(columns).toContain('relationship');
    expect(columns).toContain('age_of_onset');
    expect(columns).toContain('maternal_or_paternal');
    expect(columns).toContain('hereditary_flag');
    expect(columns).toContain('notes');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'family_history';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_family_history_patient_id');
    expect(indexes).toContain('idx_family_history_category');
    expect(indexes).toContain('idx_family_history_hereditary_flag');
  });

  it('should enforce foreign key constraint on patient_id', async () => {
    // Try to insert with non-existent patient_id
    await expect(
      pool.query(`
        INSERT INTO family_history (patient_id, condition, category, relationship)
        VALUES ('00000000-0000-0000-0000-000000000000', 'Test Condition', 'cardiovascular', 'parent');
      `)
    ).rejects.toThrow();
  });

  it('should enforce category check constraint', async () => {
    // Try to insert with invalid category
    await expect(
      pool.query(`
        INSERT INTO family_history (patient_id, condition, category, relationship)
        VALUES ($1, 'Test Condition', 'invalid_category', 'parent');
      `, [testUserId])
    ).rejects.toThrow();
  });

  it('should enforce relationship check constraint', async () => {
    // Try to insert with invalid relationship
    await expect(
      pool.query(`
        INSERT INTO family_history (patient_id, condition, category, relationship)
        VALUES ($1, 'Test Condition', 'cardiovascular', 'invalid_relationship');
      `, [testUserId])
    ).rejects.toThrow();
  });

  it('should enforce maternal_or_paternal check constraint', async () => {
    // Try to insert with invalid maternal_or_paternal value
    await expect(
      pool.query(`
        INSERT INTO family_history (patient_id, condition, category, relationship, maternal_or_paternal)
        VALUES ($1, 'Test Condition', 'cardiovascular', 'parent', 'invalid_side');
      `, [testUserId])
    ).rejects.toThrow();
  });

  it('should allow inserting a valid family history entry', async () => {
    const result = await pool.query(`
      INSERT INTO family_history (
        patient_id,
        condition,
        category,
        relationship,
        age_of_onset,
        maternal_or_paternal,
        hereditary_flag
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, patient_id, condition, category, relationship, age_of_onset, maternal_or_paternal, hereditary_flag;
    `, [
      testUserId,
      'Breast Cancer',
      'cancer',
      'parent',
      45,
      'maternal',
      true
    ]);

    expect(result.rows[0].patient_id).toBe(testUserId);
    expect(result.rows[0].condition).toBe('Breast Cancer');
    expect(result.rows[0].category).toBe('cancer');
    expect(result.rows[0].relationship).toBe('parent');
    expect(result.rows[0].age_of_onset).toBe(45);
    expect(result.rows[0].maternal_or_paternal).toBe('maternal');
    expect(result.rows[0].hereditary_flag).toBe(true);

    // Clean up
    await pool.query('DELETE FROM family_history WHERE id = $1', [result.rows[0].id]);
  });

  it('should allow all valid category values', async () => {
    const categories = ['cardiovascular', 'cancer', 'metabolic', 'neurological', 'autoimmune', 'other'];
    
    for (const category of categories) {
      const result = await pool.query(`
        INSERT INTO family_history (patient_id, condition, category, relationship)
        VALUES ($1, $2, $3, $4)
        RETURNING category;
      `, [testUserId, 'Test Condition', category, 'parent']);

      expect(result.rows[0].category).toBe(category);
    }

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should allow all valid relationship values', async () => {
    const relationships = ['parent', 'sibling', 'grandparent', 'aunt-uncle', 'cousin'];
    
    for (const relationship of relationships) {
      const result = await pool.query(`
        INSERT INTO family_history (patient_id, condition, category, relationship)
        VALUES ($1, $2, $3, $4)
        RETURNING relationship;
      `, [testUserId, 'Test Condition', 'cardiovascular', relationship]);

      expect(result.rows[0].relationship).toBe(relationship);
    }

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should allow NULL for maternal_or_paternal', async () => {
    const result = await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship, maternal_or_paternal)
      VALUES ($1, $2, $3, $4, NULL)
      RETURNING maternal_or_paternal;
    `, [testUserId, 'Test Condition', 'cardiovascular', 'sibling']);

    expect(result.rows[0].maternal_or_paternal).toBeNull();

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should default hereditary_flag to FALSE', async () => {
    const result = await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship)
      VALUES ($1, $2, $3, $4)
      RETURNING hereditary_flag;
    `, [testUserId, 'Test Condition', 'cardiovascular', 'parent']);

    expect(result.rows[0].hereditary_flag).toBe(false);

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should store age_of_onset as integer', async () => {
    const result = await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship, age_of_onset)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING age_of_onset;
    `, [testUserId, 'Type 2 Diabetes', 'metabolic', 'parent', 52]);

    expect(result.rows[0].age_of_onset).toBe(52);

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should allow NULL for age_of_onset', async () => {
    const result = await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship)
      VALUES ($1, $2, $3, $4)
      RETURNING age_of_onset;
    `, [testUserId, 'Test Condition', 'cardiovascular', 'parent']);

    expect(result.rows[0].age_of_onset).toBeNull();

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should store notes as text', async () => {
    const notes = 'Patient reports mother had early onset breast cancer with BRCA1 mutation confirmed.';
    
    const result = await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING notes;
    `, [testUserId, 'Breast Cancer', 'cancer', 'parent', notes]);

    expect(result.rows[0].notes).toBe(notes);

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should automatically set created_at and updated_at timestamps', async () => {
    const result = await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship)
      VALUES ($1, $2, $3, $4)
      RETURNING created_at, updated_at;
    `, [testUserId, 'Test Condition', 'cardiovascular', 'parent']);

    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].updated_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should query family history by patient efficiently using index', async () => {
    // Insert multiple family history entries
    await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship)
      VALUES 
        ($1, 'Heart Disease', 'cardiovascular', 'parent'),
        ($1, 'Breast Cancer', 'cancer', 'parent'),
        ($1, 'Type 2 Diabetes', 'metabolic', 'sibling');
    `, [testUserId]);

    const result = await pool.query(`
      SELECT id, condition, category, relationship
      FROM family_history
      WHERE patient_id = $1
      ORDER BY created_at;
    `, [testUserId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].condition).toBe('Heart Disease');
    expect(result.rows[1].condition).toBe('Breast Cancer');
    expect(result.rows[2].condition).toBe('Type 2 Diabetes');

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should query family history by category efficiently using index', async () => {
    // Insert multiple family history entries with different categories
    await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship)
      VALUES 
        ($1, 'Heart Disease', 'cardiovascular', 'parent'),
        ($1, 'Stroke', 'cardiovascular', 'grandparent'),
        ($1, 'Breast Cancer', 'cancer', 'parent');
    `, [testUserId]);

    const result = await pool.query(`
      SELECT id, condition, category
      FROM family_history
      WHERE patient_id = $1 AND category = 'cardiovascular'
      ORDER BY created_at;
    `, [testUserId]);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].condition).toBe('Heart Disease');
    expect(result.rows[1].condition).toBe('Stroke');

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should query hereditary conditions efficiently using partial index', async () => {
    // Insert family history entries with and without hereditary flag
    await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship, hereditary_flag)
      VALUES 
        ($1, 'BRCA1 Breast Cancer', 'cancer', 'parent', TRUE),
        ($1, 'Lynch Syndrome', 'cancer', 'parent', TRUE),
        ($1, 'Common Cold', 'other', 'sibling', FALSE);
    `, [testUserId]);

    const result = await pool.query(`
      SELECT id, condition, hereditary_flag
      FROM family_history
      WHERE patient_id = $1 AND hereditary_flag = TRUE
      ORDER BY created_at;
    `, [testUserId]);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].condition).toBe('BRCA1 Breast Cancer');
    expect(result.rows[1].condition).toBe('Lynch Syndrome');

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should cascade delete family history when patient is deleted', async () => {
    // Create a temporary test user
    const tempUserResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['temp-family-patient@example.com', 'hashed_password', 'Patient']);
    const tempUserId = tempUserResult.rows[0].id;

    // Insert family history for temp user
    await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship)
      VALUES ($1, 'Test Condition', 'cardiovascular', 'parent');
    `, [tempUserId]);

    // Verify family history exists
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM family_history
      WHERE patient_id = $1;
    `, [tempUserId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [tempUserId]);

    // Verify family history was cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM family_history
      WHERE patient_id = $1;
    `, [tempUserId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should support structured family history by condition categories', async () => {
    // Insert family history entries across different categories
    await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship, age_of_onset)
      VALUES 
        ($1, 'Coronary Artery Disease', 'cardiovascular', 'parent', 55),
        ($1, 'Breast Cancer', 'cancer', 'parent', 48),
        ($1, 'Type 2 Diabetes', 'metabolic', 'sibling', 42),
        ($1, 'Alzheimer Disease', 'neurological', 'grandparent', 72),
        ($1, 'Rheumatoid Arthritis', 'autoimmune', 'aunt-uncle', 38);
    `, [testUserId]);

    // Query structured by category
    const result = await pool.query(`
      SELECT category, condition, relationship, age_of_onset
      FROM family_history
      WHERE patient_id = $1
      ORDER BY category, age_of_onset;
    `, [testUserId]);

    expect(result.rows.length).toBe(5);
    
    // Verify categories are properly stored
    const categories = result.rows.map(row => row.category);
    expect(categories).toContain('cardiovascular');
    expect(categories).toContain('cancer');
    expect(categories).toContain('metabolic');
    expect(categories).toContain('neurological');
    expect(categories).toContain('autoimmune');

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should track maternal and paternal lineage', async () => {
    // Insert family history with maternal and paternal sides
    await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship, maternal_or_paternal)
      VALUES 
        ($1, 'Heart Disease', 'cardiovascular', 'parent', 'paternal'),
        ($1, 'Breast Cancer', 'cancer', 'parent', 'maternal'),
        ($1, 'Diabetes', 'metabolic', 'grandparent', 'maternal');
    `, [testUserId]);

    // Query maternal side
    const maternalResult = await pool.query(`
      SELECT condition, relationship
      FROM family_history
      WHERE patient_id = $1 AND maternal_or_paternal = 'maternal'
      ORDER BY created_at;
    `, [testUserId]);

    expect(maternalResult.rows.length).toBe(2);
    expect(maternalResult.rows[0].condition).toBe('Breast Cancer');
    expect(maternalResult.rows[1].condition).toBe('Diabetes');

    // Query paternal side
    const paternalResult = await pool.query(`
      SELECT condition, relationship
      FROM family_history
      WHERE patient_id = $1 AND maternal_or_paternal = 'paternal'
      ORDER BY created_at;
    `, [testUserId]);

    expect(paternalResult.rows.length).toBe(1);
    expect(paternalResult.rows[0].condition).toBe('Heart Disease');

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });

  it('should support hereditary pattern detection with flag', async () => {
    // Insert conditions with hereditary patterns
    await pool.query(`
      INSERT INTO family_history (patient_id, condition, category, relationship, hereditary_flag, notes)
      VALUES 
        ($1, 'BRCA1 Mutation', 'cancer', 'parent', TRUE, 'Strong hereditary pattern for breast/ovarian cancer'),
        ($1, 'Lynch Syndrome', 'cancer', 'parent', TRUE, 'Hereditary colorectal cancer syndrome'),
        ($1, 'Hypertension', 'cardiovascular', 'parent', FALSE, 'Common condition, not flagged as hereditary');
    `, [testUserId]);

    // Query only hereditary conditions
    const result = await pool.query(`
      SELECT condition, hereditary_flag, notes
      FROM family_history
      WHERE patient_id = $1 AND hereditary_flag = TRUE
      ORDER BY created_at;
    `, [testUserId]);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].condition).toBe('BRCA1 Mutation');
    expect(result.rows[1].condition).toBe('Lynch Syndrome');
    result.rows.forEach(row => {
      expect(row.hereditary_flag).toBe(true);
    });

    // Clean up
    await pool.query('DELETE FROM family_history WHERE patient_id = $1', [testUserId]);
  });
});
