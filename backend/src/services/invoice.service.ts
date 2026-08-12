import { Invoice, type IInvoice, type InvoiceStatus, type ILineItem } from '../models/Invoice.js';
import { InvoiceCounter } from '../models/InvoiceCounter.js';
import { TimeRecord, type ITimeRecord } from '../models/TimeRecord.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Client } from '../models/Client.js';
import { User } from '../models/User.js';
import { isBankAccountComplete } from '../models/shared/bankAccount.js';
import * as auditService from './audit.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TaxRuleInput {
  name: string;
  rate: number;
}

export interface CreatePersonalInvoiceData {
  projectId: string;
  timeRecordIds: string[];
  notes?: string | null;
  manualItems?: Array<{ description: string; amount: number }>;
  taxRules?: TaxRuleInput[];
  dueDate?: Date | null;
  paymentTerms?: string | null;
  taxNote?: string | null;
}

export interface CreateCollectiveInvoiceData {
  clientId: string;
  period: { startDate: Date; endDate: Date };
  personalInvoiceIds?: string[];
  notes?: string | null;
  manualItems?: Array<{ description: string; amount: number }>;
  dueDate?: Date | null;
  paymentTerms?: string | null;
  taxNote?: string | null;
}

export interface UpdateDraftData {
  notes?: string | null;
  manualItems?: Array<{ description: string; amount: number }>;
  taxRules?: TaxRuleInput[];
  dueDate?: Date | null;
  paymentTerms?: string | null;
  taxNote?: string | null;
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

// Format: yyyymmdd-NNNNNN — creation date + a 6-digit, zero-padded, per-team
// sequence number that never resets (the date is just a stamp of when the
// invoice was issued, not a daily-reset scope).
function formatInvoiceNumber(seq: number, date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}-${String(seq).padStart(6, '0')}`;
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
// Recompute subtotal/taxes/total from an invoice's current line + manual
// items. Shared by every create/add/remove path so the math never drifts
// between them. Tax is always explicitly chosen by the invoice's creator at
// creation/edit time — never derived from project or client config — so
// every caller either passes the rules the user picked, or (when an edit
// only touches line items, not tax) the invoice's own already-stored
// taxes, so the previously chosen rate keeps applying to the new subtotal.
// ---------------------------------------------------------------------------
function recalcTotals(invoice: IInvoice, taxRules: Array<{ name: string; rate: number }> = []): void {
  const lineSubtotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
  const manualSubtotal = invoice.manualItems.reduce((sum, item) => sum + item.amount, 0);
  invoice.subtotal = Math.round((lineSubtotal + manualSubtotal) * 100) / 100;

  const { taxes, totalTax } = applyTaxRules(invoice.subtotal, taxRules);
  invoice.taxes = taxes as unknown as IInvoice['taxes'];
  invoice.totalTax = totalTax;
  invoice.total = Math.round((invoice.subtotal + totalTax) * 100) / 100;
}

function timeRecordLineItem(record: ITimeRecord, projectName: string, taskName: string | null): ILineItem {
  const description = [record.date.toISOString().slice(0, 10), projectName, taskName].filter((part) => part).join(', ');
  return {
    description,
    hours: Math.round((record.durationMinutes / 60) * 100) / 100,
    rate: record.resolvedRate,
    amount: record.calculatedCost,
    netAmount: null,
    taxRate: null,
    timeRecordId: record._id,
    personalInvoiceId: null,
  } as ILineItem;
}

// A collective invoice keeps each pooled personal invoice's own VAT rate —
// it does not apply a rate of its own. Ariel (0% VAT, Poland) and Bob (21%
// VAT, Germany) each charge what their own incorporation requires; the
// collective invoice for their shared client just totals up what each of
// them already billed, gross, one line per personal invoice.
function personalInvoiceLineItem(personal: IInvoice): ILineItem {
  return {
    description: personal.invoiceNumber,
    hours: personal.lineItems.reduce((sum, li) => sum + li.hours, 0),
    rate: 0,
    amount: personal.total,
    netAmount: personal.subtotal,
    taxRate: personal.taxes[0]?.rate ?? 0,
    timeRecordId: null,
    personalInvoiceId: personal._id,
  } as ILineItem;
}

// ---------------------------------------------------------------------------
// Recompute a collective invoice's totals from its rolled-up line items.
// Unlike recalcTotals, no tax rule is applied here — each line item already
// carries its own net/gross (from the personal invoice it represents), so
// the collective invoice's subtotal/total are just the sum of those, and it
// has no tax rate of its own.
// ---------------------------------------------------------------------------
function recalcCollectiveTotals(invoice: IInvoice): void {
  const lineNet = invoice.lineItems.reduce((sum, item) => sum + (item.netAmount ?? item.amount), 0);
  const lineGross = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
  const manualTotal = invoice.manualItems.reduce((sum, item) => sum + item.amount, 0);

  invoice.subtotal = Math.round((lineNet + manualTotal) * 100) / 100;
  invoice.total = Math.round((lineGross + manualTotal) * 100) / 100;
  invoice.totalTax = Math.round((invoice.total - invoice.subtotal) * 100) / 100;
  invoice.taxes = [] as unknown as IInvoice['taxes'];
}

// ---------------------------------------------------------------------------
// A personal invoice's supply/service period — the EU/NA-required date
// range the invoiced work actually covers — is always derived from the
// dates of its included time records, never manually entered, so it can
// never drift from what's actually being billed.
// ---------------------------------------------------------------------------
function computePeriodFromRecords(records: ITimeRecord[]): { startDate: Date; endDate: Date } | null {
  if (records.length === 0) return null;
  const dates = records.map((r) => r.date.getTime());
  return { startDate: new Date(Math.min(...dates)), endDate: new Date(Math.max(...dates)) };
}

// ---------------------------------------------------------------------------
// A manager must be a contractor with a complete incorporation profile AND
// a complete collective bank account before they can issue a collective
// invoice — separate checks, separate error codes, so the UI can tell the
// user exactly which one is missing.
// ---------------------------------------------------------------------------
async function requireCollectiveInvoicingProfile(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user || user.employmentType !== 'contractor' || !user.incorporation) {
    throw AppError.badRequest(
      'A complete incorporation profile (company name, address, tax ID) is required to create a collective invoice. Add it in Account settings first.',
      'INCORPORATION_PROFILE_REQUIRED'
    );
  }
  if (!isBankAccountComplete(user.collectiveBankAccount)) {
    throw AppError.badRequest(
      'A complete collective bank account is required to create a collective invoice. Add it in Account settings first.',
      'COLLECTIVE_BANK_ACCOUNT_REQUIRED'
    );
  }
}

// ---------------------------------------------------------------------------
// Create personal invoice — two-phase (INV-9, INV-10, INV-14)
// ---------------------------------------------------------------------------
export async function createPersonalInvoice(
  userId: string,
  teamId: string,
  data: CreatePersonalInvoiceData
): Promise<IInvoice> {
  const project = await Project.findOne({ _id: data.projectId, teamId });
  if (!project) {
    throw AppError.notFound('Project not found in this team');
  }

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

  const invoiceNumber = formatInvoiceNumber(await getNextInvoiceNumber(teamId), new Date());
  const taskIds = [...new Set(records.map((r) => r.taskId?.toString()).filter((id): id is string => !!id))];
  const tasks = await Task.find({ _id: { $in: taskIds } });
  const taskNameById = new Map(tasks.map((t) => [t._id.toString(), t.name]));
  const lineItems = records.map((r) =>
    timeRecordLineItem(r, project.name, r.taskId ? (taskNameById.get(r.taskId.toString()) ?? null) : null)
  );
  const manualSubtotal = (data.manualItems ?? []).reduce((sum, item) => sum + item.amount, 0);

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
    currency: project.currency,
    period: computePeriodFromRecords(records),
    dueDate: data.dueDate ?? null,
    paymentTerms: data.paymentTerms ?? null,
    taxNote: data.taxNote ?? null,
    reconciled: false,
  });

  const lineSubtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  invoice.subtotal = Math.round((lineSubtotal + manualSubtotal) * 100) / 100;
  const { taxes, totalTax } = applyTaxRules(invoice.subtotal, data.taxRules ?? []);
  invoice.taxes = taxes as unknown as IInvoice['taxes'];
  invoice.totalTax = totalTax;
  invoice.total = Math.round((invoice.subtotal + totalTax) * 100) / 100;

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
    { invoiceNumber, type: 'personal', recordCount: records.length, total: invoice.total }
  );

  logger.info({ invoiceId: invoice._id, invoiceNumber, teamId }, 'Personal invoice created');
  return invoice;
}

// ---------------------------------------------------------------------------
// Add / remove a time record on a draft personal invoice (INV-5) — lets the
// owner adjust what they're billing before sending, without deleting and
// re-creating the whole draft.
// ---------------------------------------------------------------------------
export async function addTimeRecordToDraft(
  invoiceId: string,
  teamId: string,
  userId: string,
  timeRecordId: string
): Promise<IInvoice> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId, type: 'personal', createdBy: userId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }
  if (invoice.status !== 'draft') {
    throw AppError.badRequest('Only a draft invoice can be edited', 'NOT_DRAFT');
  }

  const record = await TimeRecord.findOne({
    _id: timeRecordId,
    userId,
    projectId: invoice.projectId,
    billable: true,
    invoiced: false,
    status: 'approved',
  });
  if (!record) {
    throw AppError.badRequest(
      'That time record is not eligible — it must be approved, billable, not already invoiced, and on the same project.',
      'NOT_ELIGIBLE'
    );
  }

  const [project, task] = await Promise.all([
    Project.findById(invoice.projectId),
    record.taskId ? Task.findById(record.taskId) : Promise.resolve(null),
  ]);
  invoice.lineItems.push(timeRecordLineItem(record, project?.name ?? 'Unknown project', task?.name ?? null));
  invoice.timeRecordIds.push(record._id);

  recalcTotals(invoice, invoice.taxes.map((t) => ({ name: t.name, rate: t.rate })));
  invoice.period = computePeriodFromRecords(await TimeRecord.find({ _id: { $in: invoice.timeRecordIds } }));
  await invoice.save();

  record.invoiced = true;
  record.invoiceId = invoice._id;
  await record.save();

  logger.info({ invoiceId, timeRecordId }, 'Time record added to draft invoice');
  return invoice;
}

export async function removeTimeRecordFromDraft(
  invoiceId: string,
  teamId: string,
  userId: string,
  timeRecordId: string
): Promise<IInvoice> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId, type: 'personal', createdBy: userId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }
  if (invoice.status !== 'draft') {
    throw AppError.badRequest('Only a draft invoice can be edited', 'NOT_DRAFT');
  }

  const wasIncluded = invoice.timeRecordIds.some((id) => id.toString() === timeRecordId);
  if (!wasIncluded) {
    throw AppError.badRequest('That time record is not part of this invoice', 'NOT_IN_INVOICE');
  }

  invoice.timeRecordIds = invoice.timeRecordIds.filter((id) => id.toString() !== timeRecordId) as typeof invoice.timeRecordIds;
  invoice.lineItems = invoice.lineItems.filter((li) => li.timeRecordId?.toString() !== timeRecordId) as typeof invoice.lineItems;

  if (invoice.lineItems.length === 0 && invoice.manualItems.length === 0) {
    throw AppError.badRequest(
      'An invoice needs at least one line item — delete the draft instead if you want to remove everything.',
      'EMPTY_INVOICE'
    );
  }

  recalcTotals(invoice, invoice.taxes.map((t) => ({ name: t.name, rate: t.rate })));
  invoice.period = computePeriodFromRecords(await TimeRecord.find({ _id: { $in: invoice.timeRecordIds } }));
  await invoice.save();

  await TimeRecord.updateOne(
    { _id: timeRecordId, invoiceId: invoice._id },
    { $set: { invoiced: false, invoiceId: null } }
  );

  logger.info({ invoiceId, timeRecordId }, 'Time record removed from draft invoice');
  return invoice;
}

// ---------------------------------------------------------------------------
// Create collective invoice (INV-11, INV-12, INV-13) — scoped to a CLIENT,
// spanning every project that client has, not a single project (INV-2).
// Only SENT personal invoices are eligible to pool: a draft is still
// editable by its owner, and pooling a moving target would let the
// collective invoice silently go stale.
// ---------------------------------------------------------------------------
export async function createCollectiveInvoice(
  managerId: string,
  teamId: string,
  data: CreateCollectiveInvoiceData
): Promise<IInvoice> {
  await requireCollectiveInvoicingProfile(managerId);

  const client = await Client.findOne({ _id: data.clientId, teamId });
  if (!client) {
    throw AppError.notFound('Client not found in this team');
  }

  // A collective invoice is built exclusively from sent personal invoices —
  // never directly from time records. Every user is expected to create and
  // send their own personal invoice first; that's the only way their time
  // enters a pool. (This intentionally departs from the original spec's
  // INV-13, which asked for a direct-inclusion escape hatch — product
  // direction has since ruled that out.)
  let personalInvoices: IInvoice[] = [];
  if (data.personalInvoiceIds && data.personalInvoiceIds.length > 0) {
    personalInvoices = await Invoice.find({
      _id: { $in: data.personalInvoiceIds },
      teamId,
      clientId: data.clientId,
      type: 'personal',
      status: 'sent',
      includedInCollectiveInvoiceId: null,
    });
  }

  if (personalInvoices.length === 0) {
    throw AppError.badRequest(
      'No sent personal invoices selected. Each team member must create and send their own personal invoice before it can be pooled.',
      'NO_ELIGIBLE_ITEMS'
    );
  }

  // Multi-currency consolidation is out of scope for now — reject rather
  // than silently mixing currencies in one total.
  const currencies = new Set(personalInvoices.map((pi) => pi.currency));
  if (currencies.size > 1) {
    throw AppError.badRequest(
      `Can't combine personal invoices in different currencies into one invoice yet (found ${[...currencies].join(', ')}).`,
      'MIXED_CURRENCY'
    );
  }
  const currency = [...currencies][0] as string;

  const invoiceNumber = formatInvoiceNumber(await getNextInvoiceNumber(teamId), new Date());

  const lineItems: ILineItem[] = personalInvoices.map(personalInvoiceLineItem);
  const allTimeRecordIds = personalInvoices.flatMap((pi) => pi.timeRecordIds);

  const invoice = new Invoice({
    invoiceNumber,
    type: 'collective',
    teamId,
    projectId: null,
    clientId: data.clientId,
    createdBy: managerId,
    status: 'draft',
    timeRecordIds: allTimeRecordIds,
    personalInvoiceIds: personalInvoices.map((pi) => pi._id),
    lineItems,
    manualItems: data.manualItems ?? [],
    notes: data.notes ?? null,
    currency,
    period: data.period,
    dueDate: data.dueDate ?? null,
    paymentTerms: data.paymentTerms ?? null,
    taxNote: data.taxNote ?? null,
    reconciled: false,
  });

  recalcCollectiveTotals(invoice);
  await invoice.save();

  await Invoice.updateMany(
    { _id: { $in: personalInvoices.map((pi) => pi._id) } },
    { $set: { includedInCollectiveInvoiceId: invoice._id } }
  );

  invoice.reconciled = true;
  await invoice.save();

  await auditService.log(
    'invoice_generated',
    'Invoice',
    invoice._id.toString(),
    teamId,
    managerId,
    { invoiceNumber, type: 'collective', total: invoice.total }
  );

  logger.info({ invoiceId: invoice._id, invoiceNumber, teamId }, 'Collective invoice created');
  return invoice;
}

