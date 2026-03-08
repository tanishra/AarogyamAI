import { query, transaction } from '../config/database';

export interface ChatSession {
  id: string;
  patientId: string;
  status: 'active' | 'completed' | 'abandoned' | 'emergency';
  startedAt: Date;
  completedAt?: Date;
  durationMinutes?: number;
  messageCount: number;
  emergencyDetected: boolean;
  metadata: any;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: any;
  createdAt: Date;
}

export interface PatientSummary {
  id: string;
  sessionId: string;
  patientId: string;
  chiefComplaint: string;
  symptoms: string[];
  duration: string;
  severity: string;
  medicalHistory: string[];
  currentMedications: string[];
  allergies: string[];
  socialHistory: any;
  reviewOfSystems: any;
}

export class ChatRepository {
  /**
   * Create new chat session
   */
  async createSession(patientId: string): Promise<ChatSession> {
    const result = await query(
      `INSERT INTO chat_sessions (patient_id, status, started_at)
       VALUES ($1, 'active', CURRENT_TIMESTAMP)
       RETURNING *`,
      [patientId]
    );
    
    const raw = result[0];
    
    // Transform snake_case to camelCase
    return {
      id: raw.id,
      patientId: raw.patient_id,
      status: raw.status,
      startedAt: raw.started_at,
      completedAt: raw.completed_at,
      durationMinutes: raw.duration_minutes,
      messageCount: raw.message_count,
      emergencyDetected: raw.emergency_detected,
      metadata: raw.metadata,
    };
  }

  /**
   * Get chat session by ID
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    const result = await query(
      'SELECT * FROM chat_sessions WHERE id = $1',
      [sessionId]
    );
    
    if (!result[0]) return null;
    
    const raw = result[0];
    
    // Transform snake_case to camelCase
    return {
      id: raw.id,
      patientId: raw.patient_id,
      status: raw.status,
      startedAt: raw.started_at,
      completedAt: raw.completed_at,
      durationMinutes: raw.duration_minutes,
      messageCount: raw.message_count,
      emergencyDetected: raw.emergency_detected,
      metadata: raw.metadata,
    };
  }

  /**
   * Get active session for patient
   */
  async getActiveSession(patientId: string): Promise<ChatSession | null> {
    const result = await query(
      `SELECT * FROM chat_sessions 
       WHERE patient_id = $1 AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`,
      [patientId]
    );
    
    if (!result[0]) return null;
    
    const raw = result[0];
    
    // Transform snake_case to camelCase
    return {
      id: raw.id,
      patientId: raw.patient_id,
      status: raw.status,
      startedAt: raw.started_at,
      completedAt: raw.completed_at,
      durationMinutes: raw.duration_minutes,
      messageCount: raw.message_count,
      emergencyDetected: raw.emergency_detected,
      metadata: raw.metadata,
    };
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    sessionId: string,
    status: 'active' | 'completed' | 'abandoned' | 'emergency',
    emergencyDetected: boolean = false
  ): Promise<void> {
    if (status === 'completed') {
      await query(
        `UPDATE chat_sessions 
         SET status = $1::VARCHAR, 
             emergency_detected = $2,
             completed_at = CURRENT_TIMESTAMP,
             duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) / 60
         WHERE id = $3`,
        [status, emergencyDetected, sessionId]
      );
    } else {
      await query(
        `UPDATE chat_sessions 
         SET status = $1::VARCHAR, 
             emergency_detected = $2
         WHERE id = $3`,
        [status, emergencyDetected, sessionId]
      );
    }
  }

