import { Invoice, type IInvoice, type InvoiceStatus } from '../models/Invoice.js';
import { InvoiceCounter } from '../models/InvoiceCounter.js';
import { TimeRecord } from '../models/TimeRecord.js';
import { Project } from '../models/Project.js';
import * as auditService from './audit.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreatePersonalInvoiceData {
  projectId: string;
  timeRecordIds: string[];
  notes?: string | null;
  manualItems?: Array<{ description: string; amount: number }>;
}

export interface CreateCollectiveInvoiceData {
  projectId: string;
  period: { startDate: Date; endDate: Date };
  personalInvoiceIds?: string[];
  includeRemainingRecords?: boolean;
  notes?: string | null;
  manualItems?: Array<{ description: string; amount: number }>;
}

export interface UpdateDraftData {
  notes?: string | null;
  manualItems?: Array<{ description: string; amount: number }>;
}

// ---------------------------------------------------------------------------
// Sequential invoice numbering (INV-15)
// Atomic via findOneAndUpdate + $inc on standalone MongoDB
// ---------------------------------------------------------------------------
async function getNextInvoiceNumber(teamId: string): Promise<number> {
  const counter = await InvoiceCounter.findOneAndUpdate(
    { _id: teamId },
    { $inc: { lastNumber: 1 } },
    { new: true, upsert: true }
  );
  return counter.lastNumber;
}

// ---------------------------------------------------------------------------
// Tax calculation — additive model (INV-17)
// ---------------------------------------------------------------------------
function applyTaxRules(
  subtotal: number,
  taxRules: Array<{ name: string; rate: number }>
): { taxes: Array<{ name: string; rate: number; amount: number }>; totalTax: number } {
  const taxes = taxRules.map((rule) => ({
    name: rule.name,
    rate: rule.rate,
    amount: Math.round(subtotal * (rule.rate / 100) * 100) / 100,
  }));

  const totalTax = taxes.reduce((sum, t) => sum + t.amount, 0);
  return { taxes, totalTax };
}

// ---------------------------------------------------------------------------
// Create personal invoice — two-phase (INV-9, INV-10, INV-14)
// ---------------------------------------------------------------------------
export async function createPersonalInvoice(
  userId: string,
  teamId: string,
  data: CreatePersonalInvoiceData
): Promise<IInvoice> {
  // Validate project
  const project = await Project.findOne({ _id: data.projectId, teamId });
  if (!project) {
    throw AppError.notFound('Project not found in this team');
  }

  // Fetch time records — must be owned by user, billable, not yet invoiced
  const records = await TimeRecord.find({
    _id: { $in: data.timeRecordIds },
    userId,
    projectId: data.projectId,
    billable: true,
    invoiced: false,
    status: 'approved',
  });

  if (records.length === 0) {
    throw AppError.badRequest(
      'No eligible time records found. Records must be approved, billable, and not yet invoiced.',
      'NO_ELIGIBLE_RECORDS'
    );
  }

  // Phase 1: Create invoice
  const invoiceNumber = await getNextInvoiceNumber(teamId);

  // Build line items from time records
  const lineItems = records.map((r) => ({
    description: `${r.date.toISOString().slice(0, 10)} — ${(r.durationMinutes / 60).toFixed(2)}h`,
    hours: Math.round((r.durationMinutes / 60) * 100) / 100,
    rate: r.resolvedRate,
    amount: r.calculatedCost,
    timeRecordId: r._id,
  }));

  const lineSubtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const manualSubtotal = (data.manualItems ?? []).reduce((sum, item) => sum + item.amount, 0);
  const subtotal = Math.round((lineSubtotal + manualSubtotal) * 100) / 100;

  const { taxes, totalTax } = applyTaxRules(subtotal, project.taxRules);
  const total = Math.round((subtotal + totalTax) * 100) / 100;

  const invoice = new Invoice({
    invoiceNumber,
    type: 'personal',
    teamId,
    projectId: data.projectId,
    clientId: project.clientId,
    createdBy: userId,
    status: 'draft',
    timeRecordIds: records.map((r) => r._id),
    personalInvoiceIds: [],
    lineItems,
    manualItems: data.manualItems ?? [],
    notes: data.notes ?? null,
    subtotal,
    taxes,
    totalTax,
    total,
    currency: project.currency,
    reconciled: false,
  });

  await invoice.save();

  // Phase 2: Mark time records as invoiced
  for (const record of records) {
    await TimeRecord.updateOne(
      { _id: record._id, invoiced: false },
      { $set: { invoiced: true, invoiceId: invoice._id } }
    );
  }

  invoice.reconciled = true;
  await invoice.save();

  await auditService.log(
    'invoice_generated',
    'Invoice',
    invoice._id.toString(),
    teamId,
    userId,
    { invoiceNumber, type: 'personal', recordCount: records.length, total }
  );

  logger.info({ invoiceId: invoice._id, invoiceNumber, teamId }, 'Personal invoice created');
  return invoice;
}