// ---------------------------------------------------------------------------
// Add / remove a personal invoice from a draft collective invoice's pool —
// lets a manager adjust the pool before sending it.
// ---------------------------------------------------------------------------
export async function addPersonalInvoiceToPool(
  collectiveInvoiceId: string,
  personalInvoiceId: string,
  teamId: string
): Promise<IInvoice> {
  const collective = await Invoice.findOne({ _id: collectiveInvoiceId, teamId, type: 'collective' });
  if (!collective) {
    throw AppError.notFound('Collective invoice not found');
  }
  if (collective.status !== 'draft') {
    throw AppError.badRequest('Only a draft collective invoice can be edited', 'NOT_DRAFT');
  }

  const personal = await Invoice.findOne({
    _id: personalInvoiceId,
    teamId,
    clientId: collective.clientId,
    type: 'personal',
    status: 'sent',
    includedInCollectiveInvoiceId: null,
  });
  if (!personal) {
    throw AppError.badRequest(
      'That personal invoice is not eligible — it must be sent, for the same client, and not already pooled.',
      'NOT_ELIGIBLE'
    );
  }
  if (personal.currency !== collective.currency) {
    throw AppError.badRequest(
      `Currency mismatch: this invoice is in ${collective.currency}, that personal invoice is in ${personal.currency}.`,
      'MIXED_CURRENCY'
    );
  }

  collective.lineItems.push(personalInvoiceLineItem(personal));
  collective.personalInvoiceIds.push(personal._id);
  collective.timeRecordIds.push(...personal.timeRecordIds);
  recalcCollectiveTotals(collective);
  await collective.save();

  personal.includedInCollectiveInvoiceId = collective._id;
  await personal.save();

  logger.info({ collectiveInvoiceId, personalInvoiceId }, 'Personal invoice added to pool');
  return collective;
}

