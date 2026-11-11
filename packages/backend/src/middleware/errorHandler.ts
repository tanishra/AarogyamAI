import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { config } from '../config';

export { AppError };

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal server error';
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  } else if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation error';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error: ' + err.message;
  } else if (err.name === 'UnauthorizedError' || err.message.includes('token')) {
    statusCode = 401;
    message = 'Authentication failed';
  } else if (err.message.includes('permission') || err.message.includes('forbidden')) {
    statusCode = 403;
    message = 'Access forbidden';
  } else if (err.message.includes('not found')) {
    statusCode = 404;
    message = err.message;
  } else if (err.message.includes('already exists') || err.message.includes('conflict')) {
    statusCode = 409;
    message = err.message;
  }

  logger.error('request failed', {
    requestId: (req as any).id,
    method: req.method,
    path: req.path,
    statusCode,
    message: err.message,
    stack: err.stack,
    userId: (req as any).user?.id,
    isOperational,
  });

  // Send user-friendly error response
  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      ...(config.nodeEnv === 'development' && { stack: err.stack }),
    },
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
    },
  });
};
