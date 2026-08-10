import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as reportService from '../services/report.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { TeamRequest } from '../middleware/accessControl.js';

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

    const result = await reportService.getSummary(filter, isManager, authReq.user.userId);
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

    // Summary
    doc.fontSize(12);
    doc.text(`Total Hours: ${result.totalHours}`);
    doc.text(`Total Cost: ${result.currency} ${result.totalCost.toFixed(2)}`);
    doc.moveDown();

    // By Project
    doc.fontSize(14).text('By Project', { underline: true });
    doc.fontSize(10);
    for (const entry of result.byProject) {
      doc.text(`  ${entry.projectName}: ${entry.hours}h — ${result.currency} ${entry.cost.toFixed(2)}`);
    }
    doc.moveDown();

    // By User
    doc.fontSize(14).text('By User', { underline: true });
    doc.fontSize(10);
    for (const entry of result.byUser) {
      doc.text(`  ${entry.userId}: ${entry.hours}h — ${result.currency} ${entry.cost.toFixed(2)}`);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}
