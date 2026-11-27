import type { AuditLogEntry } from '../../repositories/types';
import { getContainer } from '../../composition';
import { rateLimit } from '../../middleware/securityMiddleware';

export const userRepo = getContainer().repositories.user;
const auditRepo = getContainer().repositories.auditLog;

// Audit logging helper — writes hash-chained PostgreSQL record
export const writeAuditLog = async (data: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
  await auditRepo.create(data);
};

// Strict per-IP limits on credential endpoints (in addition to the global limiter)
export const authRateLimit = rateLimit({ windowMs: 60 * 1000, maxRequests: 10 });
