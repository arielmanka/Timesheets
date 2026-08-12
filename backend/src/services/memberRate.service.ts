import { MemberRate, type IMemberRate } from '../models/MemberRate.js';
import { Team } from '../models/Team.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import * as auditService from './audit.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Set (or clear, when hourlyRate is null) a manager's rate override for one
// team member, scoped to a project or — when taskId is given — to one
// specific task within that project (RB-11). See rateResolver.service.ts for
// how this fits into the overall rate precedence.
// ---------------------------------------------------------------------------
export async function setMemberRate(
  teamId: string,
  projectId: string,
  taskId: string | null,
  targetUserId: string,
  hourlyRate: number | null,
  actorId: string
): Promise<IMemberRate | null> {
  const team = await Team.findById(teamId);
  if (!team) {
    throw AppError.notFound('Team not found');
  }
  const actor = team.members.find((m) => m.userId.toString() === actorId);
  if (actor?.role !== 'manager') {
    throw AppError.forbidden('Only team managers can perform this action');
  }
  const member = team.members.find((m) => m.userId.toString() === targetUserId);
  if (!member) {
    throw AppError.notFound('User is not a member of this team');
  }

  const project = await Project.findOne({ _id: projectId, teamId });
  if (!project) {
    throw AppError.notFound('Project not found');
  }

  let task = null;
  if (taskId) {
    task = await Task.findOne({ _id: taskId, projectId });
    if (!task) {
      throw AppError.notFound('Task not found on this project');
    }
  }

  const filter = { userId: targetUserId, projectId, taskId };
  const existing = await MemberRate.findOne(filter);
  const previousRate = existing?.hourlyRate ?? null;

  let result: IMemberRate | null;
  if (hourlyRate === null) {
    await MemberRate.deleteOne(filter);
    result = null;
  } else {
    result = await MemberRate.findOneAndUpdate(
      filter,
      { $set: { hourlyRate, teamId } },
      { upsert: true, new: true }
    );
  }

  if (previousRate !== hourlyRate) {
    const targetUser = await User.findById(targetUserId);
    await auditService.log('member_rate_override_changed', 'MemberRate', targetUserId, teamId, actorId, {
      targetUserId,
      targetUserName: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : 'Unknown user',
      projectId,
      projectName: project.name,
      taskId,
      taskName: task?.name ?? null,
      previousRate,
      newRate: hourlyRate,
    });
  }

  logger.info({ teamId, projectId, taskId, targetUserId, hourlyRate, actorId }, 'Member rate override updated');
  return result;
}

// ---------------------------------------------------------------------------
// List overrides for a project. Omit taskId to get every override (both
// project-level and every task-level one); pass null explicitly for
// project-level only, or a task id for that task's overrides only.
// ---------------------------------------------------------------------------
export async function listMemberRates(projectId: string, taskId?: string | null): Promise<IMemberRate[]> {
  const query: Record<string, unknown> = { projectId };
  if (taskId !== undefined) {
    query.taskId = taskId;
  }
  return MemberRate.find(query);
}
