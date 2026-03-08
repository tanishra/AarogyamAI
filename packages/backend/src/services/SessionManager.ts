import { Pool } from 'pg';
import { randomBytes } from 'crypto';

/**
 * Session Manager Service
 * Requirements: 14.1, 14.2, 14.3, 14.5, 14.6
 * 
 * Manages user sessions with inactivity timeout and activity tracking
 */

export interface CreateSessionParams {
  userId: string;
  ipAddress: string;
  userAgent: string;
  deviceType?: string;
  mfaVerified: boolean;
}

export interface SessionData {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress: string;
  userAgent: string;
  deviceType: string | null;
  mfaVerified: boolean;
  lastActivity: Date;
  expiresAt: Date;
  createdAt: Date;
}

export class SessionManager {
  private pool: Pool;
  private readonly INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new session with metadata capture
   * Requirement: 14.1
   */
  async createSession(params: CreateSessionParams): Promise<{ sessionId: string; token: string }> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION_MS);

    const result = await this.pool.query(
      `INSERT INTO sessions (
        user_id, token_hash, ip_address, user_agent, device_type,
        mfa_verified, last_activity, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      RETURNING id`,
      [
        params.userId,
        tokenHash,
        params.ipAddress,
        params.userAgent,
        params.deviceType || null,
        params.mfaVerified,
        expiresAt,
      ]
    );

    return {
      sessionId: result.rows[0].id,
      token,
    };
  }

  /**
   * Validate session with expiration checking
   * Requirement: 14.1
   */
  async validateSession(token: string): Promise<SessionData | null> {
    const tokenHash = this.hashToken(token);

    const result = await this.pool.query(
      `SELECT id, user_id, token_hash, ip_address, user_agent, device_type,
              mfa_verified, last_activity, expires_at, created_at
       FROM sessions
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];

    // Check inactivity timeout
    const lastActivity = new Date(session.last_activity);
    const now = new Date();
    const inactiveMs = now.getTime() - lastActivity.getTime();

    if (inactiveMs > this.INACTIVITY_TIMEOUT_MS) {
      // Session expired due to inactivity
      await this.terminateSession(session.id);
      return null;
    }

    return {
      id: session.id,
      userId: session.user_id,
      tokenHash: session.token_hash,
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      deviceType: session.device_type,
      mfaVerified: session.mfa_verified,
      lastActivity: session.last_activity,
      expiresAt: session.expires_at,
      createdAt: session.created_at,
    };
  }

  /**
   * Track activity for inactivity monitoring
   * Requirement: 14.6
   */
  async trackActivity(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET last_activity = NOW() WHERE id = $1`,
      [sessionId]
    );
  }

  /**
   * Check inactivity with 15-minute threshold
   * Requirement: 14.2
   */
  async checkInactivity(sessionId: string): Promise<{ inactive: boolean; minutesUntilTimeout: number }> {
    const result = await this.pool.query(
      `SELECT last_activity FROM sessions WHERE id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return { inactive: true, minutesUntilTimeout: 0 };
    }

    const lastActivity = new Date(result.rows[0].last_activity);
    const now = new Date();
    const inactiveMs = now.getTime() - lastActivity.getTime();
    const minutesInactive = Math.floor(inactiveMs / 60000);
    const minutesUntilTimeout = Math.max(0, 15 - minutesInactive);

    return {
      inactive: inactiveMs > this.INACTIVITY_TIMEOUT_MS,
      minutesUntilTimeout,
    };
  }

  /**
   * Terminate session for timeout enforcement
   * Requirement: 14.3
   */
  async terminateSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM sessions WHERE id = $1`,
      [sessionId]
    );
  }

  /**
   * Extend session for user activity
   * Requirement: 14.5
   */
  async extendSession(sessionId: string): Promise<void> {
    const newExpiresAt = new Date(Date.now() + this.SESSION_DURATION_MS);
    await this.pool.query(
      `UPDATE sessions 
       SET last_activity = NOW(), expires_at = $1 
       WHERE id = $2`,
      [newExpiresAt, sessionId]
    );
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId: string): Promise<SessionData[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, token_hash, ip_address, user_agent, device_type,
              mfa_verified, last_activity, expires_at, created_at
       FROM sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY last_activity DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      deviceType: row.device_type,
      mfaVerified: row.mfa_verified,
      lastActivity: row.last_activity,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  }

  private hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
