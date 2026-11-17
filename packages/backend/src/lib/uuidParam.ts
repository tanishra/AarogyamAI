import { z } from 'zod';
import { Response } from 'express';

const uuidSchema = z.string().uuid();

/**
 * Validate a route param as UUID. Returns the id or sends 400 and returns null.
 */
export function uuidParam(
  value: string,
  res: Response
): string | null {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid identifier — expected UUID',
    });
    return null;
  }
  return parsed.data;
}
