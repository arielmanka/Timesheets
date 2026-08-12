import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import * as invoiceService from '../services/invoice.service.js';
import { Client } from '../models/Client.js';
import { User } from '../models/User.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { TeamRequest } from '../middleware/accessControl.js';
import { AppError } from '../utils/errors.js';
import type { IBankAccountDetails } from '../models/shared/bankAccount.js';

// PDFKit's built-in Helvetica/Times/Courier fonts only support WinAnsi
// encoding (~Latin-1) — Polish and other Latin-Extended-A characters (ą, ć,
// ę, ł, ń, ó, ś, ź, ż, …) render as garbage. DejaVu Sans has full Unicode
// coverage and is embedded directly in the exported PDF.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.join(__dirname, '../assets/fonts/DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, '../assets/fonts/DejaVuSans-Bold.ttf');

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const manualItemSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number(),
});

const taxRuleSchema = z.object({
  name: z.string().min(1).max(50),
  rate: z.number().min(0).max(100),
});

const createPersonalSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  timeRecordIds: z.array(z.string()).min(1, 'At least one time record is required'),
  notes: z.string().max(5000).nullable().optional(),
  manualItems: z.array(manualItemSchema).optional(),
  taxRules: z.array(taxRuleSchema).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  paymentTerms: z.string().max(200).nullable().optional(),
  taxNote: z.string().max(500).nullable().optional(),
});

const createCollectiveSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  period: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }),
  personalInvoiceIds: z.array(z.string()).optional(),
  notes: z.string().max(5000).nullable().optional(),
  manualItems: z.array(manualItemSchema).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  paymentTerms: z.string().max(200).nullable().optional(),
  taxNote: z.string().max(500).nullable().optional(),
});

const updateDraftSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
  manualItems: z.array(manualItemSchema).optional(),
  taxRules: z.array(taxRuleSchema).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  paymentTerms: z.string().max(200).nullable().optional(),
  taxNote: z.string().max(500).nullable().optional(),
});

const recordPaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  date: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// POST /teams/:teamId/invoices
export async function createPersonal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createPersonalSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;

    const invoice = await invoiceService.createPersonalInvoice(
      authReq.user.userId,
      teamReq.team.teamId,
      data
    );
    res.status(201).json({ invoice });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// POST /teams/:teamId/invoices/:invoiceId/time-records
export async function addTimeRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { timeRecordId } = z.object({ timeRecordId: z.string().min(1) }).parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;

    const invoice = await invoiceService.addTimeRecordToDraft(
      req.params.invoiceId as string,
      teamReq.team.teamId,
      authReq.user.userId,
      timeRecordId
    );
    res.json({ invoice });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// DELETE /teams/:teamId/invoices/:invoiceId/time-records/:recordId
export async function removeTimeRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;

    const invoice = await invoiceService.removeTimeRecordFromDraft(
      req.params.invoiceId as string,
      teamReq.team.teamId,
      authReq.user.userId,
      req.params.recordId as string
    );
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

