import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/authMiddleware';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { ReportService } from '../services/ReportService';
import { getDatabasePool } from '../config/database';

const router = Router();
const auditRepo = new AuditLogRepository();
const pool = getDatabasePool();
const reportService = new ReportService(pool);

/**
 * POST /api/aws-test/dynamodb
 * Test DynamoDB with PostgreSQL fallback
 */
router.post('/dynamodb', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can test AWS services',
      });
      return;
    }

    console.log('\n=== Testing DynamoDB with Fallback ===');
    
    // Create a test audit log entry
    const testEntry = await auditRepo.create({
      userId: req.user!.userId,
      userName: req.user!.name || 'Test User',
      userRole: req.user!.role,
      actionType: 'aws_dynamodb_test',
      resource: 'test',
      resourceId: 'test-' + Date.now(),
      outcome: 'success',
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: 'test-' + Date.now(),
      hash: '',
    });

    console.log('Test entry created:', testEntry.id);

    // Try to search for it
    const searchResults = await auditRepo.search({
      userId: req.user!.userId,
      limit: 10,
      page: 1,
    });

    console.log('Search results:', searchResults.total, 'entries found');
    console.log('=== DynamoDB Test Complete ===\n');

    res.status(200).json({
      message: 'DynamoDB test completed (check logs for details)',
      data: {
        testEntry: {
          id: testEntry.id,
          timestamp: testEntry.timestamp,
        },
        searchResults: {
          total: searchResults.total,
          found: searchResults.items.length,
        },
      },
    });
  } catch (error) {
    console.error('DynamoDB test error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'DynamoDB test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/aws-test/s3
 * Test S3 with local filesystem fallback
 */
router.post('/s3', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can test AWS services',
      });
      return;
    }

    console.log('\n=== Testing S3 with Fallback ===');

    // Generate a test report
    const downloadUrl = await reportService.exportAuditLogs(
      { userId: req.user!.userId },
      'csv',
      req.user!.userId,
      req.user!.name || 'Test User',
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || 'unknown',
      'test-' + Date.now()
    );

    console.log('Test report generated:', downloadUrl);
    console.log('=== S3 Test Complete ===\n');

    res.status(200).json({
      message: 'S3 test completed (check logs for details)',
      data: {
        downloadUrl,
        isS3: downloadUrl.includes('s3.amazonaws.com') || downloadUrl.includes('.s3.'),
        isLocal: downloadUrl.includes('/api/reports/download/'),
      },
    });
  } catch (error) {
    console.error('S3 test error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'S3 test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/aws-test/status
 * Get AWS services status
 */
router.get('/status', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can check AWS status',
      });
      return;
    }

    const hasAwsCredentials = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
    const dynamoDbEnabled = process.env.ENABLE_DYNAMODB_AUDIT === 'true';

    res.status(200).json({
      message: 'AWS services status',
      data: {
        credentials: {
          configured: hasAwsCredentials,
          region: process.env.AWS_REGION || 'not set',
        },
        dynamodb: {
          enabled: dynamoDbEnabled,
          table: process.env.DYNAMODB_AUDIT_TABLE || 'not set',
          fallback: 'PostgreSQL',
        },
        s3: {
          configured: hasAwsCredentials,
          bucket: process.env.S3_REPORTS_BUCKET || process.env.AWS_S3_BUCKET || 'not set',
          fallback: 'Local filesystem (storage/reports)',
        },
        bedrock: {
          configured: hasAwsCredentials,
          model: process.env.AI_MODEL || 'not set',
          fallback: 'OpenAI',
        },
      },
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check AWS status',
    });
  }
});

export default router;
