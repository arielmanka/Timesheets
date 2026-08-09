import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Extend Express Request to include authenticated user
// ---------------------------------------------------------------------------
export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
  };
}

interface AccessTokenPayload {
  userId: string;
  email: string;
  type: 'access';
}

// ---------------------------------------------------------------------------
// Auth middleware — extracts and verifies JWT from Authorization header (TECH-8)
// ---------------------------------------------------------------------------
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7); // Strip "Bearer "

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

    if (payload.type !== 'access') {
      throw AppError.unauthorized('Invalid token type');
    }

    (req as AuthenticatedRequest).user = {
      userId: payload.userId,
      email: payload.email,
    };

    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Token expired', 'TOKEN_EXPIRED');
    }

    throw AppError.unauthorized('Invalid token', 'INVALID_TOKEN');
  }
}
