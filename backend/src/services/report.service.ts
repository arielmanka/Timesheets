import { TimeRecord } from '../models/TimeRecord.js';
import { Project } from '../models/Project.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ReportFilter {
  teamId: string;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  projectId?: string;
  clientId?: string;
  taskId?: string;
}

export interface ReportSummary {
  totalHours: number;
  totalCost: number;
  currency: string;
  byProject: Array<{
    projectId: string;
    projectName: string;
    hours: number;
    cost: number;
  }>;
  byUser: Array<{
    userId: string;
    hours: number;
    cost: number;
  }>;
  byTask: Array<{
    taskId: string | null;
    hours: number;
    cost: number;
  }>;
  records: Array<{
    _id: string;
    userId: string;
    projectId: string;
    taskId: string | null;
    date: Date;
    durationMinutes: number;
    calculatedCost: number;
    billable: boolean;
    status: string;
  }>;
}

// ---------------------------------------------------------------------------
// Get summary (RPT-1, RPT-2, RPT-3)
// ---------------------------------------------------------------------------
export async function getSummary(
  filter: ReportFilter,
  isManager: boolean,
  requestingUserId: string
): Promise<ReportSummary> {
  // Get project IDs for this team
  const projectFilter: Record<string, unknown> = { teamId: filter.teamId };
  if (filter.clientId) projectFilter.clientId = filter.clientId;
  if (filter.projectId) projectFilter._id = filter.projectId;

  const projects = await Project.find(projectFilter);
  const projectIds = projects.map((p) => p._id);
  const projectMap = new Map(projects.map((p) => [p._id.toString(), p.name]));

  if (projectIds.length === 0) {
    return { totalHours: 0, totalCost: 0, currency: 'USD', byProject: [], byUser: [], byTask: [], records: [] };
  }

  // Build time record query
  const query: Record<string, unknown> = {
    projectId: { $in: projectIds },
  };

  // Scope by role (RPT-6)
  if (!isManager) {
    query.userId = requestingUserId;
  } else if (filter.userId) {
    query.userId = filter.userId;
  }

  if (filter.taskId) query.taskId = filter.taskId;

  if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) (query.date as Record<string, Date>).$gte = filter.startDate;
    if (filter.endDate) (query.date as Record<string, Date>).$lte = filter.endDate;
  }

  const records = await TimeRecord.find(query).sort({ date: -1 });

  // Aggregate
  let totalMinutes = 0;
  let totalCost = 0;
  const byProjectMap = new Map<string, { hours: number; cost: number }>();
  const byUserMap = new Map<string, { hours: number; cost: number }>();
  const byTaskMap = new Map<string, { hours: number; cost: number }>();

  for (const r of records) {
    totalMinutes += r.durationMinutes;
    totalCost += r.calculatedCost;

    const pid = r.projectId.toString();
    const existing = byProjectMap.get(pid) ?? { hours: 0, cost: 0 };
    existing.hours += r.durationMinutes / 60;
    existing.cost += r.calculatedCost;
    byProjectMap.set(pid, existing);

    const uid = r.userId.toString();
    const userEntry = byUserMap.get(uid) ?? { hours: 0, cost: 0 };
    userEntry.hours += r.durationMinutes / 60;
    userEntry.cost += r.calculatedCost;
    byUserMap.set(uid, userEntry);

    const tid = r.taskId?.toString() ?? '__none__';
    const taskEntry = byTaskMap.get(tid) ?? { hours: 0, cost: 0 };
    taskEntry.hours += r.durationMinutes / 60;
    taskEntry.cost += r.calculatedCost;
    byTaskMap.set(tid, taskEntry);
  }

  const currency = projects[0]?.currency ?? 'USD';

  return {
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    currency,
    byProject: Array.from(byProjectMap.entries()).map(([id, data]) => ({
      projectId: id,
      projectName: projectMap.get(id) ?? 'Unknown',
      hours: Math.round(data.hours * 100) / 100,
      cost: Math.round(data.cost * 100) / 100,
    })),
    byUser: Array.from(byUserMap.entries()).map(([id, data]) => ({
      userId: id,
      hours: Math.round(data.hours * 100) / 100,
      cost: Math.round(data.cost * 100) / 100,
    })),
    byTask: Array.from(byTaskMap.entries()).map(([id, data]) => ({
      taskId: id === '__none__' ? null : id,
      hours: Math.round(data.hours * 100) / 100,
      cost: Math.round(data.cost * 100) / 100,
    })),
    records: records.map((r) => ({
      _id: r._id.toString(),
      userId: r.userId.toString(),
      projectId: r.projectId.toString(),
      taskId: r.taskId?.toString() ?? null,
      date: r.date,
      durationMinutes: r.durationMinutes,
      calculatedCost: r.calculatedCost,
      billable: r.billable,
      status: r.status,
    })),
  };
}

// ---------------------------------------------------------------------------
// Export as CSV rows (RPT-4)
// ---------------------------------------------------------------------------
export async function getExportData(
  filter: ReportFilter,
  isManager: boolean,
  requestingUserId: string
): Promise<Array<Record<string, unknown>>> {
  const summary = await getSummary(filter, isManager, requestingUserId);

  return summary.records.map((r) => ({
    Date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
    'User ID': r.userId,
    'Project ID': r.projectId,
    'Task ID': r.taskId ?? '',
    'Duration (min)': r.durationMinutes,
    'Duration (h)': Math.round((r.durationMinutes / 60) * 100) / 100,
    Cost: r.calculatedCost,
    Billable: r.billable ? 'Yes' : 'No',
    Status: r.status,
  }));
}
