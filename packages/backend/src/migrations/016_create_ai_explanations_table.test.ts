/**
 * Tests for ai_explanations table migration
 * Requirements: 11.3, 11.4, 11.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('AI Explanations Table Migration', () => {
  let pool: Pool;
  let testPatientId: string;
  let testPhysicianId: string;
  let testDifferentialId: string;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Create test users for foreign key references
    const patientResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-explanation-patient@example.com', 'hashed_password', 'Patient']);
    testPatientId = patientResult.rows[0].id;

    const physicianResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-explanation-physician@example.com', 'hashed_password', 'Doctor']);
    testPhysicianId = physicianResult.rows[0].id;

    // Create a test differential for foreign key reference
    const differentialResult = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `, [
      '550e8400-e29b-41d4-a716-446655440000',
      testPatientId,
      'J06.9',
      'Acute upper respiratory infection',
      'ai',
      testPhysicianId
    ]);
    testDifferentialId = differentialResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '016_create_ai_explanations_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '016_create_ai_explanations_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test data
    await pool.query('DELETE FROM differentials WHERE id = $1', [testDifferentialId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testPatientId, testPhysicianId]);
    
    await pool.end();
  });

  it('should create ai_explanations table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ai_explanations'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('differential_id');
    expect(columns).toContain('summary');
    expect(columns).toContain('key_symptoms');
    expect(columns).toContain('clinical_decision_rules');
    expect(columns).toContain('relevant_history');
    expect(columns).toContain('confidence_rationale');
    expect(columns).toContain('medical_references');
    expect(columns).toContain('generated_at');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'ai_explanations';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_ai_explanations_differential_id');
    expect(indexes).toContain('idx_ai_explanations_generated_at');
  });

  it('should enforce foreign key constraint on differential_id', async () => {
    // Try to insert with non-existent differential_id
    await expect(
      pool.query(`
        INSERT INTO ai_explanations (
          differential_id, summary, key_symptoms, 
          clinical_decision_rules, relevant_history, confidence_rationale
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000', 
          'Test summary', '[]', '[]', '[]', 'Test rationale'
        );
      `)
    ).rejects.toThrow();
  });

  it('should allow inserting explanation with all required fields', async () => {
    const keySymptomsData = [
      {
        symptom: 'Fever',
        relevance: 'high',
        contribution: 'Primary indicator of infection'
      },
      {
        symptom: 'Cough',
        relevance: 'moderate',
        contribution: 'Common respiratory symptom'
      }
    ];

    const decisionRulesData = [
      {
        name: 'Centor Score',
        description: 'Clinical prediction rule for streptococcal pharyngitis',
        applied: true,
        result: 'Score of 3 suggests bacterial infection'
      }
    ];

    const historyData = [
      {
        factor: 'Recent exposure to sick contacts',
        type: 'social',
        impact: 'Increases likelihood of viral infection'
      }
    ];

    const referencesData = [
      {
        title: 'Clinical Practice Guideline for Acute Respiratory Infections',
        authors: ['Smith J', 'Doe A'],
        journal: 'JAMA',
        year: 2023,
        doi: '10.1001/jama.2023.12345',
        url: 'https://jamanetwork.com/journals/jama/article/12345',
        relevance: 'Provides diagnostic criteria for URI'
      }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id,
        summary,
        key_symptoms,
        clinical_decision_rules,
        relevant_history,
        confidence_rationale,
        medical_references
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, differential_id, summary, confidence_rationale;
    `, [
      testDifferentialId,
      'Patient presents with classic symptoms of acute upper respiratory infection',
      JSON.stringify(keySymptomsData),
      JSON.stringify(decisionRulesData),
      JSON.stringify(historyData),
      'High confidence based on symptom cluster and clinical decision rules',
      JSON.stringify(referencesData)
    ]);

    expect(result.rows[0].differential_id).toBe(testDifferentialId);
    expect(result.rows[0].summary).toBe('Patient presents with classic symptoms of acute upper respiratory infection');
    expect(result.rows[0].confidence_rationale).toBe('High confidence based on symptom cluster and clinical decision rules');

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE id = $1', [result.rows[0].id]);
  });

  it('should store key symptoms as JSONB array', async () => {
    const keySymptomsData = [
      {
        symptom: 'Sore throat',
        relevance: 'high',
        contribution: 'Primary complaint indicating pharyngeal inflammation'
      }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING key_symptoms;
    `, [
      testDifferentialId,
      'Test summary',
      JSON.stringify(keySymptomsData),
      '[]',
      '[]',
      'Test rationale'
    ]);

    const storedSymptoms = result.rows[0].key_symptoms;
    expect(Array.isArray(storedSymptoms)).toBe(true);
    expect(storedSymptoms[0].symptom).toBe('Sore throat');
    expect(storedSymptoms[0].relevance).toBe('high');
    expect(storedSymptoms[0].contribution).toBe('Primary complaint indicating pharyngeal inflammation');

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should store clinical decision rules as JSONB array', async () => {
    const decisionRulesData = [
      {
        name: 'Modified Centor Criteria',
        description: 'Predicts probability of streptococcal pharyngitis',
        applied: true,
        result: 'Score 2/4 - moderate probability'
      }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING clinical_decision_rules;
    `, [
      testDifferentialId,
      'Test summary',
      '[]',
      JSON.stringify(decisionRulesData),
      '[]',
      'Test rationale'
    ]);

    const storedRules = result.rows[0].clinical_decision_rules;
    expect(Array.isArray(storedRules)).toBe(true);
    expect(storedRules[0].name).toBe('Modified Centor Criteria');
    expect(storedRules[0].applied).toBe(true);
    expect(storedRules[0].result).toBe('Score 2/4 - moderate probability');

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should store relevant history as JSONB array', async () => {
    const historyData = [
      {
        factor: 'Diabetes mellitus type 2',
        type: 'past-medical',
        impact: 'Increases risk of complications from infections'
      },
      {
        factor: 'Mother had breast cancer',
        type: 'family-history',
        impact: 'Not directly relevant to current presentation'
      }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING relevant_history;
    `, [
      testDifferentialId,
      'Test summary',
      '[]',
      '[]',
      JSON.stringify(historyData),
      'Test rationale'
    ]);

    const storedHistory = result.rows[0].relevant_history;
    expect(Array.isArray(storedHistory)).toBe(true);
    expect(storedHistory.length).toBe(2);
    expect(storedHistory[0].type).toBe('past-medical');
    expect(storedHistory[1].type).toBe('family-history');

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should store medical references as JSONB array', async () => {
    const referencesData = [
      {
        title: 'Diagnosis and Management of Acute Pharyngitis',
        authors: ['Johnson M', 'Williams R', 'Brown K'],
        journal: 'New England Journal of Medicine',
        year: 2022,
        doi: '10.1056/NEJMcp2200123',
        url: 'https://www.nejm.org/doi/full/10.1056/NEJMcp2200123',
        relevance: 'Provides evidence-based diagnostic approach'
      }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale, medical_references
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING medical_references;
    `, [
      testDifferentialId,
      'Test summary',
      '[]',
      '[]',
      '[]',
      'Test rationale',
      JSON.stringify(referencesData)
    ]);

    const storedReferences = result.rows[0].medical_references;
    expect(Array.isArray(storedReferences)).toBe(true);
    expect(storedReferences[0].title).toBe('Diagnosis and Management of Acute Pharyngitis');
    expect(storedReferences[0].authors).toEqual(['Johnson M', 'Williams R', 'Brown K']);
    expect(storedReferences[0].journal).toBe('New England Journal of Medicine');
    expect(storedReferences[0].year).toBe(2022);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should allow references without DOI or URL', async () => {
    const referencesData = [
      {
        title: 'Clinical Guidelines for Respiratory Infections',
        authors: ['Expert Panel'],
        journal: 'Internal Medicine Review',
        year: 2021,
        relevance: 'Supports diagnostic approach'
      }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale, medical_references
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING medical_references;
    `, [
      testDifferentialId,
      'Test summary',
      '[]',
      '[]',
      '[]',
      'Test rationale',
      JSON.stringify(referencesData)
    ]);

    const storedReferences = result.rows[0].medical_references;
    expect(storedReferences[0].doi).toBeUndefined();
    expect(storedReferences[0].url).toBeUndefined();
    expect(storedReferences[0].relevance).toBe('Supports diagnostic approach');

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should automatically set generated_at timestamp', async () => {
    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING generated_at;
    `, [testDifferentialId, 'Test summary', '[]', '[]', '[]', 'Test rationale']);

    expect(result.rows[0].generated_at).not.toBeNull();
    expect(result.rows[0].generated_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should automatically set created_at timestamp', async () => {
    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING created_at;
    `, [testDifferentialId, 'Test summary', '[]', '[]', '[]', 'Test rationale']);

    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].created_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should automatically set updated_at timestamp', async () => {
    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING updated_at;
    `, [testDifferentialId, 'Test summary', '[]', '[]', '[]', 'Test rationale']);

    expect(result.rows[0].updated_at).not.toBeNull();
    expect(result.rows[0].updated_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should cascade delete explanation when differential is deleted', async () => {
    // Create a temporary differential
    const tempDifferentialResult = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `, [
      '550e8400-e29b-41d4-a716-446655440001',
      testPatientId,
      'J18.9',
      'Pneumonia',
      'ai',
      testPhysicianId
    ]);
    const tempDifferentialId = tempDifferentialResult.rows[0].id;

    // Insert explanation for temp differential
    await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6);
    `, [tempDifferentialId, 'Test summary', '[]', '[]', '[]', 'Test rationale']);

    // Verify explanation exists
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM ai_explanations
      WHERE differential_id = $1;
    `, [tempDifferentialId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the differential
    await pool.query('DELETE FROM differentials WHERE id = $1', [tempDifferentialId]);

    // Verify explanation was cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM ai_explanations
      WHERE differential_id = $1;
    `, [tempDifferentialId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should query explanations by differential efficiently using index', async () => {
    // Insert explanation
    await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6);
    `, [testDifferentialId, 'Test summary', '[]', '[]', '[]', 'Test rationale']);

    const result = await pool.query(`
      SELECT summary, confidence_rationale
      FROM ai_explanations
      WHERE differential_id = $1;
    `, [testDifferentialId]);

    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].summary).toBe('Test summary');

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support time-based queries using generated_at index', async () => {
    // Insert explanation
    await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6);
    `, [testDifferentialId, 'Test summary', '[]', '[]', '[]', 'Test rationale']);

    // Query recent explanations (last 24 hours)
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM ai_explanations
      WHERE generated_at >= NOW() - INTERVAL '24 hours';
    `);

    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support querying explanations with multiple symptoms', async () => {
    const keySymptomsData = [
      { symptom: 'Fever', relevance: 'high', contribution: 'Primary indicator' },
      { symptom: 'Cough', relevance: 'moderate', contribution: 'Secondary symptom' },
      { symptom: 'Fatigue', relevance: 'low', contribution: 'Non-specific symptom' }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING key_symptoms;
    `, [
      testDifferentialId,
      'Test summary',
      JSON.stringify(keySymptomsData),
      '[]',
      '[]',
      'Test rationale'
    ]);

    const storedSymptoms = result.rows[0].key_symptoms;
    expect(storedSymptoms.length).toBe(3);
    expect(storedSymptoms.filter((s: any) => s.relevance === 'high').length).toBe(1);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support querying explanations with multiple decision rules', async () => {
    const decisionRulesData = [
      { name: 'Rule 1', description: 'First rule', applied: true, result: 'Positive' },
      { name: 'Rule 2', description: 'Second rule', applied: false, result: 'Not applicable' }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING clinical_decision_rules;
    `, [
      testDifferentialId,
      'Test summary',
      '[]',
      JSON.stringify(decisionRulesData),
      '[]',
      'Test rationale'
    ]);

    const storedRules = result.rows[0].clinical_decision_rules;
    expect(storedRules.length).toBe(2);
    expect(storedRules.filter((r: any) => r.applied === true).length).toBe(1);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support querying explanations with multiple history factors', async () => {
    const historyData = [
      { factor: 'Factor 1', type: 'past-medical', impact: 'High impact' },
      { factor: 'Factor 2', type: 'family-history', impact: 'Moderate impact' },
      { factor: 'Factor 3', type: 'medication', impact: 'Low impact' }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING relevant_history;
    `, [
      testDifferentialId,
      'Test summary',
      '[]',
      '[]',
      JSON.stringify(historyData),
      'Test rationale'
    ]);

    const storedHistory = result.rows[0].relevant_history;
    expect(storedHistory.length).toBe(3);
    expect(storedHistory.filter((h: any) => h.type === 'past-medical').length).toBe(1);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support querying explanations with multiple references', async () => {
    const referencesData = [
      {
        title: 'Reference 1',
        authors: ['Author A'],
        journal: 'Journal 1',
        year: 2023,
        relevance: 'High relevance'
      },
      {
        title: 'Reference 2',
        authors: ['Author B', 'Author C'],
        journal: 'Journal 2',
        year: 2022,
        doi: '10.1234/test',
        relevance: 'Moderate relevance'
      }
    ];

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale, medical_references
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING medical_references;
    `, [
      testDifferentialId,
      'Test summary',
      '[]',
      '[]',
      '[]',
      'Test rationale',
      JSON.stringify(referencesData)
    ]);

    const storedReferences = result.rows[0].medical_references;
    expect(storedReferences.length).toBe(2);
    expect(storedReferences[1].doi).toBe('10.1234/test');

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should allow empty arrays for optional JSONB fields', async () => {
    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, confidence_rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING key_symptoms, clinical_decision_rules, relevant_history, medical_references;
    `, [testDifferentialId, 'Test summary', '[]', '[]', '[]', 'Test rationale']);

    expect(Array.isArray(result.rows[0].key_symptoms)).toBe(true);
    expect(result.rows[0].key_symptoms.length).toBe(0);
    expect(Array.isArray(result.rows[0].clinical_decision_rules)).toBe(true);
    expect(result.rows[0].clinical_decision_rules.length).toBe(0);
    expect(Array.isArray(result.rows[0].relevant_history)).toBe(true);
    expect(result.rows[0].relevant_history.length).toBe(0);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support comprehensive explanation with all fields populated', async () => {
    const comprehensiveExplanation = {
      summary: 'Patient presents with acute respiratory symptoms consistent with viral upper respiratory infection',
      key_symptoms: [
        { symptom: 'Rhinorrhea', relevance: 'high', contribution: 'Classic viral URI symptom' },
        { symptom: 'Nasal congestion', relevance: 'high', contribution: 'Supports viral etiology' },
        { symptom: 'Mild sore throat', relevance: 'moderate', contribution: 'Common associated symptom' }
      ],
      clinical_decision_rules: [
        {
          name: 'Centor Score',
          description: 'Predicts streptococcal pharyngitis probability',
          applied: true,
          result: 'Score 1/4 - low probability of bacterial infection'
        }
      ],
      relevant_history: [
        {
          factor: 'Recent daycare exposure',
          type: 'social',
          impact: 'Significantly increases viral URI risk'
        }
      ],
      confidence_rationale: 'High confidence (85%) based on symptom cluster, negative Centor score, and epidemiological factors',
      medical_references: [
        {
          title: 'Clinical Practice Guideline: Acute Respiratory Tract Infections',
          authors: ['CDC Expert Panel'],
          journal: 'MMWR',
          year: 2023,
          url: 'https://www.cdc.gov/mmwr/volumes/72/rr/rr7201a1.htm',
          relevance: 'Provides evidence-based diagnostic criteria'
        }
      ]
    };

    const result = await pool.query(`
      INSERT INTO ai_explanations (
        differential_id, summary, key_symptoms,
        clinical_decision_rules, relevant_history, 
        confidence_rationale, medical_references
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `, [
      testDifferentialId,
      comprehensiveExplanation.summary,
      JSON.stringify(comprehensiveExplanation.key_symptoms),
      JSON.stringify(comprehensiveExplanation.clinical_decision_rules),
      JSON.stringify(comprehensiveExplanation.relevant_history),
      comprehensiveExplanation.confidence_rationale,
      JSON.stringify(comprehensiveExplanation.medical_references)
    ]);

    expect(result.rows[0].summary).toBe(comprehensiveExplanation.summary);
    expect(result.rows[0].key_symptoms.length).toBe(3);
    expect(result.rows[0].clinical_decision_rules.length).toBe(1);
    expect(result.rows[0].relevant_history.length).toBe(1);
    expect(result.rows[0].medical_references.length).toBe(1);
    expect(result.rows[0].confidence_rationale).toBe(comprehensiveExplanation.confidence_rationale);

    // Clean up
    await pool.query('DELETE FROM ai_explanations WHERE id = $1', [result.rows[0].id]);
  });
});
