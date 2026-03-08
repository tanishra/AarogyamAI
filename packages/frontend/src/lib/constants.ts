export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  USERS: '/users',
  REGISTRATION_QUEUE: '/registration-queue',
  METRICS: '/metrics',
  AUDIT_LOGS: '/audit-logs',
  CONSENT: '/consent',
  GRIEVANCES: '/grievances',
} as const;

export const ROLES = {
  ADMINISTRATOR: 'Administrator',
  DPO: 'DPO',
} as const;

export const SESSION_EXPIRATION_WARNING_MINUTES = 5;
export const API_TIMEOUT_MS = 30000;
export const MAX_RETRIES = 3;
