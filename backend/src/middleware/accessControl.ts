import type { Request, Response, NextFunction } from 'express';
import { Team } from '../models/Team.js';
import type { AuthenticatedRequest } from './auth.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Extended request with team context
// ---------------------------------------------------------------------------
export interface TeamRequest extends AuthenticatedRequest {
  team: {
    teamId: string;
    role: 'member' | 'manager';
  };
}

// ---------------------------------------------------------------------------
// requireTeamMember — verifies the user is a member of the team (any role)
// Reads :teamId from route params and attaches team context to request.
// ---------------------------------------------------------------------------
export async function requireTeamMember(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { teamId } = req.params;
    if (!teamId) {
      throw AppError.badRequest('Team ID is required');
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    const team = await Team.findById(teamId);
    if (!team) {
      throw AppError.notFound('Team not found');
    }

    const member = team.members.find((m) => m.userId.toString() === userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this team');
    }

    // Attach team context for downstream handlers
    (req as TeamRequest).team = {
      teamId: team._id.toString(),
      role: member.role,
    };

    next();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// requireManager — verifies the user is a manager of the team
// Must be used after authenticate middleware.
// ---------------------------------------------------------------------------
export async function requireManager(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { teamId } = req.params;
    if (!teamId) {
      throw AppError.badRequest('Team ID is required');
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    const team = await Team.findById(teamId);
    if (!team) {
      throw AppError.notFound('Team not found');
    }

    const member = team.members.find((m) => m.userId.toString() === userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this team');
    }

    if (member.role !== 'manager') {
      throw AppError.forbidden('Only team managers can perform this action');
    }

    (req as TeamRequest).team = {
      teamId: team._id.toString(),
      role: 'manager',
    };

    next();
  } catch (err) {
    next(err);
  }
}
