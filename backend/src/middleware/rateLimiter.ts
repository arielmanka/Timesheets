import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Rate limiter for login endpoint (TECH-17).
 * Default: 20 attempts per 15-minute window per IP.
 */
export const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_LOGIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many login attempts. Please try again later.',
      code: 'RATE_LIMITED',
    },
  },
});

/**
 * Rate limiter for registration endpoint (TECH-17).
 * Default: 5 attempts per 15-minute window per IP.
 */
export const registerLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REGISTER,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many registration attempts. Please try again later.',
      code: 'RATE_LIMITED',
    },
  },
});

/**
 * Rate limiter for password reset endpoint.
 * 5 attempts per 15-minute window per IP.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many password reset attempts. Please try again later.',
      code: 'RATE_LIMITED',
    },
  },
});
