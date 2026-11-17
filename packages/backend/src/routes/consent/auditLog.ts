import { getContainer } from '../../composition';

const auditRepo = getContainer().repositories.auditLog;

// Audit logging helper — writes hash-chained PostgreSQL record
export const writeAuditLog = async (data: any) => {
  await auditRepo.create(data);
};
