import { TimeRecord, type ITimeRecord, type TimeRecordStatus } from '../models/TimeRecord.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { resolveRate } from './rateResolver.service.js';
import { getTeamsForUser } from './team.service.js';
import * as auditService from './audit.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreateTimeRecordData {
  projectId: string;
  taskId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  note?: string;
}

export interface UpdateTimeRecordData {
  startTime?: Date;
  endTime?: Date;
  note?: string;
  // A task may be reassigned (re-deriving billable from the new task), but
  // cannot be cleared — task selection is mandatory going forward. Existing
  // records logged before this rule (task-less) are left as they are unless
  // this is explicitly set.
  taskId?: string;
}

export interface OverlapCheckResult {
  hasOverlap: boolean;
  overlappingRecords: Array<{ _id: string; startTime: Date; endTime: Date }>;
}

// ---------------------------------------------------------------------------
// Create (TR-1 through TR-9, RB-5, RB-6)
// ---------------------------------------------------------------------------
export async function createTimeRecord(
  data: CreateTimeRecordData,
  userId: string,
  teamId: string
): Promise<ITimeRecord> {
  // Verify project is active (CPT-8)
  const project = await Project.findById(data.projectId);
  if (!project) {
    throw AppError.notFound('Project not found');
  }
  if (project.status !== 'active') {
    throw AppError.badRequest('Can only log time to active projects', 'PROJECT_NOT_ACTIVE');
  }
  if (project.teamId.toString() !== teamId) {
    throw AppError.forbidden('Project does not belong to this team');
  }

  // Entry date must fall within the project's active date range, if set (CPT-8).
  const entryDate = new Date(data.date);
  if (project.startDate && entryDate.getTime() < project.startDate.getTime()) {
    throw AppError.badRequest(
      `Can only log time on or after this project's start date (${project.startDate.toISOString().slice(0, 10)})`,
      'OUTSIDE_PROJECT_DATES'
    );
  }
  if (project.endDate && entryDate.getTime() > project.endDate.getTime()) {
    throw AppError.badRequest(
      `Can only log time on or before this project's end date (${project.endDate.toISOString().slice(0, 10)})`,
      'OUTSIDE_PROJECT_DATES'
    );
  }

  // A task governs whether the time logged against it is billable, so
  // selecting one is mandatory — this is the manager's point of control
  // (see Task.billable) rather than each entry deciding for itself.
  if (!data.taskId) {
    throw AppError.badRequest('A task is required to log time', 'TASK_REQUIRED');
  }
  const task = await Task.findOne({ _id: data.taskId, projectId: data.projectId });
  if (!task) {
    throw AppError.notFound('Task not found on this project');
  }

  // Calculate duration (TR-7)
  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  if (durationMinutes < 1) {
    throw AppError.badRequest('Duration must be at least 1 minute', 'INVALID_DURATION');
  }

  // A user cannot be logged as working two places at once — block overlap
  // outright, across every project and task, not just the same one (TR-8).
  const overlap = await checkOverlap(userId, data.date, startTime, endTime);
  if (overlap.hasOverlap) {
    throw AppError.conflict(
      'This overlaps a time entry you already have logged for the same day.',
      'TIME_OVERLAP'
    );
  }

  // Resolve rate (RB-5) and calculate cost (RB-6)
  const resolved = await resolveRate(
    data.projectId,
    data.taskId,
    userId,
    teamId
  );

  const calculatedCost = (durationMinutes / 60) * resolved.rate;

  const record = new TimeRecord({
    userId,
    projectId: data.projectId,
    taskId: data.taskId,
    date: data.date,
    startTime,
    endTime,
    durationMinutes,
    // Copied from the task at creation, not user-set — a snapshot, same as
    // resolvedRate/currency (RB-6/RB-10), so a later change to the task's
    // billable setting never silently alters an already-logged entry.
    billable: task.billable,
    note: data.note ?? '',
    resolvedRate: resolved.rate,
    rateSource: resolved.source,
    calculatedCost,
    currency: resolved.currency,
  });

  await record.save();

  logger.info({ recordId: record._id, userId, projectId: data.projectId }, 'Time record created');

  return record;
}

