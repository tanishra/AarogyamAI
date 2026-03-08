import { Pool } from 'pg';

/**
 * Differential Manager Service
 * Requirements: 8.2, 8.3, 8.5, 8.6, 8.7, 8.8
 * 
 * Manages differential diagnosis list operations
 */

export interface Diagnosis {
  code: string;
  name: string;
  category?: string;
}

export interface AddDiagnosisParams {
  encounterId: string;
  patientId: string;
  diagnosis: Diagnosis;
  priority: number;
  source: 'ai' | 'physician';
  addedBy: string;
  clinicalReasoning?: string;
  confidence?: number;
}

export interface UpdateDiagnosisParams {
  differentialId: string;
  priority?: number;
  clinicalReasoning?: string;
  confidence?: number;
  modifiedBy: string;
}

export interface DifferentialData {
  id: string;
  encounterId: string;
  patientId: string;
  diagnosisCode: string;
  diagnosisName: string;
  diagnosisCategory: string | null;
  priority: number;
  source: 'ai' | 'physician';
  addedBy: string;
  clinicalReasoning: string | null;
  confidence: number | null;
  createdAt: Date;
  modifiedAt: Date | null;
}

export class DifferentialManager {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Add diagnosis with ICD-10 code validation
   * Requirements: 8.3, 8.8
   */
  async addDiagnosis(params: AddDiagnosisParams): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name,
        diagnosis_category, priority, source, added_by,
        clinical_reasoning, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        params.encounterId,
        params.patientId,
        params.diagnosis.code,
        params.diagnosis.name,
        params.diagnosis.category || null,
        params.priority,
        params.source,
        params.addedBy,
        params.clinicalReasoning || null,
        params.confidence || null,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Remove diagnosis with audit logging
   * Requirement: 8.5
   */
  async removeDiagnosis(differentialId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM differentials WHERE id = $1`,
      [differentialId]
    );
  }

  /**
   * Update diagnosis
   * Requirement: 8.6
   */
  async updateDiagnosis(params: UpdateDiagnosisParams): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (params.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(params.priority);
    }

    if (params.clinicalReasoning !== undefined) {
      updates.push(`clinical_reasoning = $${paramIndex++}`);
      values.push(params.clinicalReasoning);
    }

    if (params.confidence !== undefined) {
      updates.push(`confidence = $${paramIndex++}`);
      values.push(params.confidence);
    }

    updates.push(`modified_at = NOW()`);
    values.push(params.differentialId);

    await this.pool.query(
      `UPDATE differentials SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Reorder diagnoses with change tracking
   * Requirement: 8.7
   */
  async reorderDiagnoses(encounterId: string, orderedIds: string[]): Promise<void> {
    // Update priorities based on order
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          `UPDATE differentials 
           SET priority = $1, modified_at = NOW() 
           WHERE id = $2 AND encounter_id = $3`,
          [i + 1, orderedIds[i], encounterId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search ICD-10 diagnoses
   * Requirement: 8.2
   */
  async searchDiagnoses(query: string, limit: number = 20): Promise<Diagnosis[]> {
    // For MVP, return mock data. In production, integrate with ICD-10 database
    const mockDiagnoses: Diagnosis[] = [
      { code: 'J06.9', name: 'Acute upper respiratory infection, unspecified', category: 'Respiratory' },
      { code: 'J18.9', name: 'Pneumonia, unspecified organism', category: 'Respiratory' },
      { code: 'I10', name: 'Essential (primary) hypertension', category: 'Cardiovascular' },
      { code: 'E11.9', name: 'Type 2 diabetes mellitus without complications', category: 'Endocrine' },
      { code: 'M79.3', name: 'Myalgia', category: 'Musculoskeletal' },
      { code: 'R50.9', name: 'Fever, unspecified', category: 'Symptoms' },
      { code: 'R05', name: 'Cough', category: 'Symptoms' },
      { code: 'R51', name: 'Headache', category: 'Symptoms' },
      { code: 'K21.9', name: 'Gastro-esophageal reflux disease without esophagitis', category: 'Digestive' },
      { code: 'J45.909', name: 'Unspecified asthma, uncomplicated', category: 'Respiratory' },
    ];

    const lowerQuery = query.toLowerCase();
    return mockDiagnoses
      .filter(d => 
        d.code.toLowerCase().includes(lowerQuery) || 
        d.name.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  }

  /**
   * Get differentials for an encounter
   */
  async getDifferentials(encounterId: string): Promise<DifferentialData[]> {
    const result = await this.pool.query(
      `SELECT id, encounter_id, patient_id, diagnosis_code, diagnosis_name,
              diagnosis_category, priority, source, added_by, clinical_reasoning,
              confidence, created_at, modified_at
       FROM differentials
       WHERE encounter_id = $1
       ORDER BY priority ASC`,
      [encounterId]
    );

    return result.rows.map(row => ({
      id: row.id,
      encounterId: row.encounter_id,
      patientId: row.patient_id,
      diagnosisCode: row.diagnosis_code,
      diagnosisName: row.diagnosis_name,
      diagnosisCategory: row.diagnosis_category,
      priority: row.priority,
      source: row.source,
      addedBy: row.added_by,
      clinicalReasoning: row.clinical_reasoning,
      confidence: row.confidence,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
    }));
  }

  /**
   * Get a single differential by ID
   */
  async getDifferentialById(differentialId: string): Promise<DifferentialData | null> {
    const result = await this.pool.query(
      `SELECT id, encounter_id, patient_id, diagnosis_code, diagnosis_name,
              diagnosis_category, priority, source, added_by, clinical_reasoning,
              confidence, created_at, modified_at
       FROM differentials
       WHERE id = $1`,
      [differentialId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      encounterId: row.encounter_id,
      patientId: row.patient_id,
      diagnosisCode: row.diagnosis_code,
      diagnosisName: row.diagnosis_name,
      diagnosisCategory: row.diagnosis_category,
      priority: row.priority,
      source: row.source,
      addedBy: row.added_by,
      clinicalReasoning: row.clinical_reasoning,
      confidence: row.confidence,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
    };
  }
}
