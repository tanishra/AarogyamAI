import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { logger } from '../../lib/logger';
import { auditRepo, writeAuditLog, searchLogsSchema } from './shared';

const router = Router();

/**
 * POST /api/audit/export
 * Export audit logs as CSV
 */
router.post('/export', async (req: Request, res: Response) => {
  try {
    const validation = searchLogsSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.issues,
      });
      return;
    }

    const { userId, actionType, resource, startDate, endDate } = validation.data;

    const searchResult = await auditRepo.search({
      userId,
      actionType,
      resource,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: 10000,
      page: 1,
    });
    const items = searchResult.items;

    const header = 'id,user_id,user_name,user_role,action_type,resource,resource_id,outcome,ip_address,timestamp';
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const csv = [
      header,
      ...items.map((e) =>
        [
          e.id, e.userId, e.userName, e.userRole, e.actionType,
          e.resource, e.resourceId, e.outcome, e.ipAddress, e.timestamp,
        ].map(escape).join(',')
      ),
    ].join('\n');

    const exportResult = {
      exportId: `export-${Date.now()}`,
      format: 'csv',
      filters: { userId, actionType, resource, startDate, endDate },
      recordCount: items.length,
      fileSize: `${(Buffer.byteLength(csv) / 1024).toFixed(1)} KB`,
      generatedAt: new Date().toISOString(),
      generatedBy: req.user!.userId,
      csv,
    };

    await writeAuditLog({
      userId: req.user!.userId,
      userName: maskEmail(req.user!.email),
      userRole: req.user!.role,
      actionType: 'audit_log_export',
      resource: 'audit_logs',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: '',
      hash: '',
    });

    res.status(200).json({
      message: 'Audit log export completed',
      data: exportResult,
    });
  } catch (error) {
    logger.error('Error exporting audit logs:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to export audit logs',
    });
  }
});

export default router;
