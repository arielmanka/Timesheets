import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as timeRecordService from '../services/timeRecord.service.js';
import { Team } from '../models/Team.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { TeamRequest } from '../middleware/accessControl.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const createTimeRecordSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  taskId: z.string().nullable().optional(),
  date: z.coerce.date(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  billable: z.boolean().optional(),
  note: z.string().max(1000).optional(),
});

const updateTimeRecordSchema = z.object({
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  billable: z.boolean().optional(),
  note: z.string().max(1000).optional(),
  taskId: z.string().nullable().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// POST /teams/:teamId/time-records
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createTimeRecordSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;

    const { record, overlapWarning } = await timeRecordService.createTimeRecord(
      data,
      authReq.user.userId,
      teamReq.team.teamId
    );

    res.status(201).json({
      record,
      ...(overlapWarning.hasOverlap && { overlapWarning }),
    });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// GET /teams/:teamId/time-records
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const filter: timeRecordService.ListTimeRecordsFilter = {};
    if (req.query.userId) filter.userId = req.query.userId as string;
    if (req.query.projectId) filter.projectId = req.query.projectId as string;
    if (req.query.startDate) filter.startDate = new Date(req.query.startDate as string);
    if (req.query.endDate) filter.endDate = new Date(req.query.endDate as string);
    if (req.query.status) filter.status = req.query.status as 'pending' | 'approved' | 'rejected';
    if (req.query.billable !== undefined) filter.billable = req.query.billable === 'true';
    if (req.query.invoiced !== undefined) filter.invoiced = req.query.invoiced === 'true';

    const records = await timeRecordService.listTimeRecords(
      teamReq.team.teamId,
      filter,
      isManager,
      authReq.user.userId
    );

    res.json({ records });
  } catch (err) {
    next(err);
  }
}

// PATCH /teams/:teamId/time-records/:recordId
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateTimeRecordSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;

    const record = await timeRecordService.updateTimeRecord(
      req.params.recordId as string,
      data,
      authReq.user.userId,
      teamReq.team.teamId
    );

    res.json({ record });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// POST /teams/:teamId/time-records/:recordId/approve
export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;

    // Get team member count for self-approval check (UA-18)
    const team = await Team.findById(teamReq.team.teamId);
    const memberCount = team?.members.length ?? 0;

    const record = await timeRecordService.approveTimeRecord(
      req.params.recordId as string,
      authReq.user.userId,
      memberCount
    );

    res.json({ record });
  } catch (err) {
    next(err);
  }
}

// POST /teams/:teamId/time-records/:recordId/reject
export async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = rejectSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;

    const record = await timeRecordService.rejectTimeRecord(
      req.params.recordId as string,
      authReq.user.userId,
      data.reason
    );

    res.json({ record });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}
