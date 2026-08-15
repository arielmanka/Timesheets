import { TimeRecord, type ITimeRecord, type TimeRecordStatus } from '../models/TimeRecord.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Invoice, type InvoiceStatus, type InvoiceType } from '../models/Invoice.js';
import { Client } from '../models/Client.js';
import { User } from '../models/User.js';

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
  status?: TimeRecordStatus;
}

export interface ReportSummary {
  totalHours: number;
  costByCurrency: Array<{ currency: string; totalCost: number }>;
  byProject: Array<{
    projectId: string;
    projectName: string;
    currency: string;
    hours: number;
    cost: number;
  }>;
  byUser: Array<{
    userId: string;
    currency: string;
    hours: number;
    cost: number;
  }>;
  byTask: Array<{
    taskId: string | null;
    taskName: string | null;
    currency: string;
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
    currency: string;
    billable: boolean;
    status: string;
  }>;
}

// ---------------------------------------------------------------------------
// Get summary (RPT-1, RPT-2, RPT-3)
//
// Every breakdown is grouped by currency, not just project/user/task — a
// team's projects can be (and here, are) billed in different currencies
// (e.g. NATO in EUR, DCPS/GAC in CAD), and blindly summing "14,240 + 1,440"
// as if both were the same currency produces a number that means nothing.
// Each record's own stored `currency` (snapshotted at creation time) is the
// source of truth, not the project's *current* currency setting — a project
// could have its currency changed after time was already logged against it,
// and historical entries should keep reporting under the currency they were
// actually billed in.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Shared scoping: resolves the team's matching projects and time records for
// a report filter, including role-scoping (RPT-6) — used by getSummary and
// getTrend so the two never drift on what "matches this filter" means.
// `projectMap` carries clientId too so a caller can group by client without
// a second Project query.
// ---------------------------------------------------------------------------
async function resolveScopedRecords(
  filter: ReportFilter,
  isManager: boolean,
  requestingUserId: string
): Promise<{
  records: ITimeRecord[];
  projectMap: Map<string, { name: string; clientId: string }>;
  taskMap: Map<string, string>;
}> {
  const projectFilter: Record<string, unknown> = { teamId: filter.teamId };
  if (filter.clientId) projectFilter.clientId = filter.clientId;
  if (filter.projectId) projectFilter._id = filter.projectId;

  const projects = await Project.find(projectFilter);
  const projectIds = projects.map((p) => p._id);
  const projectMap = new Map(projects.map((p) => [p._id.toString(), { name: p.name, clientId: p.clientId.toString() }]));

  if (projectIds.length === 0) {
    return { records: [], projectMap, taskMap: new Map() };
  }

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
  if (filter.status) query.status = filter.status;

  if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) (query.date as Record<string, Date>).$gte = filter.startDate;
    if (filter.endDate) (query.date as Record<string, Date>).$lte = filter.endDate;
  }

  const records = await TimeRecord.find(query).sort({ date: -1 });

  const tasks = await Task.find({ projectId: { $in: projectIds } });
  const taskMap = new Map(tasks.map((t) => [t._id.toString(), t.name]));

  return { records, projectMap, taskMap };
}

