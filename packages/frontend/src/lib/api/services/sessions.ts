import apiClient from '../client';

export interface UserSession {
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

/** List the current user's active sessions. */
export async function getSessions(): Promise<UserSession[]> {
  const res = await apiClient.get<{ data: UserSession[] }>('/api/auth/sessions');
  return res.data.data;
}

/** Revoke one of the current user's sessions. */
export async function revokeSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/api/auth/sessions/${sessionId}`);
}

/** Revoke all sessions except the one making this request. Returns count revoked. */
export async function revokeOtherSessions(): Promise<number> {
  const res = await apiClient.delete<{ revoked: number }>('/api/auth/sessions/others');
  return res.data.revoked;
}
