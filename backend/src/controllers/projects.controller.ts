import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as projectService from '../services/project.service.js';
import type { TeamRequest } from '../middleware/accessControl.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const taxRuleSchema = z.object({
  name: z.string().min(1).max(100),
  rate: z.number().min(0).max(100),
});

const budgetSchema = z.object({
  type: z.enum(['hours', 'monetary']).nullable(),
  amount: z.number().min(0).nullable(),
});

const createProjectSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  name: z.string().min(1, 'Project name is required').max(200),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code').optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  budget: budgetSchema.optional(),
  taxRules: z.array(taxRuleSchema).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  currency: z.string().length(3).optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  budget: budgetSchema.optional(),
  taxRules: z.array(taxRuleSchema).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'on_hold', 'complete', 'cancelled']),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// POST /teams/:teamId/projects
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createProjectSchema.parse(req.body);
    const teamReq = req as unknown as TeamRequest;
    const project = await projectService.createProject(teamReq.team.teamId, data);
    res.status(201).json({ project });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// GET /teams/:teamId/projects
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const status = req.query.status as string | undefined;
    const validStatuses = ['active', 'on_hold', 'complete', 'cancelled'];
    const statusFilter = status && validStatuses.includes(status)
      ? status as 'active' | 'on_hold' | 'complete' | 'cancelled'
      : undefined;
    const projects = await projectService.listProjects(teamReq.team.teamId, statusFilter);
    res.json({ projects });
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/projects/:projectId
export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const project = await projectService.getProjectById(
      req.params.projectId as string,
      teamReq.team.teamId
    );
    res.json({ project });
  } catch (err) {
    next(err);
  }
}

// PATCH /teams/:teamId/projects/:projectId
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateProjectSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const project = await projectService.updateProject(
      req.params.projectId as string,
      teamReq.team.teamId,
      data,
      authReq.user.userId
    );
    res.json({ project });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// PATCH /teams/:teamId/projects/:projectId/status
export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateStatusSchema.parse(req.body);
    const teamReq = req as unknown as TeamRequest;
    const project = await projectService.updateStatus(
      req.params.projectId as string,
      teamReq.team.teamId,
      data.status
    );
    res.json({ project });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}
