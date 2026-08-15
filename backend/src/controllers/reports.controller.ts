import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as reportService from '../services/report.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { TeamRequest } from '../middleware/accessControl.js';
import { AppError } from '../utils/errors.js';

// See invoices.controller.ts — PDFKit's built-in fonts don't cover Polish
// (or other Latin-Extended-A) characters; DejaVu Sans is embedded instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.join(__dirname, '../assets/fonts/DejaVuSans.ttf');

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// GET /teams/:teamId/reports/summary
export async function summary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const filter: reportService.ReportFilter = {
      teamId: teamReq.team.teamId,
    };

    if (req.query.startDate) filter.startDate = new Date(req.query.startDate as string);
    if (req.query.endDate) filter.endDate = new Date(req.query.endDate as string);
    if (req.query.userId) filter.userId = req.query.userId as string;
    if (req.query.projectId) filter.projectId = req.query.projectId as string;
    if (req.query.clientId) filter.clientId = req.query.clientId as string;
    if (req.query.taskId) filter.taskId = req.query.taskId as string;
    if (req.query.status) filter.status = req.query.status as reportService.ReportFilter['status'];

    const result = await reportService.getSummary(filter, isManager, authReq.user.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/reports/trend
const TREND_GROUP_BY_VALUES = ['client', 'project', 'task', 'user'] as const;

export async function trend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const groupBy = req.query.groupBy as string | undefined;
    if (!groupBy || !TREND_GROUP_BY_VALUES.includes(groupBy as (typeof TREND_GROUP_BY_VALUES)[number])) {
      throw AppError.badRequest(
        `groupBy must be one of: ${TREND_GROUP_BY_VALUES.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    const filter: reportService.ReportFilter = {
      teamId: teamReq.team.teamId,
    };

    if (req.query.startDate) filter.startDate = new Date(req.query.startDate as string);
    if (req.query.endDate) filter.endDate = new Date(req.query.endDate as string);
    if (req.query.userId) filter.userId = req.query.userId as string;
    if (req.query.projectId) filter.projectId = req.query.projectId as string;
    if (req.query.clientId) filter.clientId = req.query.clientId as string;
    if (req.query.taskId) filter.taskId = req.query.taskId as string;
    if (req.query.status) filter.status = req.query.status as reportService.ReportFilter['status'];

    const result = await reportService.getTrend(
      filter,
      groupBy as reportService.TrendGroupBy,
      isManager,
      authReq.user.userId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/reports/export/csv
export async function exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const filter: reportService.ReportFilter = {
      teamId: teamReq.team.teamId,
    };

    if (req.query.startDate) filter.startDate = new Date(req.query.startDate as string);
    if (req.query.endDate) filter.endDate = new Date(req.query.endDate as string);
    if (req.query.userId) filter.userId = req.query.userId as string;
    if (req.query.projectId) filter.projectId = req.query.projectId as string;
    if (req.query.clientId) filter.clientId = req.query.clientId as string;
    if (req.query.taskId) filter.taskId = req.query.taskId as string;
    if (req.query.status) filter.status = req.query.status as reportService.ReportFilter['status'];

    const rows = await reportService.getExportData(filter, isManager, authReq.user.userId);

    const { stringify } = await import('csv-stringify/sync');
    const csv = stringify(rows, { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/reports/export/pdf
export async function exportPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const filter: reportService.ReportFilter = {
      teamId: teamReq.team.teamId,
    };

    if (req.query.startDate) filter.startDate = new Date(req.query.startDate as string);
    if (req.query.endDate) filter.endDate = new Date(req.query.endDate as string);
    if (req.query.userId) filter.userId = req.query.userId as string;
    if (req.query.projectId) filter.projectId = req.query.projectId as string;
    if (req.query.status) filter.status = req.query.status as reportService.ReportFilter['status'];

    const result = await reportService.getSummary(filter, isManager, authReq.user.userId);

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 50 });
    doc.registerFont('Body', FONT_REGULAR);
    doc.font('Body');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Time Report', { align: 'center' });
    doc.moveDown();

    // Summary — cost is broken out per currency rather than summed
    // together, since different projects can bill in different currencies.
    doc.fontSize(12);
    doc.text(`Total Hours: ${result.totalHours}`);
    for (const c of result.costByCurrency) {
      doc.text(`Total Cost (${c.currency}): ${c.totalCost.toFixed(2)}`);
    }
    doc.moveDown();

    // By Project
    doc.fontSize(14).text('By Project', { underline: true });
    doc.fontSize(10);
    for (const entry of result.byProject) {
      doc.text(`  ${entry.projectName}: ${entry.hours}h — ${entry.currency} ${entry.cost.toFixed(2)}`);
    }
    doc.moveDown();

    // By Task
    doc.fontSize(14).text('By Task', { underline: true });
    doc.fontSize(10);
    for (const entry of result.byTask) {
      doc.text(`  ${entry.taskName ?? 'No task'}: ${entry.hours}h — ${entry.currency} ${entry.cost.toFixed(2)}`);
    }
    doc.moveDown();

    // By User
    doc.fontSize(14).text('By User', { underline: true });
    doc.fontSize(10);
    for (const entry of result.byUser) {
      doc.text(`  ${entry.userId}: ${entry.hours}h — ${entry.currency} ${entry.cost.toFixed(2)}`);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Invoice report — per client, by status, paid vs outstanding
// ---------------------------------------------------------------------------
function parseInvoiceReportFilter(req: Request): reportService.InvoiceReportFilter {
  const teamReq = req as unknown as TeamRequest;
  const filter: reportService.InvoiceReportFilter = { teamId: teamReq.team.teamId };

  if (req.query.startDate) filter.startDate = new Date(req.query.startDate as string);
  if (req.query.endDate) filter.endDate = new Date(req.query.endDate as string);
  if (req.query.clientId) filter.clientId = req.query.clientId as string;
  if (req.query.status) filter.status = req.query.status as reportService.InvoiceReportFilter['status'];
  if (req.query.type) filter.type = req.query.type as reportService.InvoiceReportFilter['type'];
  if (req.query.paid !== undefined) filter.paid = req.query.paid === 'true';

  return filter;
}

// GET /teams/:teamId/reports/invoices
export async function invoiceReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const result = await reportService.getInvoiceReport(
      parseInvoiceReportFilter(req),
      isManager,
      authReq.user.userId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/reports/invoices/trend
const INVOICE_TREND_GROUP_BY_VALUES = ['client', 'status'] as const;

export async function invoiceTrend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const groupBy = req.query.groupBy as string | undefined;
    if (!groupBy || !INVOICE_TREND_GROUP_BY_VALUES.includes(groupBy as (typeof INVOICE_TREND_GROUP_BY_VALUES)[number])) {
      throw AppError.badRequest(
        `groupBy must be one of: ${INVOICE_TREND_GROUP_BY_VALUES.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    const result = await reportService.getInvoiceTrend(
      parseInvoiceReportFilter(req),
      groupBy as reportService.InvoiceTrendGroupBy,
      isManager,
      authReq.user.userId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/reports/invoices/export/csv
export async function exportInvoicesCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const rows = await reportService.getInvoiceExportData(
      parseInvoiceReportFilter(req),
      isManager,
      authReq.user.userId
    );

    const { stringify } = await import('csv-stringify/sync');
    const csv = stringify(rows, { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="invoice-report.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// GET /teams/:teamId/reports/invoices/export/pdf
export async function exportInvoicesPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const teamReq = req as unknown as TeamRequest;
    const isManager = teamReq.team.role === 'manager';

    const result = await reportService.getInvoiceReport(
      parseInvoiceReportFilter(req),
      isManager,
      authReq.user.userId
    );

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 50 });
    doc.registerFont('Body', FONT_REGULAR);
    doc.font('Body');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="invoice-report.pdf"');
    doc.pipe(res);

    doc.fontSize(20).text('Invoice Report', { align: 'center' });
    doc.moveDown();

    doc.fontSize(14).text('Totals by currency', { underline: true });
    doc.fontSize(10);
    for (const t of result.totalsByCurrency) {
      doc.text(
        `  ${t.currency} — Invoiced: ${t.totalInvoiced.toFixed(2)}  Paid: ${t.totalPaid.toFixed(2)}  Outstanding: ${t.totalOutstanding.toFixed(2)}  (${t.count} invoices)`
      );
    }
    doc.moveDown();

    doc.fontSize(14).text('By client', { underline: true });
    doc.fontSize(10);
    for (const c of result.byClient) {
      doc.text(
        `  ${c.clientName} (${c.currency}) — Invoiced: ${c.totalInvoiced.toFixed(2)}  Paid: ${c.totalPaid.toFixed(2)}  Outstanding: ${c.totalOutstanding.toFixed(2)}`
      );
    }
    doc.moveDown();

    doc.fontSize(14).text('Invoices', { underline: true });
    doc.fontSize(9);
    for (const inv of result.invoices) {
      doc.text(
        `  #${inv.invoiceNumber} · ${inv.clientName} · ${inv.type} · ${inv.status} · ${inv.currency} ${inv.total.toFixed(2)}`
      );
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}