// POST /teams/:teamId/invoices/collective
export async function createCollective(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createCollectiveSchema.parse(req.body);
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;

    const invoice = await invoiceService.createCollectiveInvoice(
      authReq.user.userId,
      teamReq.team.teamId,
      data
    );
    res.status(201).json({ invoice });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// POST /teams/:teamId/invoices/:invoiceId/pool/:personalInvoiceId
export async function addToPool(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.addPersonalInvoiceToPool(
      req.params.invoiceId as string,
      req.params.personalInvoiceId as string,
      teamReq.team.teamId
    );
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

// DELETE /teams/:teamId/invoices/:invoiceId/pool/:personalInvoiceId
export async function removeFromPool(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.removePersonalInvoiceFromPool(
      req.params.invoiceId as string,
      req.params.personalInvoiceId as string,
      teamReq.team.teamId
    );
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/invoices
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const options: Record<string, string | boolean> = {};
    if (req.query.type) options.type = req.query.type as string;
    if (req.query.status) options.status = req.query.status as string;
    if (req.query.projectId) options.projectId = req.query.projectId as string;
    if (req.query.clientId) options.clientId = req.query.clientId as string;
    if (req.query.createdBy) options.createdBy = req.query.createdBy as string;
    if (req.query.unpooled !== undefined) options.unpooled = req.query.unpooled === 'true';

    const invoices = await invoiceService.listInvoices(teamReq.team.teamId, options as any);
    res.json({ invoices });
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/invoices/:invoiceId
export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.getInvoiceById(
      req.params.invoiceId as string,
      teamReq.team.teamId
    );
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

// PATCH /teams/:teamId/invoices/:invoiceId
export async function updateDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateDraftSchema.parse(req.body);
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.updateDraft(
      req.params.invoiceId as string,
      teamReq.team.teamId,
      data
    );
    res.json({ invoice });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// DELETE /teams/:teamId/invoices/:invoiceId
export async function deleteDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    await invoiceService.deleteDraft(
      req.params.invoiceId as string,
      teamReq.team.teamId
    );
    res.json({ message: 'Draft invoice deleted' });
  } catch (err) {
    next(err);
  }
}

// POST /teams/:teamId/invoices/:invoiceId/send
export async function send(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.sendInvoice(
      req.params.invoiceId as string,
      teamReq.team.teamId,
      authReq.user.userId,
      teamReq.team.role === 'manager'
    );
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

// POST /teams/:teamId/invoices/:invoiceId/revert-to-draft
export async function revertToDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.revertPersonalInvoiceToDraft(
      req.params.invoiceId as string,
      teamReq.team.teamId,
      authReq.user.userId,
      teamReq.team.role === 'manager'
    );
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

// POST /teams/:teamId/invoices/:invoiceId/payment
export async function recordPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = recordPaymentSchema.parse(req.body);
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.recordPayment(
      req.params.invoiceId as string,
      teamReq.team.teamId,
      data.amount,
      data.date
    );
    res.json({ invoice });
  } catch (err) {
    next(err instanceof z.ZodError ? AppError.badRequest(err.errors[0].message, 'VALIDATION_ERROR') : err);
  }
}

// ---------------------------------------------------------------------------
// Shared: resolve the client + preparer details invoice documents themselves
// don't carry, for the header block on exports.
// ---------------------------------------------------------------------------
async function resolveHeaderDetails(clientId: unknown, createdBy: unknown, invoiceType: 'personal' | 'collective') {
  const [client, preparer] = await Promise.all([
    Client.findById(clientId),
    User.findById(createdBy),
  ]);
  return {
    clientName: client?.name ?? 'Unknown client',
    clientAddress: client?.billingAddress ?? null,
    clientContact: client?.billingContact ?? null,
    clientEmail: client?.billingEmail ?? null,
    clientTaxId: client?.taxId ?? null,
    preparerName: preparer ? `${preparer.firstName} ${preparer.lastName}` : 'Unknown',
    // Only a contractor with a complete profile gets a "from" company block —
    // an employee's invoice simply has no incorporation section.
    preparerIncorporation:
      preparer?.employmentType === 'contractor' && preparer.incorporation ? preparer.incorporation : null,
    preparerPhone: preparer?.incorporation?.phone ?? null,
    // A personal invoice is paid into the preparer's own account; a
    // collective invoice — issued by a manager on the team's behalf — is
    // paid into that manager's separate collective account.
    preparerBankAccount:
      (invoiceType === 'collective' ? preparer?.collectiveBankAccount : preparer?.personalBankAccount) ?? null,
  };
}

// Renders a bank account as printable lines — IBAN/SWIFT for EU accounts,
// routing+account for North American ones, otherDetails as a free-text
// fallback — whichever of those the account actually has set.
function formatBankAccountLines(account: IBankAccountDetails | null): string[] {
  if (!account) return [];
  const lines = [`${account.accountHolderName} — ${account.bankName} (${account.country})`];
  if (account.iban) lines.push(`IBAN: ${account.iban}`);
  if (account.swiftBic) lines.push(`SWIFT/BIC: ${account.swiftBic}`);
  if (account.routingNumber) lines.push(`Routing number: ${account.routingNumber}`);
  if (account.accountNumber) lines.push(`Account number: ${account.accountNumber}`);
  if (account.otherDetails) lines.push(account.otherDetails);
  return lines;
}

