import type { AuditLogEntry } from '../../repositories/types';
import { getContainer } from '../../composition';

const auditRepo = getContainer().repositories.auditLog;

// Audit logging helper — writes hash-chained PostgreSQL record
export const writeAuditLog = async (data: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
  await auditRepo.create(data);
};
