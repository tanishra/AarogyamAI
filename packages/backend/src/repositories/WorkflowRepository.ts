import { query } from '../config/database';

/**
 * WorkflowRepository — owns cross-table clinical workflow queries:
 * patient_queue, encounter history, reasoning lookups, nurse/doctor queues,
 * and critical alerts. Transport-layer SQL lives here, not in routes.
 */
export class WorkflowRepository {
  /** Doctor queue: patients ready for review */
  async getDoctorQueue(): Promise<any[]> {
    return query(
      `SELECT
        pq.id as queue_id,
        pq.patient_id,
        pq.session_id,
        pq.status,
        pq.priority,
        pq.created_at,
        u.name as patient_name,
        u.email as patient_email,
        cs.completed_at as chat_completed_at,
        cs.emergency_detected,
        nurse.name as nurse_name
      FROM patient_queue pq
      JOIN users u ON pq.patient_id = u.id
      JOIN chat_sessions cs ON pq.session_id = cs.id
      LEFT JOIN users nurse ON pq.assigned_nurse = nurse.id
      WHERE pq.status IN ('ready_for_doctor', 'under_review')
      ORDER BY
        CASE pq.priority
          WHEN 'emergency' THEN 1
          WHEN 'urgent' THEN 2
          WHEN 'routine' THEN 3
        END,
        pq.created_at ASC`
    );
  }

  /** Nurse queue: patients waiting for vitals/review */
  async getNurseQueue(): Promise<any[]> {
    return query(
      `SELECT
        pq.id as queue_id,
        pq.patient_id,
        pq.session_id,
        pq.status,
        pq.priority,
        pq.created_at,
        u.name as patient_name,
        u.email as patient_email,
        cs.completed_at as chat_completed_at,
        cs.emergency_detected
      FROM patient_queue pq
      JOIN users u ON pq.patient_id = u.id
      JOIN chat_sessions cs ON pq.session_id = cs.id
      WHERE pq.status IN ('chat_completed', 'vitals_added')
      ORDER BY
        CASE pq.priority
          WHEN 'emergency' THEN 1
          WHEN 'urgent' THEN 2
          WHEN 'routine' THEN 3
        END,
        pq.created_at ASC`
    );
  }

  async updateQueueStatus(
    patientId: string,
    sessionId: string,
    status: string,
    doctorId?: string
  ): Promise<void> {
    if (doctorId) {
      await query(
        `UPDATE patient_queue
         SET status = $1, assigned_doctor = $2
         WHERE patient_id = $3 AND session_id = $4`,
        [status, doctorId, patientId, sessionId]
      );
    } else {
      await query(
        `UPDATE patient_queue
         SET status = $1
         WHERE patient_id = $2 AND session_id = $3`,
        [status, patientId, sessionId]
      );
    }
  }

  async updateQueueStatusBySession(sessionId: string, status: string): Promise<void> {
    await query(`UPDATE patient_queue SET status = $1 WHERE session_id = $2`, [
      status,
      sessionId,
    ]);
  }

  async updateQueueStatusWithNurse(
    patientId: string,
    sessionId: string,
    status: string,
    nurseId: string
  ): Promise<void> {
    await query(
      `UPDATE patient_queue
       SET status = $1, assigned_nurse = $2
       WHERE patient_id = $3 AND session_id = $4`,
      [status, nurseId, patientId, sessionId]
    );
  }

  async updateQueueStatusWithNurseReturning(
    patientId: string,
    sessionId: string,
    status: string,
    nurseId: string
  ): Promise<any[]> {
    return query(
      `UPDATE patient_queue
       SET status = $4, assigned_nurse = $3
       WHERE patient_id = $1 AND session_id = $2
       RETURNING *`,
      [patientId, sessionId, nurseId, status]
    );
  }

  async addToQueue(patientId: string, sessionId: string): Promise<void> {
    await query(
      `INSERT INTO patient_queue (patient_id, session_id, status, priority)
       VALUES ($1, $2, 'chat_completed', 'routine')
       ON CONFLICT (patient_id, session_id) DO NOTHING`,
      [patientId, sessionId]
    );
  }

  /** Full encounter details for a patient's completed sessions */
  async getCompletedEncounters(patientId: string): Promise<any[]> {
    return query(
      `SELECT
        cs.id as session_id,
        cs.status,
        cs.started_at,
        cs.completed_at,
        cs.duration_minutes,
        cs.emergency_detected,
        ps.chief_complaint,
        ps.symptoms,
        ps.duration as symptom_duration,
        ps.severity,
        ps.medical_history,
        ps.current_medications,
        ps.allergies,
        cr.id as reasoning_id,
        cr.differential_diagnosis,
        cr.diagnostic_plan,
        cr.reasoning_rationale,
        cr.final_notes,
        cr.status as reasoning_status,
        cr.approved_at,
        doctor.name as doctor_name,
        doctor.email as doctor_email,
        pq.priority,
        nurse.name as nurse_name
      FROM chat_sessions cs
      LEFT JOIN patient_summaries ps ON cs.id = ps.session_id
      LEFT JOIN clinical_reasoning cr ON cs.id = cr.session_id AND cr.status = 'approved'
      LEFT JOIN users doctor ON cr.doctor_id = doctor.id
      LEFT JOIN patient_queue pq ON cs.id = pq.session_id
      LEFT JOIN users nurse ON pq.assigned_nurse = nurse.id
      WHERE cs.patient_id = $1
        AND cs.status = 'completed'
        AND cr.id IS NOT NULL
      ORDER BY cs.completed_at DESC
      LIMIT 20`,
      [patientId]
    );
  }

