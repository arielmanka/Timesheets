import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  locale: z.string().min(2).max(10).optional(),
});

// ---------------------------------------------------------------------------
// GET /users/me
// ---------------------------------------------------------------------------
export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await User.findById(authReq.user.userId);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    res.json({ user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /users/me
// ---------------------------------------------------------------------------
export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = updateProfileSchema.parse(req.body);

    const user = await User.findByIdAndUpdate(
      authReq.user.userId,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw AppError.notFound('User not found');
    }

    res.json({ user: user.toSafeObject() });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /users/me — request account deletion (UA-19, NFR-2)
// ---------------------------------------------------------------------------
export async function requestDeletion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await User.findById(authReq.user.userId);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    if (user.deletionRequestedAt) {
      res.json({ message: 'Account deletion already requested', requestedAt: user.deletionRequestedAt });
      return;
    }

    user.deletionRequestedAt = new Date();
    await user.save();

    logger.info({ userId: user._id }, 'Account deletion requested');

    res.json({
      message: 'Account deletion requested. Your data will be processed according to data retention policies.',
      requestedAt: user.deletionRequestedAt,
    });
  } catch (err) {
    next(err);
  }
}