// ---------------------------------------------------------------------------
// Create collective invoice (INV-11, INV-12, INV-13)
// ---------------------------------------------------------------------------
export async function createCollectiveInvoice(
  managerId: string,
  teamId: string,
  data: CreateCollectiveInvoiceData
): Promise<IInvoice> {
  const project = await Project.findOne({ _id: data.projectId, teamId });
  if (!project) {
    throw AppError.notFound('Project not found in this team');
  }

  // Gather personal invoices to include
  let personalInvoices: IInvoice[] = [];
  if (data.personalInvoiceIds && data.personalInvoiceIds.length > 0) {
    personalInvoices = await Invoice.find({
      _id: { $in: data.personalInvoiceIds },
      teamId,
      projectId: data.projectId,
      type: 'personal',
      status: 'draft',
    });
  }

  // Gather remaining un-invoiced approved records if requested
  let additionalRecords: typeof TimeRecord extends new () => infer T ? T[] : never[] = [];
  if (data.includeRemainingRecords) {
    additionalRecords = await TimeRecord.find({
      projectId: data.projectId,
      billable: true,
      invoiced: false,
      status: 'approved',
      date: {
        $gte: data.period.startDate,
        $lte: data.period.endDate,
      },
    }) as any;
  }

  if (personalInvoices.length === 0 && (additionalRecords as any[]).length === 0) {
    throw AppError.badRequest(
      'No personal invoices or eligible time records found for the selected period.',
      'NO_ELIGIBLE_ITEMS'
    );
  }

  const invoiceNumber = await getNextInvoiceNumber(teamId);

  // Build line items from personal invoices
  const lineItems = [];
  const allTimeRecordIds: string[] = [];

  for (const pi of personalInvoices) {
    lineItems.push({
      description: `Personal Invoice #${pi.invoiceNumber}`,
      hours: pi.lineItems.reduce((sum, li) => sum + li.hours, 0),
      rate: 0,
      amount: pi.total,
      timeRecordId: null,
    });
    allTimeRecordIds.push(...pi.timeRecordIds.map((id) => id.toString()));
  }

  // Add additional records
  for (const record of additionalRecords as any[]) {
    lineItems.push({
      description: `${record.date.toISOString().slice(0, 10)} — ${(record.durationMinutes / 60).toFixed(2)}h`,
      hours: Math.round((record.durationMinutes / 60) * 100) / 100,
      rate: record.resolvedRate,
      amount: record.calculatedCost,
      timeRecordId: record._id,
    });
    allTimeRecordIds.push(record._id.toString());
  }

  const lineSubtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const manualSubtotal = (data.manualItems ?? []).reduce((sum, item) => sum + item.amount, 0);
  const subtotal = Math.round((lineSubtotal + manualSubtotal) * 100) / 100;

  const { taxes, totalTax } = applyTaxRules(subtotal, project.taxRules);
  const total = Math.round((subtotal + totalTax) * 100) / 100;

  const invoice = new Invoice({
    invoiceNumber,
    type: 'collective',
    teamId,
    projectId: data.projectId,
    clientId: project.clientId,
    createdBy: managerId,
    status: 'draft',
    timeRecordIds: allTimeRecordIds,
    personalInvoiceIds: personalInvoices.map((pi) => pi._id),
    lineItems,
    manualItems: data.manualItems ?? [],
    notes: data.notes ?? null,
    subtotal,
    taxes,
    totalTax,
    total,
    currency: project.currency,
    period: data.period,
    reconciled: false,
  });

  await invoice.save();

  // Mark additional time records as invoiced
  for (const record of additionalRecords as any[]) {
    await TimeRecord.updateOne(
      { _id: record._id, invoiced: false },
      { $set: { invoiced: true, invoiceId: invoice._id } }
    );
  }

  invoice.reconciled = true;
  await invoice.save();

  await auditService.log(
    'invoice_generated',
    'Invoice',
    invoice._id.toString(),
    teamId,
    managerId,
    { invoiceNumber, type: 'collective', total }
  );

  logger.info({ invoiceId: invoice._id, invoiceNumber, teamId }, 'Collective invoice created');
  return invoice;
}

// ---------------------------------------------------------------------------
// Update draft (INV-3, INV-4, INV-5)
// ---------------------------------------------------------------------------
export async function updateDraft(
  invoiceId: string,
  teamId: string,
  data: UpdateDraftData
): Promise<IInvoice> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }

  if (invoice.status !== 'draft') {
    throw AppError.badRequest('Only draft invoices can be edited', 'NOT_DRAFT');
  }

  if (data.notes !== undefined) invoice.notes = data.notes;
  if (data.manualItems !== undefined) {
    invoice.manualItems = data.manualItems as any;

    // Recalculate totals
    const lineSubtotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
    const manualSubtotal = data.manualItems.reduce((sum, item) => sum + item.amount, 0);
    invoice.subtotal = Math.round((lineSubtotal + manualSubtotal) * 100) / 100;

    const project = await Project.findById(invoice.projectId);
    const taxRules = project?.taxRules ?? [];
    const { taxes, totalTax } = applyTaxRules(invoice.subtotal, taxRules);
    invoice.taxes = taxes as any;
    invoice.totalTax = totalTax;
    invoice.total = Math.round((invoice.subtotal + totalTax) * 100) / 100;
  }

  await invoice.save();

  logger.info({ invoiceId }, 'Invoice draft updated');
  return invoice;
}

