import { Project, type IProject, type ProjectStatus, type ITaxRule, type IBudget } from '../models/Project.js';
import { Client } from '../models/Client.js';
import * as auditService from './audit.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreateProjectData {
  clientId: string;
  name: string;
  currency?: string;
  hourlyRate?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  budget?: IBudget;
  taxRules?: ITaxRule[];
}

export interface UpdateProjectData {
  name?: string;
  currency?: string;
  hourlyRate?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  budget?: IBudget;
  taxRules?: ITaxRule[];
}

// ---------------------------------------------------------------------------
// Create (CPT-3, CPT-4)
// ---------------------------------------------------------------------------
export async function createProject(teamId: string, data: CreateProjectData): Promise<IProject> {
  // Verify client exists and belongs to the team
  const client = await Client.findOne({ _id: data.clientId, teamId });
  if (!client) {
    throw AppError.notFound('Client not found in this team');
  }

  const project = new Project({
    teamId,
    clientId: data.clientId,
    name: data.name,
    currency: data.currency ?? 'USD',
    hourlyRate: data.hourlyRate ?? null,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    budget: data.budget ?? { type: null, amount: null },
    taxRules: data.taxRules ?? [],
  });

  await project.save();

  logger.info({ projectId: project._id, teamId }, 'Project created');
  return project;
}

// ---------------------------------------------------------------------------
// List by team
// ---------------------------------------------------------------------------
export async function listProjects(teamId: string, status?: ProjectStatus): Promise<IProject[]> {
  const filter: Record<string, unknown> = { teamId };
  if (status) {
    filter.status = status;
  }
  return Project.find(filter).sort({ createdAt: -1 });
}

// ---------------------------------------------------------------------------
// Get by ID
// ---------------------------------------------------------------------------
export async function getProjectById(projectId: string, teamId: string): Promise<IProject> {
  const project = await Project.findOne({ _id: projectId, teamId });
  if (!project) {
    throw AppError.notFound('Project not found');
  }
  return project;
}

// ---------------------------------------------------------------------------
// Update (CPT-6, CPT-9, RB-2, RB-3)
// ---------------------------------------------------------------------------
export async function updateProject(
  projectId: string,
  teamId: string,
  data: UpdateProjectData,
  actorId: string
): Promise<IProject> {
  const project = await Project.findOne({ _id: projectId, teamId });
  if (!project) {
    throw AppError.notFound('Project not found');
  }

  const previousRate = project.hourlyRate;

  // Apply partial update
  if (data.name !== undefined) project.name = data.name;
  if (data.currency !== undefined) project.currency = data.currency;
  if (data.hourlyRate !== undefined) project.hourlyRate = data.hourlyRate;
  if (data.startDate !== undefined) project.startDate = data.startDate;
  if (data.endDate !== undefined) project.endDate = data.endDate;
  if (data.budget !== undefined) project.budget = data.budget;
  if (data.taxRules !== undefined) project.taxRules = data.taxRules;

  await project.save();

  if (data.hourlyRate !== undefined && data.hourlyRate !== previousRate) {
    await auditService.log('project_rate_changed', 'Project', projectId, teamId, actorId, {
      projectName: project.name,
      previousRate,
      newRate: data.hourlyRate,
    });
  }

  logger.info({ projectId, teamId }, 'Project updated');
  return project;
}

// ---------------------------------------------------------------------------
// Update status (CPT-6, CPT-7)
// ---------------------------------------------------------------------------
const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  active: ['on_hold', 'complete', 'cancelled'],
  on_hold: ['active', 'cancelled'],
  complete: [],     // terminal
  cancelled: [],    // terminal
};

export async function updateStatus(
  projectId: string,
  teamId: string,
  newStatus: ProjectStatus
): Promise<IProject> {
  const project = await Project.findOne({ _id: projectId, teamId });
  if (!project) {
    throw AppError.notFound('Project not found');
  }

  const allowed = VALID_TRANSITIONS[project.status];
  if (!allowed.includes(newStatus)) {
    throw AppError.badRequest(
      `Cannot transition from '${project.status}' to '${newStatus}'`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  project.status = newStatus;
  await project.save();

  logger.info({ projectId, teamId, from: project.status, to: newStatus }, 'Project status updated');
  return project;
}