export async function removePersonalInvoiceFromPool(
  collectiveInvoiceId: string,
  personalInvoiceId: string,
  teamId: string
): Promise<IInvoice> {
  const collective = await Invoice.findOne({ _id: collectiveInvoiceId, teamId, type: 'collective' });
  if (!collective) {
    throw AppError.notFound('Collective invoice not found');
  }
  if (collective.status !== 'draft') {
    throw AppError.badRequest('Only a draft collective invoice can be edited', 'NOT_DRAFT');
  }

  const wasIncluded = collective.personalInvoiceIds.some((id) => id.toString() === personalInvoiceId);
  if (!wasIncluded) {
    throw AppError.badRequest('That personal invoice is not part of this pool', 'NOT_IN_POOL');
  }

  const personal = await Invoice.findOne({ _id: personalInvoiceId, teamId });
  const personalRecordIds = new Set((personal?.timeRecordIds ?? []).map((id) => id.toString()));

  collective.personalInvoiceIds = collective.personalInvoiceIds.filter(
    (id) => id.toString() !== personalInvoiceId
  ) as typeof collective.personalInvoiceIds;
  collective.lineItems = collective.lineItems.filter(
    (li) => li.personalInvoiceId?.toString() !== personalInvoiceId
  ) as typeof collective.lineItems;
  collective.timeRecordIds = collective.timeRecordIds.filter(
    (id) => !personalRecordIds.has(id.toString())
  ) as typeof collective.timeRecordIds;

  if (collective.lineItems.length === 0 && collective.manualItems.length === 0) {
    throw AppError.badRequest(
      'A collective invoice needs at least one line item — delete the draft instead if you want to remove everything.',
      'EMPTY_INVOICE'
    );
  }

  recalcCollectiveTotals(collective);
  await collective.save();

  if (personal) {
    personal.includedInCollectiveInvoiceId = null;
    await personal.save();
  }

  logger.info({ collectiveInvoiceId, personalInvoiceId }, 'Personal invoice removed from pool');
  return collective;
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
  if (data.dueDate !== undefined) invoice.dueDate = data.dueDate;
  if (data.paymentTerms !== undefined) invoice.paymentTerms = data.paymentTerms;
  if (data.taxNote !== undefined) invoice.taxNote = data.taxNote;
  if (data.manualItems !== undefined) {
    invoice.manualItems = data.manualItems as unknown as IInvoice['manualItems'];
  }
  if (invoice.type === 'personal') {
    if (data.manualItems !== undefined || data.taxRules !== undefined) {
      const taxRules = data.taxRules ?? invoice.taxes.map((t) => ({ name: t.name, rate: t.rate }));
      recalcTotals(invoice, taxRules);
    }
  } else if (data.manualItems !== undefined) {
    // A collective invoice has no tax rate of its own — taxRules on the
    // request is ignored here; each line item already carries the rate its
    // owner charged.
    recalcCollectiveTotals(invoice);
  }

  await invoice.save();

  logger.info({ invoiceId }, 'Invoice draft updated');
  return invoice;
}

