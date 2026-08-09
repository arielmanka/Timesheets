import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as invoiceService from '../services/invoice.service.js';
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
  projectId: z.string().min(1, 'Project ID is required'),
  period: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }),
  personalInvoiceIds: z.array(z.string()).optional(),
  includeRemainingRecords: z.boolean().optional(),
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

// GET /teams/:teamId/invoices
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const options: Record<string, string> = {};
    if (req.query.status) options.status = req.query.status as string;
    if (req.query.projectId) options.projectId = req.query.projectId as string;
    if (req.query.createdBy) options.createdBy = req.query.createdBy as string;

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
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.sendInvoice(
      req.params.invoiceId as string,
      teamReq.team.teamId
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

// GET /teams/:teamId/invoices/:invoiceId/csv
export async function exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teamReq = req as unknown as TeamRequest;
    const invoice = await invoiceService.getInvoiceById(
      req.params.invoiceId as string,
      teamReq.team.teamId
    );

    // Build CSV from line items
    const { stringify } = await import('csv-stringify/sync');
    const rows = invoice.lineItems.map((item) => ({
      Description: item.description,
      Hours: item.hours,
      Rate: item.rate,
      Amount: item.amount,
    }));

    // Add manual items
    for (const item of invoice.manualItems) {
      rows.push({
        Description: item.description,
        Hours: 0,
        Rate: 0,
        Amount: item.amount,
      });
    }

    const csv = stringify(rows, { header: true });

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

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(24).text('INVOICE', { align: 'right' });
    doc.fontSize(10).text(`#${invoice.invoiceNumber}`, { align: 'right' });
    doc.text(`Date: ${invoice.createdAt.toISOString().slice(0, 10)}`, { align: 'right' });
    doc.text(`Status: ${invoice.status.toUpperCase()}`, { align: 'right' });
    doc.moveDown(2);

    // Line items table
    doc.fontSize(12).text('Line Items', { underline: true });
    doc.moveDown(0.5);

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
