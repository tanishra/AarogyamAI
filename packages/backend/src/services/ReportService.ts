import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import * as fs from 'fs';
import * as path from 'path';

interface ExportFilters {
  userId?: string;
  actionType?: string;
  dateFrom?: string;
  dateTo?: string;
  resource?: string;
}

export class ReportService {
  private s3Client: S3Client | null = null;
  private pool: Pool;
  private auditRepo: AuditLogRepository;
  private bucketName: string;
  private useS3: boolean;
  private s3Healthy: boolean;
  private localStoragePath: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.auditRepo = new AuditLogRepository();
    this.bucketName = process.env.S3_REPORTS_BUCKET || process.env.AWS_S3_BUCKET || 'clinical-ai-reports';
    this.useS3 = false;
    this.s3Healthy = true;
    this.localStoragePath = path.join(process.cwd(), 'storage', 'reports');

    // Initialize S3 client if credentials available
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      this.useS3 = true;
      console.log('[S3] Client initialized for bucket:', this.bucketName);
    } else {
      console.log('[S3] No credentials found, using local filesystem fallback');
    }

    // Ensure local storage directory exists
    this.ensureLocalStorageExists();
  }

  /**
   * Ensure local storage directory exists
   */
  private ensureLocalStorageExists(): void {
    if (!fs.existsSync(this.localStoragePath)) {
      fs.mkdirSync(this.localStoragePath, { recursive: true });
      console.log('[Storage] Created local storage directory:', this.localStoragePath);
    }
  }

  /**
   * Upload file to S3 or save locally
   */
  private async uploadFile(
    filename: string,
    content: string | Buffer,
    contentType: string
  ): Promise<string> {
    // Try S3 first if configured and healthy
    if (this.useS3 && this.s3Healthy && this.s3Client) {
      try {
        const key = `reports/${filename}`;
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: content,
            ContentType: contentType,
          })
        );
        
        const region = process.env.AWS_REGION || 'us-east-1';
        const downloadUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
        console.log('[S3] File uploaded successfully:', key);
        return downloadUrl;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[S3] Upload failed, falling back to local storage:', message);
        this.s3Healthy = false;
        // Fall through to local storage
      }
    }

    // Fallback to local filesystem
    const filePath = path.join(this.localStoragePath, filename);
    fs.writeFileSync(filePath, content);
    const downloadUrl = `/api/reports/download/${filename}`;
    console.log('[Storage] File saved locally:', filePath);
    return downloadUrl;
  }

  async exportAuditLogs(
    filters: ExportFilters,
    format: 'csv' | 'pdf',
    userId: string,
    userName: string,
    ipAddress: string,
    userAgent: string,
    requestId: string
  ): Promise<string> {
    // Fetch audit logs based on filters
    const logs = await this.fetchAuditLogs(filters);

    // Generate export content
    const content = format === 'csv' 
      ? this.generateCSV(logs, filters)
      : this.generatePDF(logs, filters);

    // Upload to S3 or save locally
    const filename = `audit-export-${Date.now()}-${userId}.${format}`;
    const contentType = format === 'csv' ? 'text/csv' : 'application/pdf';
    const downloadUrl = await this.uploadFile(filename, content, contentType);

    // Create audit log entry
    await this.auditRepo.create({
      userId,
      userName,
      userRole: 'Administrator',
      actionType: 'audit_log_exported',
      resource: 'audit_log',
      resourceId: 'export',
      outcome: 'success',
      ipAddress,
      userAgent,
      requestId,
      hash: '',
    });

    console.log(`[Report] Audit logs exported: ${filename}`);
    return downloadUrl;
  }

  async generateComplianceReport(
    timePeriodMonths: number,
    dpoId: string,
    dpoName: string,
    ipAddress: string,
    userAgent: string,
    requestId: string
  ): Promise<string> {
    // Fetch compliance data
    const dateFrom = new Date();
    dateFrom.setMonth(dateFrom.getMonth() - timePeriodMonths);

    const [consentStats, grievances, accessRequests] = await Promise.all([
      this.getConsentStatistics(dateFrom),
      this.getGrievanceSummary(dateFrom),
      this.getAccessRequestMetrics(dateFrom),
    ]);

    // Generate PDF report
    const content = this.generateCompliancePDF({
      timePeriodMonths,
      dateFrom,
      dateTo: new Date(),
      consentStats,
      grievances,
      accessRequests,
      generatedBy: dpoName,
    });

    // Upload to S3 or save locally
    const filename = `compliance-report-${Date.now()}-${dpoId}.pdf`;
    const downloadUrl = await this.uploadFile(filename, content, 'application/pdf');

    // Create audit log entry
    await this.auditRepo.create({
      userId: dpoId,
      userName: dpoName,
      userRole: 'DPO',
      actionType: 'compliance_report_generated',
      resource: 'compliance_report',
      resourceId: 'report',
      outcome: 'success',
      ipAddress,
      userAgent,
      requestId,
      hash: '',
    });

    console.log(`[Report] Compliance report generated: ${filename}`);
    return downloadUrl;
  }

  private async fetchAuditLogs(filters: ExportFilters): Promise<any[]> {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (filters.userId) {
      params.push(filters.userId);
      query += ` AND user_id = $${params.length}`;
    }

    if (filters.actionType) {
      params.push(filters.actionType);
      query += ` AND action_type = $${params.length}`;
    }

    if (filters.dateFrom) {
      params.push(filters.dateFrom);
      query += ` AND timestamp >= $${params.length}`;
    }

    if (filters.dateTo) {
      params.push(filters.dateTo);
      query += ` AND timestamp <= $${params.length}`;
    }

    if (filters.resource) {
      params.push(filters.resource);
      query += ` AND resource = $${params.length}`;
    }

    query += ' ORDER BY timestamp DESC LIMIT 10000';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  private generateCSV(logs: any[], filters: ExportFilters): string {
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Outcome', 'IP Address'];
    const rows = logs.map(log => [
      log.timestamp,
      log.user_name,
      log.action_type,
      log.resource,
      log.outcome,
      log.ip_address,
    ]);

    const csv = [
      `# Audit Log Export`,
      `# Generated: ${new Date().toISOString()}`,
      `# Filters: ${JSON.stringify(filters)}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    return csv;
  }

  private generatePDF(logs: any[], filters: ExportFilters): string {
    // Mock PDF generation (in production, use pdfkit or similar)
    return `PDF Report\nGenerated: ${new Date().toISOString()}\nFilters: ${JSON.stringify(filters)}\nTotal Logs: ${logs.length}`;
  }

  private async getConsentStatistics(dateFrom: Date): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawn
      FROM consent_records
      WHERE granted_at >= $1
    `, [dateFrom]);

    return result.rows[0];
  }

  private async getGrievanceSummary(dateFrom: Date): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM grievances
      WHERE submission_date >= $1
    `, [dateFrom]);

    return result.rows[0];
  }

  private async getAccessRequestMetrics(dateFrom: Date): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END) as fulfilled,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM data_access_requests
      WHERE submission_date >= $1
    `, [dateFrom]);

    return result.rows[0];
  }

  private generateCompliancePDF(data: any): string {
    // Mock PDF generation (in production, use pdfkit or similar)
    return `COMPLIANCE REPORT\n\nPeriod: ${data.timePeriodMonths} months\nGenerated: ${new Date().toISOString()}\nGenerated By: ${data.generatedBy}\n\nCONFIDENTIAL`;
  }
}
