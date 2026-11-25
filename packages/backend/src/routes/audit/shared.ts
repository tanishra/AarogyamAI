import { z } from 'zod';
import { getContainer } from '../../composition';

export const auditRepo = getContainer().repositories.auditLog;
export const auditLogService = getContainer().services.auditLog;
export const anomalyService = getContainer().services.anomalyDetection;

// Audit logging helper (failures are logged inside the repository, never thrown)
export const writeAuditLog = async (data: any) => {
  await auditRepo.create(data);
};

// Validation schemas
export const searchLogsSchema = z.object({
  userId: z.string().uuid().optional(),
  actionType: z.string().optional(),
  resource: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
