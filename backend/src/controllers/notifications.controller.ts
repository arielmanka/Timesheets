import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as notificationService from '../services/notification.service.js';
import * as teamService from '../services/team.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// GET /users/me/notifications
// ---------------------------------------------------------------------------
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await notificationService.listNotifications(authReq.user.userId, {
      unreadOnly: req.query.unreadOnly === 'true',
      limit: req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : undefined,
      skip: req.query.skip ? Math.max(Number(req.query.skip) || 0, 0) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /users/me/notifications/:notificationId/read
// ---------------------------------------------------------------------------
export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    await notificationService.markRead(authReq.user.userId, req.params.notificationId as string);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /users/me/notifications/read-all
// ---------------------------------------------------------------------------
export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    await notificationService.markAllRead(authReq.user.userId);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /users/me/notification-preferences
// ---------------------------------------------------------------------------
export async function listPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const isManager = await teamService.isManagerOfAnyTeam(authReq.user.userId);
    const preferences = await notificationService.listPreferences(authReq.user.userId, isManager);
    res.json({ preferences, emailAvailable: notificationService.emailAvailable });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /users/me/notification-preferences/:ruleType
// ---------------------------------------------------------------------------
const updatePreferenceSchema = z.object({
  enabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
});

export async function updatePreference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updatePreferenceSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const ruleType = req.params.ruleType as string;

    if (!notificationService.getRuleDefinition(ruleType)) {
      throw AppError.notFound('Unknown notification rule type');
    }

    await notificationService.updatePreference(authReq.user.userId, ruleType, data);
    const updated = await notificationService.getPreference(authReq.user.userId, ruleType);
    res.json({ preference: updated });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}
