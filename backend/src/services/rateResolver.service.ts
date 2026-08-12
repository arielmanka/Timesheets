import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Team } from '../models/Team.js';
import { MemberRate } from '../models/MemberRate.js';
import type { RateSource } from '../models/TimeRecord.js';

// ---------------------------------------------------------------------------
// Rate resolution result
// ---------------------------------------------------------------------------
export interface ResolvedRate {
  rate: number;
  source: RateSource;
  currency: string;
}

// ---------------------------------------------------------------------------
// resolveRate — Precedence (RB-5 / RB-11): a member's own rate — at
// whichever specificity a manager has configured for them — wins over the
// task's and project's flat rates:
//   1. Member's rate override for this exact task
//   2. Member's rate override for this project (no task)
//   3. Member's flat team-wide rate
//   4. Task's flat rate (applies to any member without a personal override)
//   5. Project's flat rate (applies to any member without a personal override)
// ---------------------------------------------------------------------------
export async function resolveRate(
  projectId: string,
  taskId: string | null,
  userId: string,
  teamId: string
): Promise<ResolvedRate> {
  // Fetch project for currency + project-level rate
  const project = await Project.findById(projectId);
  if (!project) {
    return { rate: 0, source: 'project', currency: 'USD' };
  }

  const currency = project.currency;

  // 1. Member's task-level override (most specific)
  if (taskId) {
    const taskOverride = await MemberRate.findOne({ userId, projectId, taskId });
    if (taskOverride) {
      return { rate: taskOverride.hourlyRate, source: 'member', currency };
    }
  }

  // 2. Member's project-level override
  const projectOverride = await MemberRate.findOne({ userId, projectId, taskId: null });
  if (projectOverride) {
    return { rate: projectOverride.hourlyRate, source: 'member', currency };
  }

  // 3. Member's flat team-wide rate
  const team = await Team.findById(teamId);
  const member = team?.members.find((m) => m.userId.toString() === userId);
  if (member?.hourlyRate != null && member.hourlyRate > 0) {
    return { rate: member.hourlyRate, source: 'member', currency };
  }

  // 4. Task's flat rate
  if (taskId) {
    const task = await Task.findById(taskId);
    if (task?.hourlyRate != null && task.hourlyRate > 0) {
      return { rate: task.hourlyRate, source: 'task', currency };
    }
  }

  // 5. Project's flat rate
  if (project.hourlyRate != null && project.hourlyRate > 0) {
    return { rate: project.hourlyRate, source: 'project', currency };
  }

  // Default: no rate configured
  return { rate: 0, source: 'project', currency };
}
