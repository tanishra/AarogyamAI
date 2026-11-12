import { NextFunction, Request, RequestHandler, Response } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

/** Thrown when LLM output is blocked by the clinical safety filter — fail closed */
export class LLMOutputBlockedError extends AppError {
  readonly matchedCategories: string[];
  constructor(matchedCategories: string[] = []) {
    super('AI response was blocked by the clinical safety filter', 502);
    this.name = 'LLMOutputBlockedError';
    this.matchedCategories = matchedCategories;
  }
}

/** Thrown when PII stripping fails — the caller must never send the raw text */
export class PIIStripError extends AppError {
  constructor(message = 'Failed to sanitize input for AI processing') {
    super(message, 500);
    this.name = 'PIIStripError';
  }
}

/**
 * Wraps async route handlers so rejections reach the global error handler
 * instead of producing unhandled rejections / hung requests.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
