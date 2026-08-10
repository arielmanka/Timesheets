import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as taskService from '../services/task.service.js';
import type { TeamRequest } from '../middleware/accessControl.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const createTaskSchema = z.object({
  name: z.string().min(1, 'Task name is required').max(200),
  description: z.string().max(2000).nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
});

const updateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  assignedTo: z.string().nullable().optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// POST /teams/:teamId/projects/:projectId/tasks
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createTaskSchema.parse(req.body);
    const teamReq = req as unknown as TeamRequest;
    const task = await taskService.createTask(
      req.params.projectId as string,
      teamReq.team.teamId,
      data
    );
    res.status(201).json({ task });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// GET /teams/:teamId/projects/:projectId/tasks
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const validStatuses = ['open', 'in_progress', 'done'];
    const statusFilter = status && validStatuses.includes(status)
      ? status as 'open' | 'in_progress' | 'done'
      : undefined;
    const tasks = await taskService.listTasks(req.params.projectId as string, statusFilter);
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
}

// PATCH /teams/:teamId/projects/:projectId/tasks/:taskId
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateTaskSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const task = await taskService.updateTask(
      req.params.taskId as string,
      req.params.projectId as string,
      data,
      teamReq.team.teamId,
      authReq.user.userId
    );
    res.json({ task });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}
