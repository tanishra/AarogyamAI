import { query } from '../config/database';

export interface ClinicalConsideration {
  id: string;
  patientId: string;
  sessionId?: string;
  conditionName: string;
  likelihood: 'high' | 'moderate' | 'low';
  urgency: 'urgent' | 'routine' | 'non-urgent';
  supportingFactors: string[];
  explanation: string;
  status: 'pending' | 'accepted' | 'modified' | 'rejected';
  doctorNotes?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  generatedAt: Date;
}

export interface ClinicalReasoning {
  id: string;
  patientId: string;
  sessionId?: string;
  doctorId: string;
  differentialDiagnosis: any[];
  diagnosticPlan?: string;
  reasoningRationale?: string;
  finalNotes?: string;
  status: 'draft' | 'under_review' | 'approved' | 'rejected';
  approvedAt?: Date;
  version: number;
}

export class ClinicalRepository {
  /**
   * Save clinical considerations
   */
  async saveConsiderations(
    patientId: string,
    sessionId: string,
    considerations: Array<{
      conditionName: string;
      likelihood: 'high' | 'moderate' | 'low';
      urgency: 'urgent' | 'routine' | 'non-urgent';
      supportingFactors: string[];
      explanation: string;
    }>
  ): Promise<ClinicalConsideration[]> {
    const results: ClinicalConsideration[] = [];

    for (const consideration of considerations) {
      const result = await query(
        `INSERT INTO differentials (
          patient_id, encounter_id, diagnosis_name, likelihood, urgency,
          supporting_evidence, clinical_reasoning, status, source, added_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'ai', NULL)
        RETURNING *`,
        [
          patientId,
          sessionId,
          consideration.conditionName,
          consideration.likelihood,
          consideration.urgency,
          JSON.stringify(consideration.supportingFactors),
          consideration.explanation,
        ]
      );

      results.push(this.mapConsideration(result[0]));
    }

    return results;
  }

  private mapConsideration(raw: any): ClinicalConsideration {
    return {
      id: raw.id,
      patientId: raw.patient_id,
      sessionId: raw.encounter_id,
      conditionName: raw.diagnosis_name,
      likelihood: raw.likelihood,
      urgency: raw.urgency,
      supportingFactors: raw.supporting_evidence,
      explanation: raw.clinical_reasoning,
      status: raw.status,
      doctorNotes: raw.doctor_notes,
      reviewedBy: raw.reviewed_by,
      reviewedAt: raw.reviewed_at,
      generatedAt: raw.added_at,
    };
  }

  /**
   * Get considerations by session
   */
  async getConsiderationsBySession(sessionId: string): Promise<ClinicalConsideration[]> {
    const result = await query(
      `SELECT * FROM differentials
       WHERE encounter_id = $1 AND source = 'ai'
       ORDER BY
         CASE urgency
           WHEN 'urgent' THEN 1
           WHEN 'routine' THEN 2
           WHEN 'non-urgent' THEN 3
         END,
         CASE likelihood
           WHEN 'high' THEN 1
           WHEN 'moderate' THEN 2
           WHEN 'low' THEN 3
         END`,
      [sessionId]
    );

    return result.map((raw: any) => this.mapConsideration(raw));
  }

  /**
   * Update consideration status
   */
  async updateConsiderationStatus(
    considerationId: string,
    status: 'accepted' | 'modified' | 'rejected',
    doctorId: string,
    doctorNotes?: string
  ): Promise<void> {
    await query(
      `UPDATE differentials
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, doctor_notes = $3
       WHERE id = $4 AND source = 'ai'`,
      [status, doctorId, doctorNotes || null, considerationId]
    );
  }

