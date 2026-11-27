import { query } from '../config/database';

/** patient_queue row joined with patient/chat session info (doctor queue) */
export interface DoctorQueueRow {
  queue_id: string;
  patient_id: string;
  session_id: string;
  status: string;
  priority: string;
  created_at: Date;
  patient_name: string;
  patient_email: string;
  chat_completed_at: Date | null;
  emergency_detected: boolean | null;
  nurse_name: string | null;
}

/** patient_queue row joined with patient/chat session info (nurse queue) */
export type NurseQueueRow = Omit<DoctorQueueRow, 'nurse_name'>;

/** Completed-encounter projection across chat_sessions, summaries, reasoning */
export interface CompletedEncounterRow {
  session_id: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  duration_minutes: number | null;
  emergency_detected: boolean | null;
  chief_complaint: string | null;
  symptoms: unknown;
  symptom_duration: string | null;
  severity: string | null;
  medical_history: unknown;
  current_medications: unknown;
  allergies: unknown;
  reasoning_id: string | null;
  differential_diagnosis: unknown;
  diagnostic_plan: unknown;
  reasoning_rationale: string | null;
  final_notes: string | null;
  reasoning_status: string | null;
  approved_at: Date | null;
  doctor_name: string | null;
  doctor_email: string | null;
  priority: string | null;
  nurse_name: string | null;
}

/** clinical_reasoning row (cr.*) plus joined doctor info */
export interface ReasoningHistoryRow {
  id: string;
  patient_id: string;
  session_id: string;
  doctor_id: string | null;
  doctor_name: string | null;
  doctor_email: string | null;
  differential_diagnosis: unknown;
  diagnostic_plan: unknown;
  reasoning_rationale: string | null;
  final_notes: string | null;
  status: string;
  approved_at: Date | null;
  created_at: Date;
  version: number;
}

/** DISTINCT ON (u.id) completed-patient projection for a doctor */
export interface CompletedPatientRow {
  patient_id: string;
  patient_name: string;
  patient_email: string;
  last_session_id: string;
  last_visit: Date | null;
  last_complaint: string | null;
  last_plan: unknown;
  reasoning_status: string;
  last_priority: string | null;
}

/** patient_summaries row joined with session start time */
export interface PatientSummaryRow {
  id: string;
  session_id: string;
  medical_history: unknown;
  current_medications: unknown;
  allergies: unknown;
  social_history: unknown;
  updated_at: Date | null;
  started_at: Date | null;
}

/** Approved clinical_reasoning projection with owning patient id */
export interface ApprovedReasoningRow {
  id: string;
  session_id: string;
  differential_diagnosis: unknown;
  diagnostic_plan: unknown;
  reasoning_rationale: string | null;
  final_notes: string | null;
  status: string;
  approved_at: Date | null;
  patient_id: string;
}

/** Approved clinical_reasoning projection without the patient join */
export type ApprovedReasoningPlainRow = Omit<ApprovedReasoningRow, 'patient_id'>;

/** differentials projection exposed as encounter considerations */
export interface ConsiderationRow {
  condition_name: string;
  likelihood: string;
  urgency: string;
  explanation: string | null;
  doctor_notes: string | null;
  status: string;
}

interface ConsentCountsRow {
  total: number;
  active: number;
  withdrawn: number;
  expired: number;
}

interface WithdrawalCountsRow {
  total: number;
  processed: number;
  pending: number;
}

interface GrievanceCountsRow {
  total: number;
  pending: number;
  investigating: number;
  resolved: number;
  escalated: number;
}

interface DataAccessCountsRow {
  total: number;
  pending: number;
  fulfilled: number;
}

/**
 * WorkflowRepository — owns cross-table clinical workflow queries:
 * patient_queue, encounter history, reasoning lookups, nurse/doctor queues,
 * and critical alerts. Transport-layer SQL lives here, not in routes.
 */