  /** All clinical reasoning rows (any status) for a patient, newest first */
  async getReasoningHistoryByPatient(patientId: string): Promise<any[]> {
    return query(
      `SELECT
        cr.*,
        doctor.name as doctor_name,
        doctor.email as doctor_email
      FROM clinical_reasoning cr
      LEFT JOIN users doctor ON cr.doctor_id = doctor.id
      WHERE cr.patient_id = $1
      ORDER BY cr.created_at DESC
      LIMIT 20`,
      [patientId]
    );
  }

  /** Distinct patients a doctor has completed+approved encounters with */
  async getCompletedPatientsForDoctor(doctorId: string, limit: number): Promise<any[]> {
    return query(
      `SELECT DISTINCT ON (u.id)
        u.id as patient_id,
        u.name as patient_name,
        u.email as patient_email,
        cs.id as last_session_id,
        cs.completed_at as last_visit,
        ps.chief_complaint as last_complaint,
        cr.diagnostic_plan as last_plan,
        cr.status as reasoning_status,
        pq.priority as last_priority
      FROM users u
      JOIN chat_sessions cs ON u.id = cs.patient_id
      JOIN clinical_reasoning cr ON cs.id = cr.session_id
      LEFT JOIN patient_summaries ps ON cs.id = ps.session_id
      LEFT JOIN patient_queue pq ON cs.id = pq.session_id
      WHERE cr.doctor_id = $1
        AND cs.status = 'completed'
        AND cr.status = 'approved'
      ORDER BY u.id, cs.completed_at DESC
      LIMIT $2`,
      [doctorId, limit]
    );
  }

  async getSessionPatientId(sessionId: string): Promise<string | null> {
    const rows = await query<{ patient_id: string }>(
      'SELECT patient_id FROM chat_sessions WHERE id = $1',
      [sessionId]
    );
    return rows[0]?.patient_id ?? null;
  }

  /** Latest patient summary row, newest first */
  async getLatestSummary(patientId: string): Promise<any | null> {
    const rows = await query(
      `SELECT *
       FROM patient_summaries
       WHERE patient_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [patientId]
    );
    return rows[0] ?? null;
  }

  /** Summary rows for a patient including session start time */
  async getSummariesByPatient(patientId: string): Promise<any[]> {
    return query(
      `SELECT
        ps.id,
        ps.session_id,
        ps.medical_history,
        ps.current_medications,
        ps.allergies,
        ps.social_history,
        ps.updated_at,
        cs.started_at
      FROM patient_summaries ps
      LEFT JOIN chat_sessions cs ON cs.id = ps.session_id
      WHERE ps.patient_id = $1
      ORDER BY ps.updated_at DESC
      LIMIT 1`,
      [patientId]
    );
  }

  async getSummarySessionId(patientId: string): Promise<string | null> {
    const rows = await query<{ session_id: string }>(
      `SELECT session_id
       FROM patient_summaries
       WHERE patient_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [patientId]
    );
    return rows[0]?.session_id ?? null;
  }

  /** Approved clinical reasoning for a session (doctor-facing) */
  async getApprovedReasoning(sessionId: string): Promise<any | null> {
    const rows = await query(
      `SELECT
        cr.id,
        cr.session_id,
        cr.differential_diagnosis,
        cr.diagnostic_plan,
        cr.reasoning_rationale,
        cr.final_notes,
        cr.status,
        cr.approved_at,
        cs.patient_id
      FROM clinical_reasoning cr
      JOIN chat_sessions cs ON cr.session_id = cs.id
      WHERE cr.session_id = $1 AND cr.status = 'approved'
      LIMIT 1`,
      [sessionId]
    );
    return rows[0] ?? null;
  }

  /** Approved reasoning without the patient join (patientChat view) */
  async getApprovedReasoningPlain(sessionId: string): Promise<any | null> {
    const rows = await query(
      `SELECT
        id,
        session_id,
        differential_diagnosis,
        diagnostic_plan,
        reasoning_rationale,
        final_notes,
        status,
        approved_at
      FROM clinical_reasoning
      WHERE session_id = $1 AND status = 'approved'
      LIMIT 1`,
      [sessionId]
    );
    return rows[0] ?? null;
  }

  /** Considerations for one encounter, ordered by likelihood */
  async getConsiderationsForEncounter(sessionId: string): Promise<any[]> {
    return query(
      `SELECT
        condition_name,
        likelihood,
        urgency,
        explanation,
        doctor_notes,
        status
      FROM clinical_considerations
      WHERE session_id = $1
      ORDER BY
        CASE likelihood
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END`,
      [sessionId]
    );
  }

  /** Active critical alerts with patient info, severity-ordered */
  async getActiveAlerts(): Promise<any[]> {
    return query(
      `SELECT
        ca.*,
        u.name as patient_name,
        u.email as patient_email
      FROM critical_alerts ca
      JOIN users u ON ca.patient_id = u.id
      WHERE ca.status = 'active'
      ORDER BY
        CASE ca.severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        ca.created_at DESC`
    );
  }

  async findUserBasic(userId: string): Promise<any | null> {
    const rows = await query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    return rows[0] ?? null;
  }
}

export const workflowRepository = new WorkflowRepository();