// ---------------------------------------------------------------------------
// Update (TR-5, TR-10, UA-16)
// ---------------------------------------------------------------------------
export async function updateTimeRecord(
  recordId: string,
  data: UpdateTimeRecordData,
  userId: string,
  teamId: string
): Promise<ITimeRecord> {
  const record = await TimeRecord.findById(recordId);
  if (!record) {
    throw AppError.notFound('Time record not found');
  }

  // Only the owner can edit their own records
  if (record.userId.toString() !== userId) {
    throw AppError.forbidden('You can only edit your own time records');
  }

  // Reject if locked (UA-16)
  if (record.locked) {
    throw AppError.badRequest('This time record is locked and cannot be edited', 'RECORD_LOCKED');
  }

  // Track changes (TR-10)
  const changes: Array<{ field: string; previousValue: unknown; newValue: unknown }> = [];

  if (data.startTime !== undefined && new Date(data.startTime).getTime() !== record.startTime.getTime()) {
    changes.push({ field: 'startTime', previousValue: record.startTime, newValue: data.startTime });
    record.startTime = new Date(data.startTime);
  }
  if (data.endTime !== undefined && new Date(data.endTime).getTime() !== record.endTime.getTime()) {
    changes.push({ field: 'endTime', previousValue: record.endTime, newValue: data.endTime });
    record.endTime = new Date(data.endTime);
  }
  if (data.note !== undefined && data.note !== record.note) {
    changes.push({ field: 'note', previousValue: record.note, newValue: data.note });
    record.note = data.note;
  }
  // Reassigning the task re-derives billable from the new task — billable
  // is never set directly by the user, only ever inherited (see create).
  if (data.taskId !== undefined) {
    const oldTaskId = record.taskId?.toString() ?? null;
    if (oldTaskId !== data.taskId) {
      const newTask = await Task.findOne({ _id: data.taskId, projectId: record.projectId });
      if (!newTask) {
        throw AppError.notFound('Task not found on this project');
      }
      changes.push({ field: 'taskId', previousValue: oldTaskId, newValue: data.taskId });
      if (newTask.billable !== record.billable) {
        changes.push({ field: 'billable', previousValue: record.billable, newValue: newTask.billable });
        record.billable = newTask.billable;
      }
      record.taskId = data.taskId as any;
    }
  }

  // Recalculate duration if times changed
  if (data.startTime !== undefined || data.endTime !== undefined) {
    const durationMs = record.endTime.getTime() - record.startTime.getTime();
    const durationMinutes = Math.round(durationMs / 60000);
    if (durationMinutes < 1) {
      throw AppError.badRequest('Duration must be at least 1 minute', 'INVALID_DURATION');
    }
    record.durationMinutes = durationMinutes;

    // Re-check overlap against the edited times (TR-8) — an edit can just as
    // easily create a conflict as a fresh entry can.
    const overlap = await checkOverlap(userId, record.date, record.startTime, record.endTime, recordId);
    if (overlap.hasOverlap) {
      throw AppError.conflict(
        'This overlaps a time entry you already have logged for the same day.',
        'TIME_OVERLAP'
      );
    }

    // Re-resolve rate and recalculate cost
    const resolved = await resolveRate(
      record.projectId.toString(),
      record.taskId?.toString() ?? null,
      userId,
      teamId
    );
    record.resolvedRate = resolved.rate;
    record.rateSource = resolved.source;
    record.calculatedCost = (durationMinutes / 60) * resolved.rate;
  }

  // Append change history
  for (const change of changes) {
    record.changeHistory.push({
      ...change,
      changedBy: userId as any,
      changedAt: new Date(),
    });
  }

  // If record was rejected, move back to pending on edit (UA-14)
  if (record.status === 'rejected') {
    record.status = 'pending';
    record.rejectedBy = null;
    record.rejectionReason = null;
  }

  await record.save();

  logger.info({ recordId, userId, changesCount: changes.length }, 'Time record updated');
  return record;
}

// ---------------------------------------------------------------------------
// Delete (mirrors the edit permission model: owner-only, not locked)
// ---------------------------------------------------------------------------
export async function deleteTimeRecord(recordId: string, userId: string): Promise<void> {
  const record = await TimeRecord.findById(recordId);
  if (!record) {
    throw AppError.notFound('Time record not found');
  }

  if (record.userId.toString() !== userId) {
    throw AppError.forbidden('You can only delete your own time records');
  }

  if (record.locked) {
    throw AppError.badRequest('This time record is locked and cannot be deleted', 'RECORD_LOCKED');
  }

  if (record.invoiced) {
    throw AppError.badRequest(
      'This time record has been invoiced and cannot be deleted',
      'RECORD_INVOICED'
    );
  }

  await record.deleteOne();

  logger.info({ recordId, userId }, 'Time record deleted');
}

