import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as teamService from '../services/team.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(200),
});

const addMemberSchema = z.object({
  uid: z.string().length(24, 'UID must be exactly 24 characters').regex(/^[a-f0-9]+$/, 'Invalid UID format'),
});

const setRoleSchema = z.object({
  role: z.enum(['member', 'manager']),
});

const setMemberRateSchema = z.object({
  hourlyRate: z.number().min(0).nullable(),
});

const searchUserSchema = z.object({
  uid: z.string().length(24, 'UID must be exactly 24 characters').regex(/^[a-f0-9]+$/, 'Invalid UID format'),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// POST /teams
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createTeamSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const team = await teamService.createTeam(authReq.user.userId, data.name);
    res.status(201).json({ team });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// GET /teams
export async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teams = await teamService.getTeamsForUser(authReq.user.userId);
    res.json({ teams });
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId
export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await teamService.getTeamById(req.params.teamId as string);
    res.json({ team });
  } catch (err) {
    next(err);
  }
}

// DELETE /teams/:teamId
export async function deleteTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    await teamService.deleteTeam(req.params.teamId as string, authReq.user.userId);
    res.json({ message: 'Team deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/search-user?uid=
export async function searchUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { uid } = searchUserSchema.parse(req.query);
    const user = await teamService.searchUserByUid(uid);
    if (!user) {
      throw AppError.notFound('No user found with that UID');
    }
    res.json({ user });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// POST /teams/:teamId/members
export async function addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = addMemberSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const team = await teamService.addMember(req.params.teamId as string, data.uid, authReq.user.userId);
    res.status(201).json({ team });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// DELETE /teams/:teamId/members/:userId
export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const team = await teamService.removeMember(
      req.params.teamId as string,
      req.params.userId as string,
      authReq.user.userId
    );
    res.json({ team });
  } catch (err) {
    next(err);
  }
}

// PATCH /teams/:teamId/members/:userId/role
export async function setRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = setRoleSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const team = await teamService.setRole(
      req.params.teamId as string,
      req.params.userId as string,
      data.role,
      authReq.user.userId
    );
    res.json({ team });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// PATCH /teams/:teamId/members/:userId/rate
export async function setMemberRate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = setMemberRateSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const team = await teamService.setMemberRate(
      req.params.teamId as string,
      req.params.userId as string,
      data.hourlyRate,
      authReq.user.userId
    );
    res.json({ team });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}
