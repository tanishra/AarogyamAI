import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { authenticate } from '../auth/authMiddleware';

const router = Router();

/**
 * GET /api/reports/download/:filename
 * Download locally stored report files (fallback when S3 is unavailable)
 */
router.get('/download/:filename', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid filename',
      });
      return;
    }

    // Check if user has permission (admin or DPO)
    if (req.user!.role !== 'Administrator' && req.user!.role !== 'DPO') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators and DPOs can download reports',
      });
      return;
    }

    const localStoragePath = path.join(process.cwd(), 'storage', 'reports');
    const filePath = path.join(localStoragePath, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Report file not found',
      });
      return;
    }

    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.csv') {
      contentType = 'text/csv';
    } else if (ext === '.pdf') {
      contentType = 'application/pdf';
    }

    // Set headers and send file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    console.log(`[Reports] File downloaded: ${filename} by user ${req.user!.userId}`);
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to download report',
    });
  }
});

export default router;