export class WorkflowRepository {
  /** Doctor queue: patients ready for review */
  async getDoctorQueue(): Promise<DoctorQueueRow[]> {
    return query<DoctorQueueRow>(
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
  async getNurseQueue(): Promise<NurseQueueRow[]> {
    return query<NurseQueueRow>(
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
  ): Promise<Record<string, unknown>[]> {
    return query<Record<string, unknown>>(
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
  async getCompletedEncounters(patientId: string): Promise<CompletedEncounterRow[]> {
    return query<CompletedEncounterRow>(
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
  async getReasoningHistoryByPatient(patientId: string): Promise<ReasoningHistoryRow[]> {
    return query<ReasoningHistoryRow>(
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
  async getCompletedPatientsForDoctor(
    doctorId: string,
    limit: number
  ): Promise<CompletedPatientRow[]> {
    return query<CompletedPatientRow>(
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
  async getLatestSummary(patientId: string): Promise<Record<string, unknown> | null> {
    const rows = await query<Record<string, unknown>>(
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
  async getSummariesByPatient(patientId: string): Promise<PatientSummaryRow[]> {
    return query<PatientSummaryRow>(
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
  async getApprovedReasoning(sessionId: string): Promise<ApprovedReasoningRow | null> {
    const rows = await query<ApprovedReasoningRow>(
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
  async getApprovedReasoningPlain(
    sessionId: string
  ): Promise<ApprovedReasoningPlainRow | null> {
    const rows = await query<ApprovedReasoningPlainRow>(
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
  async getConsiderationsForEncounter(sessionId: string): Promise<ConsiderationRow[]> {
    return query<ConsiderationRow>(
      `SELECT
        diagnosis_name AS condition_name,
        likelihood,
        urgency,
        clinical_reasoning AS explanation,
        doctor_notes,
        status
      FROM differentials
      WHERE encounter_id = $1 AND source = 'ai'
      ORDER BY
        CASE likelihood
          WHEN 'high' THEN 1
          WHEN 'moderate' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END`,
      [sessionId]
    );
  }

  /** Active critical alerts with patient info, severity-ordered */
  async getActiveAlerts(): Promise<Record<string, unknown>[]> {
    return query<Record<string, unknown>>(
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

  async findUserBasic(
    userId: string
  ): Promise<{ id: string; name: string; email: string } | null> {
    const rows = await query<{ id: string; name: string; email: string }>(
      'SELECT id, name, email FROM users WHERE id = $1',
      [userId]
    );
    return rows[0] ?? null;
  }

  /**
   * Compliance aggregates across consent_records, withdrawal requests,
   * grievances, and data access requests for the compliance report.
   */
  async getComplianceSummary(startDate?: string, endDate?: string): Promise<{
    consentRecords: { total: number; active: number; withdrawn: number; expired: number };
    withdrawalRequests: { total: number; processed: number; pending: number };
    grievances: {
      total: number;
      pending: number;
      investigating: number;
      resolved: number;
      escalated: number;
    };
    dataAccessRequests: { total: number; pending: number; fulfilled: number };
  }> {
    const range = (col: string) => {
      const clauses: string[] = [];
      if (startDate) clauses.push(`${col} >= '${startDate}'`);
      if (endDate) clauses.push(`${col} <= '${endDate}'`);
      return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
    };

    const [consent, withdrawals, grievanceRows, darRows] = await Promise.all([
      query<ConsentCountsRow>(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'withdrawn')::int AS withdrawn,
          COUNT(*) FILTER (WHERE status = 'expired')::int AS expired
        FROM consent_records WHERE 1=1${range('granted_at')}`
      ),
      query<WithdrawalCountsRow>(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'processed')::int AS processed,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
        FROM consent_withdrawal_requests WHERE 1=1${range('requested_at')}`
      ),
      query<GrievanceCountsRow>(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'investigating')::int AS investigating,
          COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
          COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated
        FROM grievances WHERE 1=1${range('submitted_at')}`
      ),
      query<DataAccessCountsRow>(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'fulfilled')::int AS fulfilled
        FROM data_access_requests WHERE 1=1${range('submitted_at')}`
      ),
    ]);

    return {
      consentRecords: consent[0] ?? { total: 0, active: 0, withdrawn: 0, expired: 0 },
      withdrawalRequests: withdrawals[0] ?? { total: 0, processed: 0, pending: 0 },
      grievances: grievanceRows[0] ?? {
        total: 0,
        pending: 0,
        investigating: 0,
        resolved: 0,
        escalated: 0,
      },
      dataAccessRequests: darRows[0] ?? { total: 0, pending: 0, fulfilled: 0 },
    };
  }
}

export const workflowRepository = new WorkflowRepository();