// ---------------------------------------------------------------------------
// List (UA-10, UA-11)
// ---------------------------------------------------------------------------
export interface ListTimeRecordsFilter {
  userId?: string;
  projectId?: string;
  taskId?: string;
  clientId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: TimeRecordStatus;
  billable?: boolean;
  invoiced?: boolean;
}

export async function listTimeRecords(
  teamId: string,
  filter: ListTimeRecordsFilter,
  isManager: boolean,
  requestingUserId: string
): Promise<ITimeRecord[]> {
  const query: Record<string, unknown> = {};

  // Scope: regular users see only their own (UA-10), managers see team (UA-11)
  if (!isManager) {
    query.userId = requestingUserId;
  } else if (filter.userId) {
    query.userId = filter.userId;
  }

  if (filter.projectId) query.projectId = filter.projectId;
  if (filter.taskId) query.taskId = filter.taskId;
  if (filter.status) query.status = filter.status;
  if (filter.billable !== undefined) query.billable = filter.billable;
  if (filter.invoiced !== undefined) query.invoiced = filter.invoiced;

  if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) (query.date as Record<string, Date>).$gte = filter.startDate;
    if (filter.endDate) (query.date as Record<string, Date>).$lte = filter.endDate;
  }

  // Additional check: ensure records belong to projects in this team
  // by joining with project collection via populate or aggregation
  // For simplicity, we'll query project IDs in this team first
  const projectFilter: Record<string, unknown> = { teamId };
  if (filter.clientId) projectFilter.clientId = filter.clientId;
  const projectIds = await Project.find(projectFilter).distinct('_id');
  query.projectId = filter.projectId
    ? filter.projectId
    : { $in: projectIds };

  return TimeRecord.find(query).sort({ date: -1, startTime: -1 });
}

// ---------------------------------------------------------------------------
// List across every team the user belongs to — lets a user see their own
// time everywhere at once (e.g. to understand why a same-day overlap block
// fired, when the conflicting entry lives in a different team than the one
// they're currently viewing). Always scoped to the requesting user's own
// records; never exposes anyone else's time.
// ---------------------------------------------------------------------------
export interface CrossTeamTimeRecord {
  record: ITimeRecord;
  teamId: string;
  teamName: string;
  projectName: string;
}

export async function listMyTimeRecordsAcrossTeams(
  userId: string,
  filter: { startDate?: Date; endDate?: Date; billable?: boolean; status?: TimeRecordStatus }
): Promise<CrossTeamTimeRecord[]> {
  const teams = await getTeamsForUser(userId);
  const teamIds = teams.map((t) => t._id);
  const projects = await Project.find({ teamId: { $in: teamIds } });
  const projectIds = projects.map((p) => p._id);

  const query: Record<string, unknown> = { userId, projectId: { $in: projectIds } };
  if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) (query.date as Record<string, Date>).$gte = filter.startDate;
    if (filter.endDate) (query.date as Record<string, Date>).$lte = filter.endDate;
  }
  if (filter.billable !== undefined) query.billable = filter.billable;
  if (filter.status) query.status = filter.status;

  const records = await TimeRecord.find(query).sort({ date: -1, startTime: -1 });

  const teamNameById = new Map(teams.map((t) => [t._id.toString(), t.name]));
  const projectById = new Map(projects.map((p) => [p._id.toString(), p]));

  return records.map((record) => {
    const project = projectById.get(record.projectId.toString());
    const teamId = project?.teamId.toString() ?? '';
    return {
      record,
      teamId,
      teamName: teamNameById.get(teamId) ?? 'Unknown team',
      projectName: project?.name ?? 'Unknown project',
    };
  });
}

// ---------------------------------------------------------------------------
// Denormalized context for a time-record audit entry — captured at write
// time rather than left as bare IDs, so the audit trail still reads clearly
// even if the user/project/task is later renamed or deleted (NFR-6).
// ---------------------------------------------------------------------------
async function timeRecordAuditDetails(record: ITimeRecord): Promise<Record<string, unknown>> {
  const [user, project, task] = await Promise.all([
    User.findById(record.userId),
    Project.findById(record.projectId),
    record.taskId ? Task.findById(record.taskId) : Promise.resolve(null),
  ]);
  return {
    userId: record.userId.toString(),
    userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown user',
    projectId: record.projectId.toString(),
    projectName: project?.name ?? 'Unknown project',
    taskId: record.taskId ? record.taskId.toString() : null,
    taskName: task?.name ?? null,
    date: record.date,
    durationMinutes: record.durationMinutes,
  };
}

