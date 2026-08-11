import { Task, type ITask, type TaskStatus } from '../models/Task.js';
import { Project } from '../models/Project.js';
import * as auditService from './audit.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreateTaskData {
  name: string;
  description?: string | null;
  assignedTo?: string | null;
  hourlyRate?: number | null;
  billable?: boolean;
}

export interface UpdateTaskData {
  name?: string;
  description?: string | null;
  status?: TaskStatus;
  assignedTo?: string | null;
  hourlyRate?: number | null;
  billable?: boolean;
}

// ---------------------------------------------------------------------------
// Create (CPT-5)
// ---------------------------------------------------------------------------
export async function createTask(
  projectId: string,
  teamId: string,
  data: CreateTaskData
): Promise<ITask> {
  // Verify project exists and belongs to the team
  const project = await Project.findOne({ _id: projectId, teamId });
  if (!project) {
    throw AppError.notFound('Project not found in this team');
  }
  if (project.status !== 'active') {
    throw AppError.badRequest('Can only create tasks on active projects', 'PROJECT_NOT_ACTIVE');
  }

  const task = new Task({
    projectId,
    name: data.name,
    description: data.description ?? null,
    assignedTo: data.assignedTo ?? null,
    hourlyRate: data.hourlyRate ?? null,
    billable: data.billable ?? true,
  });

  await task.save();

  logger.info({ taskId: task._id, projectId }, 'Task created');
  return task;
}

// ---------------------------------------------------------------------------
// List by project
// ---------------------------------------------------------------------------
export async function listTasks(projectId: string, status?: TaskStatus): Promise<ITask[]> {
  const filter: Record<string, unknown> = { projectId };
  if (status) {
    filter.status = status;
  }
  return Task.find(filter).sort({ createdAt: -1 });
}

// ---------------------------------------------------------------------------
// Get by ID
// ---------------------------------------------------------------------------
export async function getTaskById(taskId: string, projectId: string): Promise<ITask> {
  const task = await Task.findOne({ _id: taskId, projectId });
  if (!task) {
    throw AppError.notFound('Task not found');
  }
  return task;
}

// ---------------------------------------------------------------------------
// Update (CPT-12, RB-4)
// `billable` governs whether time logged against this task can be invoiced
// (see TimeRecord), so — unlike status, which the assigned member may also
// set — only a manager may change it, enforced here rather than at the
// route level so CPT-12's "assigned member can set status" capability isn't
// lost by gating the whole endpoint to managers.
// ---------------------------------------------------------------------------
export async function updateTask(
  taskId: string,
  projectId: string,
  data: UpdateTaskData,
  teamId: string,
  actorId: string,
  isManager: boolean
): Promise<ITask> {
  const task = await Task.findOne({ _id: taskId, projectId });
  if (!task) {
    throw AppError.notFound('Task not found');
  }

  if (data.billable !== undefined && !isManager) {
    throw AppError.forbidden('Only a manager can change whether a task is billable');
  }

  const previousRate = task.hourlyRate;
  const previousBillable = task.billable;

  if (data.name !== undefined) task.name = data.name;
  if (data.description !== undefined) task.description = data.description;
  if (data.status !== undefined) task.status = data.status;
  if (data.assignedTo !== undefined) task.assignedTo = data.assignedTo as any;
  if (data.hourlyRate !== undefined) task.hourlyRate = data.hourlyRate;
  if (data.billable !== undefined) task.billable = data.billable;

  await task.save();

  if (data.hourlyRate !== undefined && data.hourlyRate !== previousRate) {
    const project = await Project.findById(projectId);
    await auditService.log('task_rate_changed', 'Task', taskId, teamId, actorId, {
      taskName: task.name,
      projectId,
      projectName: project?.name ?? 'Unknown project',
      previousRate,
      newRate: data.hourlyRate,
    });
  }

  if (data.billable !== undefined && data.billable !== previousBillable) {
    const project = await Project.findById(projectId);
    await auditService.log('task_billable_changed', 'Task', taskId, teamId, actorId, {
      taskName: task.name,
      projectId,
      projectName: project?.name ?? 'Unknown project',
      previousBillable,
      newBillable: data.billable,
    });
  }

  logger.info({ taskId, projectId }, 'Task updated');
  return task;
}
