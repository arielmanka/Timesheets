import type { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

/**
 * Global error handler. Catches all unhandled errors from route handlers
 * and sends a structured JSON response.
 */
export function errorHandler(
  err: Error & { statusCode?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  if (statusCode >= 500) {
    logger.error({ err, statusCode }, 'Unhandled server error');
  } else {
    logger.warn({ err: { message: err.message, code: err.code }, statusCode }, 'Client error');
  }

  res.status(statusCode).json({
    error: {
      message,
      code: err.code ?? 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}