// ---------------------------------------------------------------------------
// Approve (UA-12, UA-15)
// Deliberately does NOT enforce UA-18 (manager can't approve their own
// record unless sole team member) — product direction has ruled that
// restriction out; a manager may always approve their own time.
// ---------------------------------------------------------------------------
export async function approveTimeRecord(
  recordId: string,
  managerId: string,
  teamId: string
): Promise<ITimeRecord> {
  const record = await TimeRecord.findById(recordId);
  if (!record) {
    throw AppError.notFound('Time record not found');
  }

  if (record.status !== 'pending') {
    throw AppError.badRequest(
      `Cannot approve a record with status '${record.status}'`,
      'INVALID_STATUS'
    );
  }

  record.status = 'approved';
  record.locked = true;
  record.approvedBy = managerId as any;
  await record.save();

  await auditService.log(
    'time_record_approved',
    'TimeRecord',
    recordId,
    teamId,
    managerId,
    await timeRecordAuditDetails(record)
  );

  logger.info({ recordId, managerId }, 'Time record approved');
  return record;
}

// ---------------------------------------------------------------------------
// Revert an approved record back to pending — lets a manager undo an
// approval mistake, but only while the record hasn't been pulled onto a
// personal invoice yet; once invoiced, the invoice's own line items are the
// source of truth and unwinding the approval underneath it would leave them
// inconsistent.
// ---------------------------------------------------------------------------
export async function unapproveTimeRecord(
  recordId: string,
  managerId: string,
  teamId: string
): Promise<ITimeRecord> {
  const record = await TimeRecord.findById(recordId);
  if (!record) {
    throw AppError.notFound('Time record not found');
  }

  if (record.status !== 'approved') {
    throw AppError.badRequest(
      `Cannot revert a record with status '${record.status}' — it must be approved`,
      'INVALID_STATUS'
    );
  }

  if (record.invoiced) {
    throw AppError.badRequest(
      'This time record is part of a personal invoice and cannot be reverted',
      'RECORD_INVOICED'
    );
  }

  record.status = 'pending';
  record.locked = false;
  record.approvedBy = null;
  await record.save();

  await auditService.log(
    'time_record_unapproved',
    'TimeRecord',
    recordId,
    teamId,
    managerId,
    await timeRecordAuditDetails(record)
  );

  logger.info({ recordId, managerId }, 'Time record reverted to pending');
  return record;
}

// ---------------------------------------------------------------------------
// Reject (UA-13, UA-14)
// ---------------------------------------------------------------------------
export async function rejectTimeRecord(
  recordId: string,
  managerId: string,
  reason: string,
  teamId: string
): Promise<ITimeRecord> {
  const record = await TimeRecord.findById(recordId);
  if (!record) {
    throw AppError.notFound('Time record not found');
  }

  if (record.status !== 'pending') {
    throw AppError.badRequest(
      `Cannot reject a record with status '${record.status}'`,
      'INVALID_STATUS'
    );
  }

  record.status = 'rejected';
  record.locked = false;
  record.rejectedBy = managerId as any;
  record.rejectionReason = reason;
  await record.save();

  await auditService.log('time_record_rejected', 'TimeRecord', recordId, teamId, managerId, {
    ...(await timeRecordAuditDetails(record)),
    reason,
  });

  logger.info({ recordId, managerId, reason }, 'Time record rejected');
  return record;
}

// ---------------------------------------------------------------------------
// Overlap detection (TR-8)
// ---------------------------------------------------------------------------
export async function checkOverlap(
  userId: string,
  date: Date,
  startTime: Date,
  endTime: Date,
  excludeId?: string
): Promise<OverlapCheckResult> {
  const filter: Record<string, unknown> = {
    userId,
    date,
    $or: [
      // New record starts during existing
      { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
    ],
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const overlapping = await TimeRecord.find(filter).select('_id startTime endTime');

  return {
    hasOverlap: overlapping.length > 0,
    overlappingRecords: overlapping.map((r) => ({
      _id: r._id.toString(),
      startTime: r.startTime,
      endTime: r.endTime,
    })),
  };
}
