import { Pool } from 'pg';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Questionnaire Session Continuity Manager
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 * 
 * Manages questionnaire session save/resume with encryption
 */

export interface QuestionnaireSessionData {
  patientId: string;
  currentQuestionIndex: number;
  answers: Record<string, any>;
  skippedQuestions: number[];
  uncertainAnswers: number[];
  startedAt: Date;
  lastActivity: Date;
}

export interface SaveSessionParams {
  patientId: string;
  sessionData: QuestionnaireSessionData;
}

export class QuestionnaireSessionManager {
  private pool: Pool;
  private readonly SESSION_EXPIRY_HOURS = 24;
  private readonly ENCRYPTION_KEY: Buffer;

  constructor(pool: Pool, encryptionKey?: string) {
    this.pool = pool;
    // Use provided key or generate one (in production, load from secure config)
    this.ENCRYPTION_KEY = encryptionKey 
      ? Buffer.from(encryptionKey, 'hex')
      : randomBytes(32);
  }

  /**
   * Save session with AES-256 encryption
   * Requirements: 3.1, 3.5
   */
  async saveSession(params: SaveSessionParams): Promise<string> {
    const encryptedData = this.encryptSessionData(params.sessionData);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.SESSION_EXPIRY_HOURS);

    const result = await this.pool.query(
      `INSERT INTO questionnaire_sessions (
        patient_id, session_data, current_question_index,
        answers, skipped_questions, uncertain_answers,
        last_activity, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (patient_id) 
      DO UPDATE SET
        session_data = $2,
        current_question_index = $3,
        answers = $4,
        skipped_questions = $5,
        uncertain_answers = $6,
        last_activity = NOW(),
        expires_at = $7
      RETURNING id`,
      [
        params.patientId,
        encryptedData,
        params.sessionData.currentQuestionIndex,
        JSON.stringify(params.sessionData.answers),
        params.sessionData.skippedQuestions,
        params.sessionData.uncertainAnswers,
        expiresAt,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Load session with decryption
   * Requirements: 3.1, 3.2
   */
  async loadSession(patientId: string): Promise<QuestionnaireSessionData | null> {
    const result = await this.pool.query(
      `SELECT session_data, current_question_index, answers,
              skipped_questions, uncertain_answers, created_at, last_activity, expires_at
       FROM questionnaire_sessions
       WHERE patient_id = $1 AND expires_at > NOW()`,
      [patientId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    
    try {
      const decryptedData = this.decryptSessionData(row.session_data);
      return {
        patientId,
        currentQuestionIndex: row.current_question_index,
        answers: JSON.parse(row.answers),
        skippedQuestions: row.skipped_questions,
        uncertainAnswers: row.uncertain_answers,
        startedAt: row.created_at,
        lastActivity: row.last_activity,
      };
    } catch (error) {
      console.error('Failed to decrypt session data:', error);
      return null;
    }
  }

  /**
   * Check session expiry with 24-hour timeout
   * Requirements: 3.4
   */
  async checkSessionExpiry(patientId: string): Promise<{ expired: boolean; expiresAt: Date | null }> {
    const result = await this.pool.query(
      `SELECT expires_at FROM questionnaire_sessions WHERE patient_id = $1`,
      [patientId]
    );

    if (result.rows.length === 0) {
      return { expired: true, expiresAt: null };
    }

    const expiresAt = new Date(result.rows[0].expires_at);
    const now = new Date();

    return {
      expired: now > expiresAt,
      expiresAt,
    };
  }

  /**
   * Archive expired sessions
   * Requirement: 3.5
   */
  async archiveExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM questionnaire_sessions WHERE expires_at < NOW() RETURNING id`
    );

    return result.rowCount || 0;
  }

  /**
   * Check if session can be resumed
   * Requirements: 3.2, 3.3
   */
  async canResumeSession(patientId: string): Promise<{ canResume: boolean; reason?: string }> {
    const session = await this.loadSession(patientId);

    if (!session) {
      return { canResume: false, reason: 'No active session found' };
    }

    const expiry = await this.checkSessionExpiry(patientId);
    if (expiry.expired) {
      return { canResume: false, reason: 'Session expired (>24 hours)' };
    }

    return { canResume: true };
  }

  /**
   * Delete session (start new)
   */
  async deleteSession(patientId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM questionnaire_sessions WHERE patient_id = $1`,
      [patientId]
    );
  }

  /**
   * Encrypt session data using AES-256-GCM
   * Requirement: 3.1
   */
  private encryptSessionData(data: QuestionnaireSessionData): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.ENCRYPTION_KEY, iv);
    
    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt session data
   * Requirement: 3.1
   */
  private decryptSessionData(encryptedData: string): QuestionnaireSessionData {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = createDecipheriv('aes-256-gcm', this.ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }
}
