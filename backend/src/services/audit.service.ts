import { AuditLog, type IAuditLog } from '../models/AuditLog.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Write-only audit log (NFR-6)
// ---------------------------------------------------------------------------
export async function log(
  eventType: string,
  entityType: string,
  entityId: string,
  teamId: string,
  actorId: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await AuditLog.create({
      eventType,
      entityType,
      entityId,
      teamId,
      actorId,
      details,
      timestamp: new Date(),
    });
  } catch (err) {
    // Audit logging should never block the main operation
    logger.error({ err, eventType, entityType, entityId }, 'Failed to write audit log');
  }
}

// ---------------------------------------------------------------------------
// Query audit logs (for reports / admin)
// ---------------------------------------------------------------------------
export async function getAuditLogs(
  teamId: string,
  options: {
    eventType?: string;
    entityType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
  } = {}
): Promise<{ logs: IAuditLog[]; total: number }> {
  const filter: Record<string, unknown> = { teamId };

  if (options.eventType) filter.eventType = options.eventType;
  if (options.entityType) filter.entityType = options.entityType;

  if (options.startDate || options.endDate) {
    filter.timestamp = {};
    if (options.startDate) (filter.timestamp as Record<string, Date>).$gte = options.startDate;
    if (options.endDate) (filter.timestamp as Record<string, Date>).$lte = options.endDate;
  }

  const limit = options.limit ?? 50;
  const skip = options.skip ?? 0;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  return { logs, total };
}

// ---------------------------------------------------------------------------
// Retention enforcement — delete records older than 7 years (NFR-6)
// ---------------------------------------------------------------------------
export async function enforceRetention(): Promise<number> {
  const sevenYearsAgo = new Date();
  sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

  const result = await AuditLog.deleteMany({ timestamp: { $lt: sevenYearsAgo } });
  const deletedCount = result.deletedCount ?? 0;

  if (deletedCount > 0) {
    logger.info({ deletedCount }, 'Audit log retention enforced — old records deleted');
  }

  return deletedCount;
}