  /**
   * Add message to session
   */
  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: any = {}
  ): Promise<ChatMessage> {
    return await transaction(async (client) => {
      // Insert message
      const messageResult = await client.query<ChatMessage>(
        `INSERT INTO chat_messages (session_id, role, content, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [sessionId, role, content, JSON.stringify(metadata)]
      );

      // Update message count
      await client.query(
        `UPDATE chat_sessions 
         SET message_count = message_count + 1
         WHERE id = $1`,
        [sessionId]
      );

      return messageResult.rows[0];
    });
  }

  /**
   * Get all messages for session
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return await query<ChatMessage>(
      `SELECT * FROM chat_messages 
       WHERE session_id = $1 
       ORDER BY created_at ASC`,
      [sessionId]
    );
  }

  /**
   * Save patient summary
   */
  async saveSummary(summary: Omit<PatientSummary, 'id'>): Promise<PatientSummary> {
    const result = await query(
      `INSERT INTO patient_summaries (
        session_id, patient_id, chief_complaint, symptoms, duration, severity,
        medical_history, current_medications, allergies, social_history, review_of_systems
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (session_id) 
      DO UPDATE SET
        chief_complaint = EXCLUDED.chief_complaint,
        symptoms = EXCLUDED.symptoms,
        duration = EXCLUDED.duration,
        severity = EXCLUDED.severity,
        medical_history = EXCLUDED.medical_history,
        current_medications = EXCLUDED.current_medications,
        allergies = EXCLUDED.allergies,
        social_history = EXCLUDED.social_history,
        review_of_systems = EXCLUDED.review_of_systems,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        summary.sessionId,
        summary.patientId,
        summary.chiefComplaint,
        JSON.stringify(summary.symptoms),
        summary.duration,
        summary.severity,
        JSON.stringify(summary.medicalHistory),
        JSON.stringify(summary.currentMedications),
        JSON.stringify(summary.allergies),
        JSON.stringify(summary.socialHistory),
        JSON.stringify(summary.reviewOfSystems),
      ]
    );
    
    const raw = result[0];
    
    // Transform snake_case to camelCase
    return {
      id: raw.id,
      sessionId: raw.session_id,
      patientId: raw.patient_id,
      chiefComplaint: raw.chief_complaint,
      symptoms: raw.symptoms,
      duration: raw.duration,
      severity: raw.severity,
      medicalHistory: raw.medical_history,
      currentMedications: raw.current_medications,
      allergies: raw.allergies,
      socialHistory: raw.social_history,
      reviewOfSystems: raw.review_of_systems,
    };
  }

  /**
   * Get patient summary by session
   */
  async getSummary(sessionId: string): Promise<PatientSummary | null> {
    const result = await query(
      'SELECT * FROM patient_summaries WHERE session_id = $1',
      [sessionId]
    );
    
    if (!result[0]) return null;
    
    const raw = result[0];
    
    // Transform snake_case to camelCase
    return {
      id: raw.id,
      sessionId: raw.session_id,
      patientId: raw.patient_id,
      chiefComplaint: raw.chief_complaint,
      symptoms: raw.symptoms,
      duration: raw.duration,
      severity: raw.severity,
      medicalHistory: raw.medical_history,
      currentMedications: raw.current_medications,
      allergies: raw.allergies,
      socialHistory: raw.social_history,
      reviewOfSystems: raw.review_of_systems,
    };
  }

  /**
   * Get patient's chat history
   */
  async getPatientSessions(patientId: string, limit: number = 10): Promise<ChatSession[]> {
    const result = await query(
      `SELECT * FROM chat_sessions 
       WHERE patient_id = $1 
       ORDER BY started_at DESC 
       LIMIT $2`,
      [patientId, limit]
    );
    
    // Transform snake_case to camelCase for each session
    return result.map((raw: any) => ({
      id: raw.id,
      patientId: raw.patient_id,
      status: raw.status,
      startedAt: raw.started_at,
      completedAt: raw.completed_at,
      durationMinutes: raw.duration_minutes,
      messageCount: raw.message_count,
      emergencyDetected: raw.emergency_detected,
      metadata: raw.metadata,
    }));
  }
}

export const chatRepository = new ChatRepository();
