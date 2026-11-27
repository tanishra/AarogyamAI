import { query } from '../config/database';

let profileTableReady = false;

export interface ProfilePayload {
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  organization?: string;
  department?: string;
  specialization?: string;
  licenseNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  preferredLanguage?: string;
  timezone?: string;
  bio?: string;
}

/** users row LEFT JOINed with user_profiles */
export interface ProfileWithUserRow {
  id: string;
  name: string;
  email: string;
  role: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';
  is_active: boolean;
  created_at: Date;
  phone: string | null;
  /** pg returns DATE columns as 'YYYY-MM-DD' strings */
  date_of_birth: string | null;
  gender: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  organization: string | null;
  department: string | null;
  specialization: string | null;
  license_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  preferred_language: string | null;
  timezone: string | null;
  bio: string | null;
  profile_updated_at: Date | null;
}

/** chat_sessions projection for the patient activity view */
export interface PatientSessionRow {
  id: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  emergency_detected: boolean | null;
}

/** patient_queue row joined with the patient's name (nurse activity) */
export interface NurseHandledRow {
  patient_id: string;
  session_id: string;
  status: string;
  priority: string;
  updated_at: Date;
  patient_name: string;
}

/** clinical_reasoning row joined with the patient's name (doctor activity) */
export interface DoctorReasoningRow {
  id: string;
  patient_id: string;
  status: string;
  updated_at: Date;
  patient_name: string;
}

interface NurseQueueStatsRow {
  assigned_count: string;
  handed_off_count: string;
  open_queue_count: string;
}

interface DoctorReviewStatsRow {
  assigned_count: string;
  under_review_count: string;
  completed_count: string;
}

/**
 * ProfileRepository — owns user_profiles persistence and per-role
 * activity queries used by the profile routes.
 */