export async function getSummary(
  filter: ReportFilter,
  isManager: boolean,
  requestingUserId: string
): Promise<ReportSummary> {
  const { records, projectMap, taskMap } = await resolveScopedRecords(filter, isManager, requestingUserId);

  if (projectMap.size === 0) {
    return { totalHours: 0, costByCurrency: [], byProject: [], byUser: [], byTask: [], records: [] };
  }

  // Aggregate — every map is keyed by `${id}:${currency}` so entries in
  // different currencies never collapse into one row.
  let totalMinutes = 0;
  const costByCurrencyMap = new Map<string, number>();
  const byProjectMap = new Map<string, { hours: number; cost: number }>();
  const byUserMap = new Map<string, { hours: number; cost: number }>();
  const byTaskMap = new Map<string, { hours: number; cost: number }>();

  for (const r of records) {
    totalMinutes += r.durationMinutes;
    const hours = r.durationMinutes / 60;

    costByCurrencyMap.set(r.currency, (costByCurrencyMap.get(r.currency) ?? 0) + r.calculatedCost);

    const pKey = `${r.projectId.toString()}:${r.currency}`;
    const pEntry = byProjectMap.get(pKey) ?? { hours: 0, cost: 0 };
    pEntry.hours += hours;
    pEntry.cost += r.calculatedCost;
    byProjectMap.set(pKey, pEntry);

    const uKey = `${r.userId.toString()}:${r.currency}`;
    const uEntry = byUserMap.get(uKey) ?? { hours: 0, cost: 0 };
    uEntry.hours += hours;
    uEntry.cost += r.calculatedCost;
    byUserMap.set(uKey, uEntry);

    const tKey = `${r.taskId?.toString() ?? '__none__'}:${r.currency}`;
    const tEntry = byTaskMap.get(tKey) ?? { hours: 0, cost: 0 };
    tEntry.hours += hours;
    tEntry.cost += r.calculatedCost;
    byTaskMap.set(tKey, tEntry);
  }

  return {
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    costByCurrency: Array.from(costByCurrencyMap.entries()).map(([currency, totalCost]) => ({
      currency,
      totalCost: Math.round(totalCost * 100) / 100,
    })),
    byProject: Array.from(byProjectMap.entries()).map(([key, data]) => {
      const [id, currency] = key.split(':');
      return {
        projectId: id,
        projectName: projectMap.get(id)?.name ?? 'Unknown',
        currency,
        hours: Math.round(data.hours * 100) / 100,
        cost: Math.round(data.cost * 100) / 100,
      };
    }),
    byUser: Array.from(byUserMap.entries()).map(([key, data]) => {
      const [id, currency] = key.split(':');
      return {
        userId: id,
        currency,
        hours: Math.round(data.hours * 100) / 100,
        cost: Math.round(data.cost * 100) / 100,
      };
    }),
    byTask: Array.from(byTaskMap.entries()).map(([key, data]) => {
      const [id, currency] = key.split(':');
      const taskId = id === '__none__' ? null : id;
      return {
        taskId,
        taskName: taskId ? (taskMap.get(taskId) ?? 'Unknown task') : null,
        currency,
        hours: Math.round(data.hours * 100) / 100,
        cost: Math.round(data.cost * 100) / 100,
      };
    }),
    records: records.map((r) => ({
      _id: r._id.toString(),
      userId: r.userId.toString(),
      projectId: r.projectId.toString(),
      taskId: r.taskId?.toString() ?? null,
      date: r.date,
      durationMinutes: r.durationMinutes,
      calculatedCost: r.calculatedCost,
      currency: r.currency,
      billable: r.billable,
      status: r.status,
    })),
  };
}

// ---------------------------------------------------------------------------
// Trend — hours and cost over time, grouped by client/project/task/user
// (RPT-8/RPT-9). No date-bucketing precedent existed in this codebase before
// this, so it follows the same find-and-reduce-in-JS style as getSummary
// rather than introducing a Mongo aggregation pipeline.
// ---------------------------------------------------------------------------
export type TrendGroupBy = 'client' | 'project' | 'task' | 'user';
export type TrendGranularity = 'day' | 'week' | 'month';

export interface TrendSeries {
  id: string;
  name: string;
  currency: string;
  hours: number[];
  cost: number[];
}

export interface TrendResult {
  groupBy: TrendGroupBy;
  granularity: TrendGranularity;
  buckets: string[];
  series: TrendSeries[];
}

