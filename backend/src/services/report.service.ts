import { TimeRecord, type TimeRecordStatus } from '../models/TimeRecord.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Invoice, type InvoiceStatus, type InvoiceType } from '../models/Invoice.js';
import { Client } from '../models/Client.js';

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
    return { totalHours: 0, costByCurrency: [], byProject: [], byUser: [], byTask: [], records: [] };
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
  if (filter.status) query.status = filter.status;

  if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) (query.date as Record<string, Date>).$gte = filter.startDate;
    if (filter.endDate) (query.date as Record<string, Date>).$lte = filter.endDate;
  }

  const records = await TimeRecord.find(query).sort({ date: -1 });

  const tasks = await Task.find({ projectId: { $in: projectIds } });
  const taskMap = new Map(tasks.map((t) => [t._id.toString(), t.name]));

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
        projectName: projectMap.get(id) ?? 'Unknown',
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
