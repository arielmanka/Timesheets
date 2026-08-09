import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Team } from '../models/Team.js';
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
// resolveRate — Precedence: task > project > member (RB-5)
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

  // 1. Task-level rate (highest precedence)
  if (taskId) {
    const task = await Task.findById(taskId);
    if (task?.hourlyRate != null && task.hourlyRate > 0) {
      return { rate: task.hourlyRate, source: 'task', currency };
    }
  }

  // 2. Project-level rate
  if (project.hourlyRate != null && project.hourlyRate > 0) {
    return { rate: project.hourlyRate, source: 'project', currency };
  }

  // 3. Member-level rate
  const team = await Team.findById(teamId);
  if (team) {
    const member = team.members.find((m) => m.userId.toString() === userId);
    if (member?.hourlyRate != null && member.hourlyRate > 0) {
      return { rate: member.hourlyRate, source: 'member', currency };
    }
  }

  // Default: no rate configured
  return { rate: 0, source: 'project', currency };
}