// GET /teams/:teamId/invoices/:invoiceId/csv
export async function exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.getInvoiceById(
      req.params.invoiceId as string,
      teamReq.team.teamId
    );
    const { clientName, clientTaxId, preparerName, preparerIncorporation, preparerPhone, preparerBankAccount } =
      await resolveHeaderDetails(invoice.clientId, invoice.createdBy, invoice.type);

    const { stringify } = await import('csv-stringify/sync');

    // A collective invoice has no tax rate of its own — each line item is a
    // pooled personal invoice, at that person's own VAT rate — so it gets
    // VAT/Net/Gross columns instead of the personal invoice's Rate/Amount.
    const isCollective = invoice.type === 'collective';
    const blankRow = isCollective
      ? { Description: '', Units: '', VAT: '', Net: '', Gross: '' }
      : { Description: '', Units: '', Rate: '', Amount: '' };
    const metaRow = (description: string) => ({ ...blankRow, Description: description });

    const header = [
      metaRow(`Invoice #${invoice.invoiceNumber}`),
      metaRow(`Client: ${clientName}`),
      ...(clientTaxId ? [metaRow(`Client Tax ID: ${clientTaxId}`)] : []),
      metaRow(`Prepared by: ${preparerName}`),
      ...(preparerIncorporation
        ? [metaRow(`From: ${preparerIncorporation.companyName}`), metaRow(`Tax ID: ${preparerIncorporation.taxId}`)]
        : []),
      ...(preparerPhone ? [metaRow(`Phone: ${preparerPhone}`)] : []),
      ...(invoice.period
        ? [
            metaRow(
              `Period: ${invoice.period.startDate.toISOString().slice(0, 10)} – ${invoice.period.endDate.toISOString().slice(0, 10)}`
            ),
          ]
        : []),
      ...(invoice.dueDate ? [metaRow(`Due date: ${invoice.dueDate.toISOString().slice(0, 10)}`)] : []),
      ...(invoice.paymentTerms ? [metaRow(`Payment terms: ${invoice.paymentTerms}`)] : []),
      ...(invoice.taxNote ? [metaRow(invoice.taxNote)] : []),
      ...(preparerBankAccount ? [metaRow('Payment details:'), ...formatBankAccountLines(preparerBankAccount).map(metaRow)] : []),
      blankRow,
    ];
    const rows = invoice.lineItems.map((item) =>
      isCollective
        ? {
            Description: item.description,
            Units: item.hours,
            VAT: `${item.taxRate ?? 0}%`,
            Net: item.netAmount ?? item.amount,
            Gross: item.amount,
          }
        : { Description: item.description, Units: item.hours, Rate: item.rate, Amount: item.amount }
    );

    for (const item of invoice.manualItems) {
      rows.push(
        isCollective
          ? { Description: item.description, Units: 0, VAT: '', Net: item.amount, Gross: item.amount }
          : { Description: item.description, Units: 0, Rate: 0, Amount: item.amount }
      );
    }

    // Subtotal/tax(es)/total — every tax entry is listed unconditionally,
    // including a 0% one (e.g. a reverse-charge or exempt invoice still
    // needs the rate on record, not just silently no line at all).
    const summaryRow = (label: string, amount: number) =>
      isCollective ? { ...blankRow, Description: label, Gross: amount } : { ...blankRow, Description: label, Amount: amount };
    const summaryRows = [
      blankRow,
      summaryRow('Subtotal', invoice.subtotal),
      ...invoice.taxes.map((tax) => summaryRow(`${tax.name} (${tax.rate}%)`, tax.amount)),
      summaryRow('Total', invoice.total),
    ];

    const csv = stringify([...header, ...rows, ...summaryRows], { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/invoices/:invoiceId/pdf
export async function exportPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.getInvoiceById(
      req.params.invoiceId as string,
      teamReq.team.teamId
    );
    const {
      clientName,
      clientAddress,
      clientContact,
      clientEmail,
      clientTaxId,
      preparerName,
      preparerIncorporation,
      preparerPhone,
      preparerBankAccount,
    } = await resolveHeaderDetails(invoice.clientId, invoice.createdBy, invoice.type);

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 50 });
    doc.registerFont('Body', FONT_REGULAR);
    doc.registerFont('Body-Bold', FONT_BOLD);
    doc.font('Body');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    doc.pipe(res);

    // Header — right column: invoice metadata; left column: bill-to / prepared-by
    doc.fontSize(24).text('INVOICE', 300, 50, { width: 245, align: 'right' });
    doc.fontSize(10);
    let rightY = 80;
    doc.text(`#${invoice.invoiceNumber}`, 300, rightY, { width: 245, align: 'right' });
    rightY += 14;
    doc.text(`Date: ${invoice.createdAt.toISOString().slice(0, 10)}`, 300, rightY, { width: 245, align: 'right' });
    rightY += 14;
    doc.text(`Status: ${invoice.status.toUpperCase()}`, 300, rightY, { width: 245, align: 'right' });
    rightY += 14;
    if (invoice.period) {
      const periodText = `Period: ${invoice.period.startDate.toISOString().slice(0, 10)} – ${invoice.period.endDate.toISOString().slice(0, 10)}`;
      doc.text(periodText, 300, rightY, { width: 245, align: 'right' });
      rightY += 14;
    }

    // Payment details — moved above the line items table, right-justified,
    // directly below Period, so the client sees how to pay before the
    // itemized breakdown rather than after the totals at the bottom.
    if (preparerBankAccount) {
      rightY += 6;
      doc.font('Body-Bold').text('Payment details', 300, rightY, { width: 245, align: 'right' });
      rightY += 14;
      doc.font('Body');
      for (const line of formatBankAccountLines(preparerBankAccount)) {
        doc.text(line, 300, rightY, { width: 245, align: 'right' });
        rightY += 14;
      }
      rightY += 6;
    }

    if (invoice.dueDate) {
      doc.text(`Due date: ${invoice.dueDate.toISOString().slice(0, 10)}`, 300, rightY, { width: 245, align: 'right' });
      rightY += 14;
    }
    if (invoice.paymentTerms) {
      doc.text(`Payment terms: ${invoice.paymentTerms}`, 300, rightY, { width: 245, align: 'right' });
      rightY += 14;
    }

    let leftY = 50;
    doc.font('Body-Bold').fontSize(11).text('Bill to', 50, leftY, { width: 240 });
    leftY += 16;
    doc.font('Body').fontSize(10);
    for (const line of [
      clientName,
      clientContact,
      clientAddress?.line1,
      clientAddress?.line2,
      clientAddress ? `${clientAddress.city}, ${clientAddress.state} ${clientAddress.postalCode}` : undefined,
      clientAddress?.country,
      clientEmail,
      clientTaxId ? `Tax ID: ${clientTaxId}` : undefined,
    ]) {
      if (!line) continue;
      doc.text(line, 50, leftY, { width: 240 });
      leftY += 14;
    }
    leftY += 6;
    doc.font('Body-Bold').fontSize(11).text('Prepared by', 50, leftY, { width: 240 });
    leftY += 16;
    doc.font('Body').fontSize(10);
    doc.text(preparerName, 50, leftY, { width: 240 });
    leftY += 14;

    if (preparerIncorporation) {
      const addr = preparerIncorporation.address;
      for (const line of [
        preparerIncorporation.companyName,
        addr.line1,
        addr.line2,
        `${addr.city}, ${addr.state} ${addr.postalCode}`,
        addr.country,
        `Tax ID: ${preparerIncorporation.taxId}`,
        preparerPhone ? `Phone: ${preparerPhone}` : undefined,
      ]) {
        if (!line) continue;
        doc.text(line, 50, leftY, { width: 240 });
        leftY += 14;
      }
    }

    doc.y = Math.max(leftY + 10, rightY + 10);
    doc.moveDown(1.5);

    // Line items table
    doc.fontSize(12).font('Body-Bold').text('Line Items', { underline: true });
    doc.font('Body').moveDown(0.5);

    // A collective invoice has no tax rate of its own — each line item is a
    // pooled personal invoice at that person's own VAT rate — so it gets
    // VAT/Net/Gross columns instead of the personal invoice's Rate/Amount.
    const isCollective = invoice.type === 'collective';

    doc.fontSize(9);
    const tableTop = doc.y;
    doc.text('Description', 50, tableTop);
    doc.text('Units', isCollective ? 250 : 300, tableTop, { width: 50, align: 'right' });
    if (isCollective) {
      doc.text('VAT', 310, tableTop, { width: 50, align: 'right' });
      doc.text('Net', 370, tableTop, { width: 70, align: 'right' });
      doc.text('Gross', 450, tableTop, { width: 70, align: 'right' });
    } else {
      doc.text('Rate', 370, tableTop, { width: 60, align: 'right' });
      doc.text('Amount', 440, tableTop, { width: 80, align: 'right' });
    }

    doc.moveTo(50, tableTop + 15).lineTo(520, tableTop + 15).stroke();

    let y = tableTop + 20;
    for (const item of invoice.lineItems) {
      doc.text(item.description, 50, y, { width: isCollective ? 190 : 240 });
      doc.text(item.hours.toFixed(2), isCollective ? 250 : 300, y, { width: 50, align: 'right' });
      if (isCollective) {
        doc.text(`${item.taxRate ?? 0}%`, 310, y, { width: 50, align: 'right' });
        doc.text((item.netAmount ?? item.amount).toFixed(2), 370, y, { width: 70, align: 'right' });
        doc.text(item.amount.toFixed(2), 450, y, { width: 70, align: 'right' });
      } else {
        doc.text(item.rate.toFixed(2), 370, y, { width: 60, align: 'right' });
        doc.text(item.amount.toFixed(2), 440, y, { width: 80, align: 'right' });
      }
      y += 18;
    }

    // Manual items
    for (const item of invoice.manualItems) {
      doc.text(item.description, 50, y, { width: isCollective ? 190 : 240 });
      if (isCollective) {
        doc.text(item.amount.toFixed(2), 450, y, { width: 70, align: 'right' });
      } else {
        doc.text(item.amount.toFixed(2), 440, y, { width: 80, align: 'right' });
      }
      y += 18;
    }

    // Totals
    y += 10;
    doc.moveTo(300, y).lineTo(520, y).stroke();
    y += 8;
    doc.fontSize(10);
    doc.text('Subtotal:', 300, y, { width: 130, align: 'right' });
    doc.text(`${invoice.currency} ${invoice.subtotal.toFixed(2)}`, 440, y, { width: 80, align: 'right' });
    y += 18;

    for (const tax of invoice.taxes) {
      doc.text(`${tax.name} (${tax.rate}%):`, 300, y, { width: 130, align: 'right' });
      doc.text(`${invoice.currency} ${tax.amount.toFixed(2)}`, 440, y, { width: 80, align: 'right' });
      y += 18;
    }

    doc.fontSize(12).font('Body-Bold');
    doc.text('Total:', 300, y, { width: 130, align: 'right' });
    doc.text(`${invoice.currency} ${invoice.total.toFixed(2)}`, 440, y, { width: 80, align: 'right' });

    // Reverse-charge / exemption legal mention — required text for exempt
    // or intra-EU reverse-charge transactions, printed prominently near the
    // totals rather than buried in the notes.
    if (invoice.taxNote) {
      doc.y = y + 30;
      doc.font('Body-Bold').fontSize(10).text(invoice.taxNote, 50, doc.y, { width: 470 });
    }

    // Notes
    if (invoice.notes) {
      doc.moveDown(1.5);
      doc.font('Body').fontSize(10);
      doc.text('Notes:', { underline: true });
      doc.text(invoice.notes);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}