  /**
   * Create clinical reasoning
   */
  async createReasoning(reasoning: {
    patientId: string;
    sessionId?: string;
    doctorId: string;
    differentialDiagnosis: any[];
    diagnosticPlan?: string;
    reasoningRationale?: string;
    finalNotes?: string;
  }): Promise<ClinicalReasoning> {
    const result = await query(
      `INSERT INTO clinical_reasoning (
        patient_id, session_id, doctor_id, differential_diagnosis,
        diagnostic_plan, reasoning_rationale, final_notes, status, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', 1)
      RETURNING *`,
      [
        reasoning.patientId,
        reasoning.sessionId || null,
        reasoning.doctorId,
        JSON.stringify(reasoning.differentialDiagnosis),
        reasoning.diagnosticPlan || null,
        reasoning.reasoningRationale || null,
        reasoning.finalNotes || null,
      ]
    );
    
    const raw = result[0];
    
    // Transform snake_case to camelCase
    return {
      id: raw.id,
      patientId: raw.patient_id,
      sessionId: raw.session_id,
      doctorId: raw.doctor_id,
      differentialDiagnosis: raw.differential_diagnosis,
      diagnosticPlan: raw.diagnostic_plan,
      reasoningRationale: raw.reasoning_rationale,
      finalNotes: raw.final_notes,
      status: raw.status,
      approvedAt: raw.approved_at,
      version: raw.version,
    };
  }

  /**
   * Update clinical reasoning
   */
  async updateReasoning(
    reasoningId: string,
    updates: {
      differentialDiagnosis?: any[];
      diagnosticPlan?: string;
      reasoningRationale?: string;
      finalNotes?: string;
      status?: 'draft' | 'under_review' | 'approved' | 'rejected';
    }
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.differentialDiagnosis !== undefined) {
      fields.push(`differential_diagnosis = $${paramIndex++}`);
      values.push(JSON.stringify(updates.differentialDiagnosis));
    }
    if (updates.diagnosticPlan !== undefined) {
      fields.push(`diagnostic_plan = $${paramIndex++}`);
      values.push(updates.diagnosticPlan);
    }
    if (updates.reasoningRationale !== undefined) {
      fields.push(`reasoning_rationale = $${paramIndex++}`);
      values.push(updates.reasoningRationale);
    }
    if (updates.finalNotes !== undefined) {
      fields.push(`final_notes = $${paramIndex++}`);
      values.push(updates.finalNotes);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
      if (updates.status === 'approved') {
        fields.push(`approved_at = CURRENT_TIMESTAMP`);
      }
    }

    if (fields.length === 0) return;

    values.push(reasoningId);
    await query(
      `UPDATE clinical_reasoning SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Get reasoning by session
   */
  async getReasoningBySession(sessionId: string): Promise<ClinicalReasoning | null> {
    const result = await query(
      `SELECT * FROM clinical_reasoning 
       WHERE session_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [sessionId]
    );
    
    if (!result[0]) return null;
    
    const raw = result[0];
    
    // Transform snake_case to camelCase
    return {
      id: raw.id,
      patientId: raw.patient_id,
      sessionId: raw.session_id,
      doctorId: raw.doctor_id,
      differentialDiagnosis: raw.differential_diagnosis,
      diagnosticPlan: raw.diagnostic_plan,
      reasoningRationale: raw.reasoning_rationale,
      finalNotes: raw.final_notes,
      status: raw.status,
      approvedAt: raw.approved_at,
      version: raw.version,
    };
  }

  /**
   * Get reasoning by ID
   */
  async getReasoningById(reasoningId: string): Promise<ClinicalReasoning | null> {
    const result = await query(
      'SELECT * FROM clinical_reasoning WHERE id = $1',
      [reasoningId]
    );
    
    if (!result[0]) return null;
    
    const raw = result[0];
    
    // Transform snake_case to camelCase
    return {
      id: raw.id,
      patientId: raw.patient_id,
      sessionId: raw.session_id,
      doctorId: raw.doctor_id,
      differentialDiagnosis: raw.differential_diagnosis,
      diagnosticPlan: raw.diagnostic_plan,
      reasoningRationale: raw.reasoning_rationale,
      finalNotes: raw.final_notes,
      status: raw.status,
      approvedAt: raw.approved_at,
      version: raw.version,
    };
  }
}

export const clinicalRepository = new ClinicalRepository();