// ---------------------------------------------------------------------------
// Delete draft — reverse two-phase (INV-14), and release any pooled
// personal invoices back to their own "sent" state.
// ---------------------------------------------------------------------------
export async function deleteDraft(invoiceId: string, teamId: string): Promise<void> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }

  if (invoice.status !== 'draft') {
    throw AppError.badRequest('Only draft invoices can be deleted', 'NOT_DRAFT');
  }

  // Unmark directly-attached time records. For a collective invoice this
  // naturally skips records that actually belong to a pooled personal
  // invoice, since their `invoiceId` points at that personal invoice, not
  // at this one.
  for (const recordId of invoice.timeRecordIds) {
    await TimeRecord.updateOne(
      { _id: recordId, invoiceId: invoice._id },
      { $set: { invoiced: false, invoiceId: null } }
    );
  }

  if (invoice.personalInvoiceIds.length > 0) {
    await Invoice.updateMany(
      { _id: { $in: invoice.personalInvoiceIds }, includedInCollectiveInvoiceId: invoice._id },
      { $set: { includedInCollectiveInvoiceId: null } }
    );
  }

  await Invoice.deleteOne({ _id: invoiceId });

  logger.info({ invoiceId }, 'Draft invoice deleted, time records unmarked, pooled personal invoices released');
}

