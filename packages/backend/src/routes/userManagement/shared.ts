import type { AuditLogEntry } from '../../repositories/types';
import { getContainer } from '../../composition';

export const userManagementService = getContainer().services.userManagement;
export const userRepo = getContainer().repositories.user;
const auditRepo = getContainer().repositories.auditLog;
export const emailService = getContainer().services.email;

// Audit logging helper — writes hash-chained PostgreSQL record
export const writeAuditLog = async (data: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
  await auditRepo.create(data);
};
