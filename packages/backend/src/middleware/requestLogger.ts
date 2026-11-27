import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger';

/** Request carrying a correlation id attached by this middleware */
type RequestWithId = Request & { requestId?: string; id?: string };

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req as RequestWithId).requestId ?? uuidv4();
  (req as RequestWithId).requestId = requestId;
  const startTime = Date.now();

  // Attach request ID to request object
  (req as RequestWithId).id = requestId;

  // Log request
  logger.debug({
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    userId: (req.user as { id?: string } | undefined)?.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.debug({
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req.user as { id?: string } | undefined)?.id,
    });
  });

  next();
};

export const responseTimeTracker = (_req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Set header before response is sent
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }
    return originalSend.call(this, data);
  };

  next();
};