// ---------------------------------------------------------------------------
// Send invoice (INV-16)
// ---------------------------------------------------------------------------
export async function sendInvoice(
  invoiceId: string,
  teamId: string,
  actorId: string,
  isManager: boolean
): Promise<IInvoice> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }

  if (invoice.status !== 'draft') {
    throw AppError.badRequest('Only draft invoices can be sent', 'NOT_DRAFT');
  }

  // A personal invoice is sent by its own owner; a collective (pool) invoice
  // represents the team's transmission to the client and is a manager action.
  if (invoice.type === 'collective' && !isManager) {
    throw AppError.forbidden('Only a manager can send a collective invoice');
  }
  if (invoice.type === 'personal' && invoice.createdBy.toString() !== actorId && !isManager) {
    throw AppError.forbidden('You can only send your own personal invoice');
  }

  invoice.status = 'sent';
  await invoice.save();

  logger.info({ invoiceId }, 'Invoice sent');
  return invoice;
}

// ---------------------------------------------------------------------------
// Revert a sent personal invoice back to draft — lets its owner (or a
// manager, mirroring who can send it) fix a mistake without deleting and
// re-creating the whole thing. Blocked once it's been pulled into a
// collective invoice's pool, since that invoice is now relying on this
// one's sent, immutable state.
// ---------------------------------------------------------------------------
export async function revertPersonalInvoiceToDraft(
  invoiceId: string,
  teamId: string,
  actorId: string,
  isManager: boolean
): Promise<IInvoice> {
  const invoice = await Invoice.findOne({ _id: invoiceId, teamId });
  if (!invoice) {
    throw AppError.notFound('Invoice not found');
  }

  if (invoice.type !== 'personal') {
    throw AppError.badRequest('Only a personal invoice can be reverted to draft this way', 'NOT_PERSONAL');
  }

  if (invoice.status !== 'sent') {
    throw AppError.badRequest(`Only a sent invoice can be reverted to draft (current status: '${invoice.status}')`, 'NOT_SENT');
  }

  if (invoice.createdBy.toString() !== actorId && !isManager) {
    throw AppError.forbidden('You can only revert your own personal invoice');
  }

  if (invoice.includedInCollectiveInvoiceId) {
    throw AppError.badRequest(
      'This invoice is part of a collective invoice and cannot be reverted to draft',
      'IN_COLLECTIVE_POOL'
    );
  }

  invoice.status = 'draft';
  await invoice.save();

  logger.info({ invoiceId }, 'Personal invoice reverted to draft');
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
  options: {
    type?: 'personal' | 'collective';
    status?: InvoiceStatus;
    projectId?: string;
    clientId?: string;
    createdBy?: string;
    unpooled?: boolean;
  } = {}
): Promise<IInvoice[]> {
  const filter: Record<string, unknown> = { teamId };
  if (options.type) filter.type = options.type;
  if (options.status) filter.status = options.status;
  if (options.projectId) filter.projectId = options.projectId;
  if (options.clientId) filter.clientId = options.clientId;
  if (options.createdBy) filter.createdBy = options.createdBy;
  if (options.unpooled) filter.includedInCollectiveInvoiceId = null;

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

  const unreconciled = await Invoice.find({ reconciled: false });

  for (const invoice of unreconciled) {
    const ageMs = Date.now() - invoice.createdAt.getTime();
    const isStale = ageMs > 60 * 60 * 1000;

    const markedCount = await TimeRecord.countDocuments({
      _id: { $in: invoice.timeRecordIds },
      invoiceId: invoice._id,
      invoiced: true,
    });

    if (markedCount === invoice.timeRecordIds.length) {
      invoice.reconciled = true;
      await invoice.save();
      fixed++;
    } else if (markedCount === 0 && isStale) {
      await Invoice.deleteOne({ _id: invoice._id });
      cleaned++;
    } else {
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
