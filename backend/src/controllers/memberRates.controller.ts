import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as memberRateService from '../services/memberRate.service.js';
import type { TeamRequest } from '../middleware/accessControl.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const setMemberRateSchema = z.object({
  taskId: z.string().nullable(),
  hourlyRate: z.number().min(0).nullable(),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// GET /teams/:teamId/projects/:projectId/member-rates
// Returns every override for the project — both project-level (taskId: null)
// and every task-level one; the frontend splits them by taskId as needed.
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const memberRates = await memberRateService.listMemberRates(req.params.projectId as string);
    res.json({ memberRates });
  } catch (err) {
    next(err);
  }
}

// PATCH /teams/:teamId/projects/:projectId/member-rates/:userId
export async function set(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = setMemberRateSchema.parse(req.body);
    const teamReq = req as unknown as TeamRequest;
    const authReq = req as AuthenticatedRequest;
    const memberRate = await memberRateService.setMemberRate(
      teamReq.team.teamId,
      req.params.projectId as string,
      data.taskId,
      req.params.userId as string,
      data.hourlyRate,
      authReq.user.userId
    );
    res.json({ memberRate });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}
