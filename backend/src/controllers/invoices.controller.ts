import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as invoiceService from '../services/invoice.service.js';
import { Client } from '../models/Client.js';
import { User } from '../models/User.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { TeamRequest } from '../middleware/accessControl.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const manualItemSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number(),
});

const createPersonalSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  timeRecordIds: z.array(z.string()).min(1, 'At least one time record is required'),
  notes: z.string().max(5000).nullable().optional(),
  manualItems: z.array(manualItemSchema).optional(),
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
});

const updateDraftSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
  manualItems: z.array(manualItemSchema).optional(),
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
async function resolveHeaderDetails(clientId: unknown, createdBy: unknown) {
  const [client, preparer] = await Promise.all([
    Client.findById(clientId),
    User.findById(createdBy),
  ]);
  return {
    clientName: client?.name ?? 'Unknown client',
    clientAddress: client?.billingAddress ?? null,
    clientContact: client?.billingContact ?? null,
    clientEmail: client?.billingEmail ?? null,
    preparerName: preparer ? `${preparer.firstName} ${preparer.lastName}` : 'Unknown',
  };
}

// GET /teams/:teamId/invoices/:invoiceId/csv
export async function exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.getInvoiceById(
      req.params.invoiceId as string,
      teamReq.team.teamId
    );
    const { clientName, preparerName } = await resolveHeaderDetails(invoice.clientId, invoice.createdBy);

    const { stringify } = await import('csv-stringify/sync');
    const header = [
      { Description: `Invoice #${invoice.invoiceNumber}`, Hours: '', Rate: '', Amount: '' },
      { Description: `Client: ${clientName}`, Hours: '', Rate: '', Amount: '' },
      { Description: `Prepared by: ${preparerName}`, Hours: '', Rate: '', Amount: '' },
      ...(invoice.period
        ? [{
            Description: `Period: ${invoice.period.startDate.toISOString().slice(0, 10)} – ${invoice.period.endDate.toISOString().slice(0, 10)}`,
            Hours: '',
            Rate: '',
            Amount: '',
          }]
        : []),
      { Description: '', Hours: '', Rate: '', Amount: '' },
    ];
    const rows = invoice.lineItems.map((item) => ({
      Description: item.description,
      Hours: item.hours,
      Rate: item.rate,
      Amount: item.amount,
    }));

    for (const item of invoice.manualItems) {
      rows.push({
        Description: item.description,
        Hours: 0,
        Rate: 0,
        Amount: item.amount,
      });
    }

    const csv = stringify([...header, ...rows], { header: true });

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
    const { clientName, clientAddress, clientContact, clientEmail, preparerName } = await resolveHeaderDetails(
      invoice.clientId,
      invoice.createdBy
    );

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    doc.pipe(res);

    // Header — right column: invoice metadata; left column: bill-to / prepared-by
    doc.fontSize(24).text('INVOICE', 300, 50, { width: 245, align: 'right' });
    doc.fontSize(10);
    doc.text(`#${invoice.invoiceNumber}`, 300, 80, { width: 245, align: 'right' });
    doc.text(`Date: ${invoice.createdAt.toISOString().slice(0, 10)}`, 300, 94, { width: 245, align: 'right' });
    doc.text(`Status: ${invoice.status.toUpperCase()}`, 300, 108, { width: 245, align: 'right' });
    if (invoice.period) {
      const periodText = `Period: ${invoice.period.startDate.toISOString().slice(0, 10)} – ${invoice.period.endDate.toISOString().slice(0, 10)}`;
      doc.text(periodText, 300, 122, { width: 245, align: 'right' });
    }

    let leftY = 50;
    doc.font('Helvetica-Bold').fontSize(11).text('Bill to', 50, leftY, { width: 240 });
    leftY += 16;
    doc.font('Helvetica').fontSize(10);
    for (const line of [
      clientName,
      clientContact,
      clientAddress?.line1,
      clientAddress?.line2,
      clientAddress ? `${clientAddress.city}, ${clientAddress.state} ${clientAddress.postalCode}` : undefined,
      clientAddress?.country,
      clientEmail,
    ]) {
      if (!line) continue;
      doc.text(line, 50, leftY, { width: 240 });
      leftY += 14;
    }
    leftY += 6;
    doc.font('Helvetica-Bold').fontSize(11).text('Prepared by', 50, leftY, { width: 240 });
    leftY += 16;
    doc.font('Helvetica').fontSize(10).text(preparerName, 50, leftY, { width: 240 });

    doc.y = Math.max(leftY + 14, invoice.period ? 144 : 130);
    doc.moveDown(1.5);

    // Line items table
    doc.fontSize(12).font('Helvetica-Bold').text('Line Items', { underline: true });
    doc.font('Helvetica').moveDown(0.5);

    doc.fontSize(9);
    const tableTop = doc.y;
    doc.text('Description', 50, tableTop);
    doc.text('Hours', 300, tableTop, { width: 60, align: 'right' });
    doc.text('Rate', 370, tableTop, { width: 60, align: 'right' });
    doc.text('Amount', 440, tableTop, { width: 80, align: 'right' });

    doc.moveTo(50, tableTop + 15).lineTo(520, tableTop + 15).stroke();

    let y = tableTop + 20;
    for (const item of invoice.lineItems) {
      doc.text(item.description, 50, y, { width: 240 });
      doc.text(item.hours.toFixed(2), 300, y, { width: 60, align: 'right' });
      doc.text(item.rate.toFixed(2), 370, y, { width: 60, align: 'right' });
      doc.text(item.amount.toFixed(2), 440, y, { width: 80, align: 'right' });
      y += 18;
    }

    // Manual items
    for (const item of invoice.manualItems) {
      doc.text(item.description, 50, y, { width: 240 });
      doc.text('', 300, y, { width: 60 });
      doc.text('', 370, y, { width: 60 });
      doc.text(item.amount.toFixed(2), 440, y, { width: 80, align: 'right' });
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

    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Total:', 300, y, { width: 130, align: 'right' });
    doc.text(`${invoice.currency} ${invoice.total.toFixed(2)}`, 440, y, { width: 80, align: 'right' });

    // Notes
    if (invoice.notes) {
      doc.moveDown(3);
      doc.font('Helvetica').fontSize(10);
      doc.text('Notes:', { underline: true });
      doc.text(invoice.notes);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}