export class ProfileRepository {
  /** Lazy DDL — creates user_profiles on first use (local-dev convenience). */
  async ensureProfileTable(): Promise<void> {
    if (profileTableReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        phone VARCHAR(30),
        date_of_birth DATE,
        gender VARCHAR(30),
        address_line_1 VARCHAR(255),
        address_line_2 VARCHAR(255),
        city VARCHAR(120),
        state VARCHAR(120),
        country VARCHAR(120),
        postal_code VARCHAR(20),
        organization VARCHAR(180),
        department VARCHAR(180),
        specialization VARCHAR(180),
        license_number VARCHAR(120),
        emergency_contact_name VARCHAR(120),
        emergency_contact_phone VARCHAR(30),
        preferred_language VARCHAR(60),
        timezone VARCHAR(80),
        bio TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_user_profiles_org ON user_profiles(organization)');
    await query(
      'CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON user_profiles(department)'
    );

    profileTableReady = true;
  }

  async getProfileWithUser(userId: string): Promise<ProfileWithUserRow | null> {
    const rows = await query<ProfileWithUserRow>(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.is_active,
        u.created_at,
        p.phone,
        p.date_of_birth,
        p.gender,
        p.address_line_1,
        p.address_line_2,
        p.city,
        p.state,
        p.country,
        p.postal_code,
        p.organization,
        p.department,
        p.specialization,
        p.license_number,
        p.emergency_contact_name,
        p.emergency_contact_phone,
        p.preferred_language,
        p.timezone,
        p.bio,
        p.updated_at as profile_updated_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async updateUserName(userId: string, name: string): Promise<void> {
    await query('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), userId]);
  }

  async upsertProfile(userId: string, payload: ProfilePayload): Promise<void> {
    await query(
      `INSERT INTO user_profiles (
        user_id, phone, date_of_birth, gender, address_line_1, address_line_2, city, state, country, postal_code,
        organization, department, specialization, license_number, emergency_contact_name, emergency_contact_phone,
        preferred_language, timezone, bio, updated_at
      ) VALUES (
        $1, $2, NULLIF($3, '')::date, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        phone = EXCLUDED.phone,
        date_of_birth = EXCLUDED.date_of_birth,
        gender = EXCLUDED.gender,
        address_line_1 = EXCLUDED.address_line_1,
        address_line_2 = EXCLUDED.address_line_2,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country,
        postal_code = EXCLUDED.postal_code,
        organization = EXCLUDED.organization,
        department = EXCLUDED.department,
        specialization = EXCLUDED.specialization,
        license_number = EXCLUDED.license_number,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        preferred_language = EXCLUDED.preferred_language,
        timezone = EXCLUDED.timezone,
        bio = EXCLUDED.bio,
        updated_at = NOW()`,
      [
        userId,
        payload.phone || null,
        payload.dateOfBirth || null,
        payload.gender || null,
        payload.addressLine1 || null,
        payload.addressLine2 || null,
        payload.city || null,
        payload.state || null,
        payload.country || null,
        payload.postalCode || null,
        payload.organization || null,
        payload.department || null,
        payload.specialization || null,
        payload.licenseNumber || null,
        payload.emergencyContactName || null,
        payload.emergencyContactPhone || null,
        payload.preferredLanguage || null,
        payload.timezone || null,
        payload.bio || null,
      ]
    );
  }

  async getPatientSessions(userId: string): Promise<PatientSessionRow[]> {
    return query<PatientSessionRow>(
      `SELECT id, status, started_at, completed_at, emergency_detected
       FROM chat_sessions
       WHERE patient_id = $1
       ORDER BY started_at DESC
       LIMIT 10`,
      [userId]
    );
  }

  async getPatientVitalsCount(userId: string): Promise<number> {
    const rows = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM vital_signs WHERE patient_id = $1',
      [userId]
    );
    return Number(rows[0]?.count || 0);
  }

  async getPatientConsentCount(userId: string): Promise<number> {
    const rows = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM consent_records WHERE patient_id = $1 AND status = 'active'",
      [userId]
    );
    return Number(rows[0]?.count || 0);
  }

  async getNurseQueueStats(userId: string): Promise<Partial<NurseQueueStatsRow>> {
    const rows = await query<NurseQueueStatsRow>(
      `SELECT
         COUNT(*) FILTER (WHERE assigned_nurse = $1) as assigned_count,
         COUNT(*) FILTER (WHERE assigned_nurse = $1 AND status = 'ready_for_doctor') as handed_off_count,
         COUNT(*) FILTER (WHERE status IN ('chat_completed', 'vitals_added')) as open_queue_count
       FROM patient_queue`,
      [userId]
    );
    return rows[0] ?? {};
  }

  async getNurseRecentHandled(userId: string): Promise<NurseHandledRow[]> {
    return query<NurseHandledRow>(
      `SELECT
         pq.patient_id,
         pq.session_id,
         pq.status,
         pq.priority,
         pq.updated_at,
         u.name as patient_name
       FROM patient_queue pq
       JOIN users u ON u.id = pq.patient_id
       WHERE pq.assigned_nurse = $1
       ORDER BY pq.updated_at DESC
       LIMIT 10`,
      [userId]
    );
  }

  async getDoctorReviewStats(userId: string): Promise<Partial<DoctorReviewStatsRow>> {
    const rows = await query<DoctorReviewStatsRow>(
      `SELECT
         COUNT(*) FILTER (WHERE assigned_doctor = $1) as assigned_count,
         COUNT(*) FILTER (WHERE assigned_doctor = $1 AND status = 'under_review') as under_review_count,
         COUNT(*) FILTER (WHERE assigned_doctor = $1 AND status = 'completed') as completed_count
       FROM patient_queue`,
      [userId]
    );
    return rows[0] ?? {};
  }

  async getDoctorRecentReasoning(userId: string): Promise<DoctorReasoningRow[]> {
    return query<DoctorReasoningRow>(
      `SELECT
         cr.id,
         cr.patient_id,
         cr.status,
         cr.updated_at,
         u.name as patient_name
       FROM clinical_reasoning cr
       JOIN users u ON u.id = cr.patient_id
       WHERE cr.doctor_id = $1
       ORDER BY cr.updated_at DESC
       LIMIT 10`,
      [userId]
    );
  }
}

export const profileRepository = new ProfileRepository();
