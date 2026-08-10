import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import * as timeRecordService from '../services/timeRecord.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
});

const incorporationSchema = z
  .object({
    companyName: z.string().min(1, 'Company name is required'),
    address: addressSchema,
    taxId: z.string().min(1, 'Tax ID is required'),
    phone: z.string().nullable().optional(),
  })
  .nullable();

// Deliberately generic — IBAN for EU accounts, routing+account number for
// North American ones, or otherDetails as a free-text fallback. Only the
// identity fields (holder, bank, country) are required here; whether a
// routing method is actually present is checked separately (server-side, at
// collective-invoice creation) via isBankAccountComplete.
const bankAccountSchema = z
  .object({
    accountHolderName: z.string().min(1, 'Account holder name is required'),
    bankName: z.string().min(1, 'Bank name is required'),
    country: z.string().min(1, 'Country is required'),
    iban: z.string().nullable().optional(),
    swiftBic: z.string().nullable().optional(),
    routingNumber: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    otherDetails: z.string().max(1000).nullable().optional(),
  })
  .nullable();

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  locale: z.string().min(2).max(10).optional(),
  employmentType: z.enum(['employee', 'contractor']).optional(),
  incorporation: incorporationSchema.optional(),
  personalBankAccount: bankAccountSchema.optional(),
  collectiveBankAccount: bankAccountSchema.optional(),
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

    const existing = await User.findById(authReq.user.userId);
    if (!existing) {
      throw AppError.notFound('User not found');
    }

    // An incorporation profile only makes sense for a contractor. Switching
    // to employee without explicitly touching incorporation in this same
    // request clears it automatically, rather than trapping the user with a
    // rejected update over a field they didn't mean to change.
    if (data.employmentType === 'employee' && data.incorporation === undefined) {
      data.incorporation = null;
    }
    const effectiveEmploymentType = data.employmentType ?? existing.employmentType;
    const effectiveIncorporation = data.incorporation !== undefined ? data.incorporation : existing.incorporation;
    if (effectiveIncorporation && effectiveEmploymentType !== 'contractor') {
      throw AppError.badRequest(
        'Incorporation details can only be set for a contractor. Switch employment type to contractor first.',
        'NOT_A_CONTRACTOR'
      );
    }

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
// GET /users/me/time-records — this user's own time across every team they
// belong to, not just one. Used by the Time view's "Show all teams" toggle
// so a user can see why a cross-team overlap block fired.
// ---------------------------------------------------------------------------
export async function listMyTimeRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const filter: { startDate?: Date; endDate?: Date; billable?: boolean; status?: 'pending' | 'approved' | 'rejected' } = {};
    if (req.query.startDate) filter.startDate = new Date(req.query.startDate as string);
    if (req.query.endDate) filter.endDate = new Date(req.query.endDate as string);
    if (req.query.billable !== undefined) filter.billable = req.query.billable === 'true';
    if (req.query.status) filter.status = req.query.status as 'pending' | 'approved' | 'rejected';

    const entries = await timeRecordService.listMyTimeRecordsAcrossTeams(authReq.user.userId, filter);
    res.json({ entries });
  } catch (err) {
    next(err);
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
