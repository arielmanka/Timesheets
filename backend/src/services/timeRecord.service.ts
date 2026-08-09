import { TimeRecord, type ITimeRecord, type TimeRecordStatus } from '../models/TimeRecord.js';
import { Project } from '../models/Project.js';
import { resolveRate } from './rateResolver.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreateTimeRecordData {
  projectId: string;
  taskId?: string | null;
  date: Date;
  startTime: Date;
  endTime: Date;
  billable?: boolean;
  note?: string;
}

export interface UpdateTimeRecordData {
  startTime?: Date;
  endTime?: Date;
  billable?: boolean;
  note?: string;
  taskId?: string | null;
}

export interface OverlapWarning {
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
): Promise<{ record: ITimeRecord; overlapWarning: OverlapWarning }> {
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

  // Calculate duration (TR-7)
  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  if (durationMinutes < 1) {
    throw AppError.badRequest('Duration must be at least 1 minute', 'INVALID_DURATION');
  }

  // Check for overlaps (TR-8) — warning, not blocking
  const overlapWarning = await checkOverlap(userId, data.date, startTime, endTime);

  // Resolve rate (RB-5) and calculate cost (RB-6)
  const resolved = await resolveRate(
    data.projectId,
    data.taskId ?? null,
    userId,
    teamId
  );

  const calculatedCost = (durationMinutes / 60) * resolved.rate;

  const record = new TimeRecord({
    userId,
    projectId: data.projectId,
    taskId: data.taskId ?? null,
    date: data.date,
    startTime,
    endTime,
    durationMinutes,
    billable: data.billable ?? true,
    note: data.note ?? '',
    resolvedRate: resolved.rate,
    rateSource: resolved.source,
    calculatedCost,
    currency: resolved.currency,
  });

  await record.save();

  logger.info({ recordId: record._id, userId, projectId: data.projectId }, 'Time record created');

  return { record, overlapWarning };
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
  if (data.billable !== undefined && data.billable !== record.billable) {
    changes.push({ field: 'billable', previousValue: record.billable, newValue: data.billable });
    record.billable = data.billable;
  }
  if (data.note !== undefined && data.note !== record.note) {
    changes.push({ field: 'note', previousValue: record.note, newValue: data.note });
    record.note = data.note;
  }
  if (data.taskId !== undefined) {
    const oldTaskId = record.taskId?.toString() ?? null;
    const newTaskId = data.taskId ?? null;
    if (oldTaskId !== newTaskId) {
      changes.push({ field: 'taskId', previousValue: oldTaskId, newValue: newTaskId });
      record.taskId = newTaskId as any;
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
// List (UA-10, UA-11)
// ---------------------------------------------------------------------------
export interface ListTimeRecordsFilter {
  userId?: string;
  projectId?: string;
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
  const projectIds = await Project.find({ teamId }).distinct('_id');
  query.projectId = filter.projectId
    ? filter.projectId
    : { $in: projectIds };

  return TimeRecord.find(query).sort({ date: -1, startTime: -1 });
}

// ---------------------------------------------------------------------------
// Approve (UA-12, UA-15, UA-18)
// ---------------------------------------------------------------------------
export async function approveTimeRecord(
  recordId: string,
  managerId: string,
  teamMemberCount: number
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

  // Manager cannot approve own record unless sole member (UA-18)
  if (record.userId.toString() === managerId && teamMemberCount > 1) {
    throw AppError.badRequest(
      'Managers cannot approve their own time records',
      'SELF_APPROVAL'
    );
  }

  record.status = 'approved';
  record.locked = true;
  record.approvedBy = managerId as any;
  await record.save();

  logger.info({ recordId, managerId }, 'Time record approved');
  return record;
}

// ---------------------------------------------------------------------------
// Reject (UA-13, UA-14)
// ---------------------------------------------------------------------------
export async function rejectTimeRecord(
  recordId: string,
  managerId: string,
  reason: string
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
): Promise<OverlapWarning> {
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