const MAX_TREND_SERIES = 7;
const OTHER_ID = '__other__';
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfIsoWeek(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday .. 6 = Sunday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function bucketStartForDate(d: Date, granularity: TrendGranularity): Date {
  if (granularity === 'day') return toUtcMidnight(d);
  if (granularity === 'week') return startOfIsoWeek(d);
  return startOfMonth(d);
}

function generateBucketDates(start: Date, end: Date, granularity: TrendGranularity): Date[] {
  const dates: Date[] = [];
  if (granularity === 'day') {
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) dates.push(new Date(t));
  } else if (granularity === 'week') {
    const lastStart = startOfIsoWeek(end).getTime();
    for (let t = startOfIsoWeek(start).getTime(); t <= lastStart; t += 7 * DAY_MS) dates.push(new Date(t));
  } else {
    let cur = startOfMonth(start);
    const last = startOfMonth(end).getTime();
    while (cur.getTime() <= last) {
      dates.push(cur);
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  }
  return dates;
}

export async function getTrend(
  filter: ReportFilter,
  groupBy: TrendGroupBy,
  isManager: boolean,
  requestingUserId: string
): Promise<TrendResult> {
  // Default to the last 30 days when no explicit range is given (and fill in
  // whichever single side is missing if only one was).
  const effectiveEnd = toUtcMidnight(filter.endDate ?? new Date());
  const effectiveStart = toUtcMidnight(filter.startDate ?? new Date(effectiveEnd.getTime() - 29 * DAY_MS));

  const spanDays = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / DAY_MS) + 1;
  const granularity: TrendGranularity = spanDays <= 62 ? 'day' : spanDays <= 182 ? 'week' : 'month';

  const { records, projectMap, taskMap } = await resolveScopedRecords(
    { ...filter, startDate: effectiveStart, endDate: effectiveEnd },
    isManager,
    requestingUserId
  );

  const bucketDates = generateBucketDates(effectiveStart, effectiveEnd, granularity);
  const buckets = bucketDates.map((d) => d.toISOString().slice(0, 10));
  const bucketIndexByKey = new Map(buckets.map((b, i) => [b, i]));

  const clientIds =
    groupBy === 'client' ? [...new Set(Array.from(projectMap.values()).map((p) => p.clientId))] : [];
  const clients = clientIds.length ? await Client.find({ _id: { $in: clientIds } }) : [];
  const clientNameById = new Map(clients.map((c) => [c._id.toString(), c.name]));

  const userIds = groupBy === 'user' ? [...new Set(records.map((r) => r.userId.toString()))] : [];
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }) : [];
  const userNameById = new Map(users.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName}`]));

  function entityFor(r: ITimeRecord): { id: string; name: string } {
    if (groupBy === 'project') {
      const p = projectMap.get(r.projectId.toString());
      return { id: r.projectId.toString(), name: p?.name ?? 'Unknown project' };
    }
    if (groupBy === 'client') {
      const p = projectMap.get(r.projectId.toString());
      const clientId = p?.clientId ?? 'unknown';
      return { id: clientId, name: clientNameById.get(clientId) ?? 'Unknown client' };
    }
    if (groupBy === 'task') {
      const id = r.taskId?.toString() ?? '__none__';
      return { id, name: id === '__none__' ? 'No task' : (taskMap.get(id) ?? 'Unknown task') };
    }
    const id = r.userId.toString();
    return { id, name: userNameById.get(id) ?? 'Unknown user' };
  }

  // Pass 1: bucket every (entity:currency) pair, and separately track each
  // entity's total hours (currency-agnostic — hours aren't currency-specific)
  // to rank for the series cap below.
  const totalHoursByEntity = new Map<string, number>();
  const seriesMap = new Map<string, { name: string; currency: string; hours: number[]; cost: number[] }>();

  for (const r of records) {
    const bucketDateKey = bucketStartForDate(r.date, granularity).toISOString().slice(0, 10);
    const idx = bucketIndexByKey.get(bucketDateKey);
    if (idx === undefined) continue;

    const { id, name } = entityFor(r);
    const hours = r.durationMinutes / 60;
    totalHoursByEntity.set(id, (totalHoursByEntity.get(id) ?? 0) + hours);

    const key = `${id}:${r.currency}`;
    const entry =
      seriesMap.get(key) ?? { name, currency: r.currency, hours: new Array(buckets.length).fill(0), cost: new Array(buckets.length).fill(0) };
    entry.hours[idx] += hours;
    entry.cost[idx] += r.calculatedCost;
    seriesMap.set(key, entry);
  }

  // Cap at MAX_TREND_SERIES, ranked by total hours descending — never a
  // generated 9th color; the tail folds into "Other" per currency.
  const rankedIds = Array.from(totalHoursByEntity.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const keepIds = new Set(rankedIds.slice(0, MAX_TREND_SERIES));

  const finalSeriesMap = new Map<string, { name: string; currency: string; hours: number[]; cost: number[] }>();
  for (const [key, entry] of seriesMap.entries()) {
    const [id, currency] = key.split(':');
    if (keepIds.has(id)) {
      finalSeriesMap.set(key, entry);
      continue;
    }
    const otherKey = `${OTHER_ID}:${currency}`;
    const otherEntry =
      finalSeriesMap.get(otherKey) ??
      { name: 'Other', currency, hours: new Array(buckets.length).fill(0), cost: new Array(buckets.length).fill(0) };
    for (let i = 0; i < buckets.length; i++) {
      otherEntry.hours[i] += entry.hours[i];
      otherEntry.cost[i] += entry.cost[i];
    }
    finalSeriesMap.set(otherKey, otherEntry);
  }

  const series: TrendSeries[] = Array.from(finalSeriesMap.entries()).map(([key, data]) => ({
    id: key.split(':')[0]!,
    name: data.name,
    currency: data.currency,
    hours: data.hours.map((h) => Math.round(h * 100) / 100),
    cost: data.cost.map((c) => Math.round(c * 100) / 100),
  }));

  return { groupBy, granularity, buckets, series };
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
    Currency: r.currency,
    Billable: r.billable ? 'Yes' : 'No',
    Status: r.status,
  }));
}

// ---------------------------------------------------------------------------
// Invoice report — per client, by status, paid vs outstanding.
//
// Regular users only ever see their own invoices (same posture as the time
// report above); managers see the whole team's. "Draft" invoices are
// excluded from the money totals (totalInvoiced/Paid/Outstanding) since
// they're not a real claim on a client yet — they still appear in the row
// list and status counts so a manager can see them.
//
// Totals are grouped by currency rather than blindly summed together —
// different clients/invoices in a team can be billed in different
// currencies, and summing "100 EUR + 100 USD" as "200" would be meaningless.
// ---------------------------------------------------------------------------
export interface InvoiceReportFilter {
  teamId: string;
  startDate?: Date;
  endDate?: Date;
  clientId?: string;
  status?: InvoiceStatus;
  type?: InvoiceType;
  paid?: boolean;
}

export interface InvoiceReportRow {
  _id: string;
  invoiceNumber: string;
  type: InvoiceType;
  clientId: string;
  clientName: string;
  createdBy: string;
  status: InvoiceStatus;
  total: number;
  currency: string;
  partialPaymentAmount: number | null;
  paymentDate: Date | null;
  createdAt: Date;
}

interface CurrencyTotals {
  currency: string;
  count: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
}

export interface InvoiceReportSummary {
  countByStatus: Record<string, number>;
  totalsByCurrency: CurrencyTotals[];
  byClient: Array<CurrencyTotals & { clientId: string; clientName: string }>;
  invoices: InvoiceReportRow[];
}

export async function getInvoiceReport(
  filter: InvoiceReportFilter,
  isManager: boolean,
  requestingUserId: string
): Promise<InvoiceReportSummary> {
  const query: Record<string, unknown> = { teamId: filter.teamId };

  if (!isManager) {
    query.createdBy = requestingUserId;
  }
  if (filter.clientId) query.clientId = filter.clientId;
  if (filter.status) query.status = filter.status;
  if (filter.type) query.type = filter.type;
  if (filter.paid !== undefined) {
    query.status = filter.paid ? 'paid' : { $ne: 'paid' };
  }
  if (filter.startDate || filter.endDate) {
    query.createdAt = {};
    if (filter.startDate) (query.createdAt as Record<string, Date>).$gte = filter.startDate;
    if (filter.endDate) (query.createdAt as Record<string, Date>).$lte = filter.endDate;
  }

  const invoices = await Invoice.find(query).sort({ createdAt: -1 });

  const clientIds = [...new Set(invoices.map((i) => i.clientId.toString()))];
  const clients = await Client.find({ _id: { $in: clientIds } });
  const clientNameById = new Map(clients.map((c) => [c._id.toString(), c.name]));

  const countByStatus: Record<string, number> = {};
  const currencyTotals = new Map<string, CurrencyTotals>();
  const clientTotals = new Map<string, CurrencyTotals & { clientId: string; clientName: string }>();

  const addTo = (bucket: CurrencyTotals, invoice: (typeof invoices)[number]) => {
    bucket.count += 1;
    if (invoice.status === 'draft') return;
    const paidAmount = invoice.partialPaymentAmount ?? (invoice.status === 'paid' ? invoice.total : 0);
    bucket.totalInvoiced = Math.round((bucket.totalInvoiced + invoice.total) * 100) / 100;
    bucket.totalPaid = Math.round((bucket.totalPaid + paidAmount) * 100) / 100;
    if (invoice.status !== 'paid') {
      bucket.totalOutstanding = Math.round((bucket.totalOutstanding + (invoice.total - paidAmount)) * 100) / 100;
    }
  };

  for (const invoice of invoices) {
    countByStatus[invoice.status] = (countByStatus[invoice.status] ?? 0) + 1;

    const currencyBucket = currencyTotals.get(invoice.currency) ?? {
      currency: invoice.currency,
      count: 0,
      totalInvoiced: 0,
      totalPaid: 0,
      totalOutstanding: 0,
    };
    addTo(currencyBucket, invoice);
    currencyTotals.set(invoice.currency, currencyBucket);

    const clientKey = `${invoice.clientId.toString()}:${invoice.currency}`;
    const clientBucket = clientTotals.get(clientKey) ?? {
      clientId: invoice.clientId.toString(),
      clientName: clientNameById.get(invoice.clientId.toString()) ?? 'Unknown client',
      currency: invoice.currency,
      count: 0,
      totalInvoiced: 0,
      totalPaid: 0,
      totalOutstanding: 0,
    };
    addTo(clientBucket, invoice);
    clientTotals.set(clientKey, clientBucket);
  }

  return {
    countByStatus,
    totalsByCurrency: Array.from(currencyTotals.values()),
    byClient: Array.from(clientTotals.values()),
    invoices: invoices.map((i) => ({
      _id: i._id.toString(),
      invoiceNumber: i.invoiceNumber,
      type: i.type,
      clientId: i.clientId.toString(),
      clientName: clientNameById.get(i.clientId.toString()) ?? 'Unknown client',
      createdBy: i.createdBy.toString(),
      status: i.status,
      total: i.total,
      currency: i.currency,
      partialPaymentAmount: i.partialPaymentAmount,
      paymentDate: i.paymentDate,
      createdAt: i.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Invoice trend — count and amount over time, grouped by client or by
// status (RPT-10/RPT-11). Bucketed by createdAt, same convention already
// used by getInvoiceReport's date filter. Reuses the bucket-generation
// helpers defined above for the time trend (getTrend) — same granularity
// rules, same default-30-days behavior.
// ---------------------------------------------------------------------------
export type InvoiceTrendGroupBy = 'client' | 'status';

export interface InvoiceTrendSeries {
  id: string;
  name: string;
  currency: string;
  count: number[];
  amount: number[];
}

export interface InvoiceTrendResult {
  groupBy: InvoiceTrendGroupBy;
  granularity: TrendGranularity;
  buckets: string[];
  series: InvoiceTrendSeries[];
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially paid',
  overdue: 'Overdue',
  paid: 'Paid',
};

export async function getInvoiceTrend(
  filter: InvoiceReportFilter,
  groupBy: InvoiceTrendGroupBy,
  isManager: boolean,
  requestingUserId: string
): Promise<InvoiceTrendResult> {
  const effectiveEnd = toUtcMidnight(filter.endDate ?? new Date());
  const effectiveStart = toUtcMidnight(filter.startDate ?? new Date(effectiveEnd.getTime() - 29 * DAY_MS));

  const spanDays = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / DAY_MS) + 1;
  const granularity: TrendGranularity = spanDays <= 62 ? 'day' : spanDays <= 182 ? 'week' : 'month';

  // createdAt is a full timestamp, not a date-only field like TimeRecord.date
  // — the upper bound must reach the end of effectiveEnd's calendar day, not
  // its midnight start, or every invoice created later that same day (i.e.
  // virtually all of them) would be excluded.
  const query: Record<string, unknown> = {
    teamId: filter.teamId,
    createdAt: { $gte: effectiveStart, $lt: new Date(effectiveEnd.getTime() + DAY_MS) },
  };
  if (!isManager) query.createdBy = requestingUserId;
  if (filter.clientId) query.clientId = filter.clientId;
  if (filter.type) query.type = filter.type;
  if (filter.status) query.status = filter.status;
  if (filter.paid !== undefined) {
    query.status = filter.paid ? 'paid' : { $ne: 'paid' };
  }

  const invoices = await Invoice.find(query);

  const bucketDates = generateBucketDates(effectiveStart, effectiveEnd, granularity);
  const buckets = bucketDates.map((d) => d.toISOString().slice(0, 10));
  const bucketIndexByKey = new Map(buckets.map((b, i) => [b, i]));

  const clientIds = groupBy === 'client' ? [...new Set(invoices.map((i) => i.clientId.toString()))] : [];
  const clients = clientIds.length ? await Client.find({ _id: { $in: clientIds } }) : [];
  const clientNameById = new Map(clients.map((c) => [c._id.toString(), c.name]));

  function entityFor(inv: { status: string; clientId: unknown }): { id: string; name: string } {
    if (groupBy === 'status') {
      return { id: inv.status, name: INVOICE_STATUS_LABELS[inv.status] ?? inv.status };
    }
    const id = (inv.clientId as { toString(): string }).toString();
    return { id, name: clientNameById.get(id) ?? 'Unknown client' };
  }

  // Ranked by count, not amount — count is currency-agnostic (same reason
  // getTrend ranks by hours rather than cost), so it's a stable basis for a
  // single ranking even when a client's invoices span several currencies.
  const totalCountByEntity = new Map<string, number>();
  const seriesMap = new Map<string, { name: string; currency: string; count: number[]; amount: number[] }>();

  for (const inv of invoices) {
    const bucketDateKey = bucketStartForDate(inv.createdAt, granularity).toISOString().slice(0, 10);
    const idx = bucketIndexByKey.get(bucketDateKey);
    if (idx === undefined) continue;

    const { id, name } = entityFor(inv);
    totalCountByEntity.set(id, (totalCountByEntity.get(id) ?? 0) + 1);

    const key = `${id}:${inv.currency}`;
    const entry =
      seriesMap.get(key) ?? { name, currency: inv.currency, count: new Array(buckets.length).fill(0), amount: new Array(buckets.length).fill(0) };
    entry.count[idx] += 1;
    // A draft invoice isn't a real claim on a client yet — counted, but not
    // charted as money, same rule getInvoiceReport already applies.
    if (inv.status !== 'draft') {
      entry.amount[idx] += inv.total;
    }
    seriesMap.set(key, entry);
  }

  // Cap at MAX_TREND_SERIES for "client" (status never has more than 5
  // values, so it never needs folding).
  let finalSeriesMap = seriesMap;
  if (groupBy === 'client') {
    const rankedIds = Array.from(totalCountByEntity.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    const keepIds = new Set(rankedIds.slice(0, MAX_TREND_SERIES));

    finalSeriesMap = new Map();
    for (const [key, entry] of seriesMap.entries()) {
      const [id, currency] = key.split(':');
      if (keepIds.has(id)) {
        finalSeriesMap.set(key, entry);
        continue;
      }
      const otherKey = `${OTHER_ID}:${currency}`;
      const otherEntry =
        finalSeriesMap.get(otherKey) ??
        { name: 'Other', currency, count: new Array(buckets.length).fill(0), amount: new Array(buckets.length).fill(0) };
      for (let i = 0; i < buckets.length; i++) {
        otherEntry.count[i] += entry.count[i];
        otherEntry.amount[i] += entry.amount[i];
      }
      finalSeriesMap.set(otherKey, otherEntry);
    }
  }

  const series: InvoiceTrendSeries[] = Array.from(finalSeriesMap.entries()).map(([key, data]) => ({
    id: key.split(':')[0]!,
    name: data.name,
    currency: data.currency,
    count: data.count,
    amount: data.amount.map((a) => Math.round(a * 100) / 100),
  }));

  return { groupBy, granularity, buckets, series };
}

export async function getInvoiceExportData(
  filter: InvoiceReportFilter,
  isManager: boolean,
  requestingUserId: string
): Promise<Array<Record<string, unknown>>> {
  const report = await getInvoiceReport(filter, isManager, requestingUserId);

  return report.invoices.map((i) => ({
    'Invoice #': i.invoiceNumber,
    Type: i.type,
    Client: i.clientName,
    Status: i.status,
    Total: i.total,
    Currency: i.currency,
    Paid: i.partialPaymentAmount ?? (i.status === 'paid' ? i.total : 0),
    Outstanding: i.status === 'paid' || i.status === 'draft' ? 0 : i.total - (i.partialPaymentAmount ?? 0),
    'Payment date': i.paymentDate ? i.paymentDate.toISOString().slice(0, 10) : '',
    Created: i.createdAt.toISOString().slice(0, 10),
  }));
}
