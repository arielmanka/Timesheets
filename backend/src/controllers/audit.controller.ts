import type { Request, Response, NextFunction } from 'express';
import * as auditService from '../services/audit.service.js';
import type { TeamRequest } from '../middleware/accessControl.js';

// ---------------------------------------------------------------------------
// GET /teams/:teamId/audit-log (NFR-6) — manager-only, enforced by the
// requireManager route guard; there is no central-administrator role in
// this system (UA-1), so a team's managers are its closest equivalent.
// ---------------------------------------------------------------------------
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;

    const options: {
      eventType?: string;
      entityType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      skip?: number;
    } = {};
    if (req.query.eventType) options.eventType = req.query.eventType as string;
    if (req.query.entityType) options.entityType = req.query.entityType as string;
    if (req.query.startDate) options.startDate = new Date(req.query.startDate as string);
    if (req.query.endDate) options.endDate = new Date(req.query.endDate as string);
    if (req.query.limit) options.limit = Math.min(Number(req.query.limit) || 50, 200);
    if (req.query.skip) options.skip = Math.max(Number(req.query.skip) || 0, 0);

    const result = await auditService.getAuditLogs(teamReq.team.teamId, options);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