// ---------------------------------------------------------------------------
// Delete draft — reverse two-phase (INV-14)
// ---------------------------------------------------------------------------
export async function deleteDraft(invoiceId: string, teamId: string): Promise<void> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }

  if (invoice.status !== 'draft') {
    throw AppError.badRequest('Only draft invoices can be deleted', 'NOT_DRAFT');
  }

  // Unmark time records
  for (const recordId of invoice.timeRecordIds) {
    await TimeRecord.updateOne(
      { _id: recordId, invoiceId: invoice._id },
      { $set: { invoiced: false, invoiceId: null } }
    );
  }

  await Invoice.deleteOne({ _id: invoiceId });

  logger.info({ invoiceId }, 'Draft invoice deleted and time records unmarked');
}

// ---------------------------------------------------------------------------
// Send invoice (INV-16)
// ---------------------------------------------------------------------------
export async function sendInvoice(invoiceId: string, teamId: string): Promise<IInvoice> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }

  if (invoice.status !== 'draft') {
    throw AppError.badRequest('Only draft invoices can be sent', 'NOT_DRAFT');
  }

  invoice.status = 'sent';
  await invoice.save();

  logger.info({ invoiceId }, 'Invoice sent');
  return invoice;
}

// ---------------------------------------------------------------------------
// Record payment (INV-8, INV-16)
// ---------------------------------------------------------------------------
export async function recordPayment(
  invoiceId: string,
  teamId: string,
  amount: number,
  date: Date
): Promise<IInvoice> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }

  if (invoice.status !== 'sent' && invoice.status !== 'partially_paid' && invoice.status !== 'overdue') {
    throw AppError.badRequest(
      `Cannot record payment for invoice with status '${invoice.status}'`,
      'INVALID_STATUS'
    );
  }

  const previousPaid = invoice.partialPaymentAmount ?? 0;
  const totalPaid = previousPaid + amount;

  if (totalPaid >= invoice.total) {
    invoice.status = 'paid';
    invoice.partialPaymentAmount = invoice.total;
  } else {
    invoice.status = 'partially_paid';
    invoice.partialPaymentAmount = Math.round(totalPaid * 100) / 100;
  }

  invoice.paymentDate = date;
  await invoice.save();

  logger.info({ invoiceId, amount, totalPaid, status: invoice.status }, 'Payment recorded');
  return invoice;
}

// ---------------------------------------------------------------------------
// List invoices
// ---------------------------------------------------------------------------
export async function listInvoices(
  teamId: string,
  options: { status?: InvoiceStatus; projectId?: string; createdBy?: string } = {}
): Promise<IInvoice[]> {
  const filter: Record<string, unknown> = { teamId };
  if (options.status) filter.status = options.status;
  if (options.projectId) filter.projectId = options.projectId;
  if (options.createdBy) filter.createdBy = options.createdBy;

  return Invoice.find(filter).sort({ createdAt: -1 });
}

// ---------------------------------------------------------------------------
// Get invoice by ID
// ---------------------------------------------------------------------------
export async function getInvoiceById(invoiceId: string, teamId: string): Promise<IInvoice> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }
  return invoice;
}

// ---------------------------------------------------------------------------
// Reconciliation — fix inconsistencies from interrupted operations
// ---------------------------------------------------------------------------
export async function reconcile(): Promise<{ fixed: number; cleaned: number }> {
  let fixed = 0;
  let cleaned = 0;

  // Find invoices where reconciled = false
  const unreconciled = await Invoice.find({ reconciled: false });

  for (const invoice of unreconciled) {
    // Check if this invoice is stale (>1 hour old and still not reconciled)
    const ageMs = Date.now() - invoice.createdAt.getTime();
    const isStale = ageMs > 60 * 60 * 1000;

    // Check how many time records are actually marked with this invoiceId
    const markedCount = await TimeRecord.countDocuments({
      _id: { $in: invoice.timeRecordIds },
      invoiceId: invoice._id,
      invoiced: true,
    });

    if (markedCount === invoice.timeRecordIds.length) {
      // All records are marked — just update reconciled flag
      invoice.reconciled = true;
      await invoice.save();
      fixed++;
    } else if (markedCount === 0 && isStale) {
      // No records marked and invoice is stale — delete it
      await Invoice.deleteOne({ _id: invoice._id });
      cleaned++;
    } else {
      // Partial marking — fix the remaining
      for (const recordId of invoice.timeRecordIds) {
        await TimeRecord.updateOne(
          { _id: recordId, invoiced: false },
          { $set: { invoiced: true, invoiceId: invoice._id } }
        );
      }
      invoice.reconciled = true;
      await invoice.save();
      fixed++;
    }
  }

  if (fixed > 0 || cleaned > 0) {
    logger.info({ fixed, cleaned }, 'Invoice reconciliation complete');
  }

  return { fixed, cleaned };
}
