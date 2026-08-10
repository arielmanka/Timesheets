import { Router } from 'express';
import * as clientsController from '../../controllers/clients.controller.js';
import * as projectsController from '../../controllers/projects.controller.js';
import * as tasksController from '../../controllers/tasks.controller.js';
import * as timeRecordsController from '../../controllers/timeRecords.controller.js';
import * as invoicesController from '../../controllers/invoices.controller.js';
import * as reportsController from '../../controllers/reports.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireTeamMember, requireManager } from '../../middleware/accessControl.js';

const router = Router({ mergeParams: true });

// All routes require authentication + team membership (at minimum)
router.use(authenticate);

// ---------------------------------------------------------------------------
// Client routes — nested under /teams/:teamId/clients
// ---------------------------------------------------------------------------
router.post('/:teamId/clients', requireManager, clientsController.create);
router.get('/:teamId/clients', requireTeamMember, clientsController.list);
router.get('/:teamId/clients/:clientId', requireTeamMember, clientsController.getOne);
router.patch('/:teamId/clients/:clientId', requireManager, clientsController.update);

// ---------------------------------------------------------------------------
// Project routes — nested under /teams/:teamId/projects
// ---------------------------------------------------------------------------
router.post('/:teamId/projects', requireManager, projectsController.create);
router.get('/:teamId/projects', requireTeamMember, projectsController.list);
router.get('/:teamId/projects/:projectId', requireTeamMember, projectsController.getOne);
router.patch('/:teamId/projects/:projectId', requireManager, projectsController.update);
router.patch('/:teamId/projects/:projectId/status', requireManager, projectsController.updateStatus);

// ---------------------------------------------------------------------------
// Task routes — nested under /teams/:teamId/projects/:projectId/tasks
// ---------------------------------------------------------------------------
router.post('/:teamId/projects/:projectId/tasks', requireManager, tasksController.create);
router.get('/:teamId/projects/:projectId/tasks', requireTeamMember, tasksController.list);
router.patch('/:teamId/projects/:projectId/tasks/:taskId', requireTeamMember, tasksController.update);

// ---------------------------------------------------------------------------
// Time record routes — nested under /teams/:teamId/time-records
// ---------------------------------------------------------------------------
router.post('/:teamId/time-records', requireTeamMember, timeRecordsController.create);
router.get('/:teamId/time-records', requireTeamMember, timeRecordsController.list);
router.patch('/:teamId/time-records/:recordId', requireTeamMember, timeRecordsController.update);
router.delete('/:teamId/time-records/:recordId', requireTeamMember, timeRecordsController.remove);
router.post('/:teamId/time-records/:recordId/approve', requireManager, timeRecordsController.approve);
router.post('/:teamId/time-records/:recordId/unapprove', requireManager, timeRecordsController.unapprove);
router.post('/:teamId/time-records/:recordId/reject', requireManager, timeRecordsController.reject);

// ---------------------------------------------------------------------------
// Invoice routes — nested under /teams/:teamId/invoices
// ---------------------------------------------------------------------------
router.post('/:teamId/invoices', requireTeamMember, invoicesController.createPersonal);
router.post('/:teamId/invoices/collective', requireManager, invoicesController.createCollective);
router.get('/:teamId/invoices', requireTeamMember, invoicesController.list);
router.get('/:teamId/invoices/:invoiceId', requireTeamMember, invoicesController.getOne);
router.patch('/:teamId/invoices/:invoiceId', requireTeamMember, invoicesController.updateDraft);
router.delete('/:teamId/invoices/:invoiceId', requireTeamMember, invoicesController.deleteDraft);
router.post('/:teamId/invoices/:invoiceId/time-records', requireTeamMember, invoicesController.addTimeRecord);
router.delete('/:teamId/invoices/:invoiceId/time-records/:recordId', requireTeamMember, invoicesController.removeTimeRecord);
router.post('/:teamId/invoices/:invoiceId/pool/:personalInvoiceId', requireManager, invoicesController.addToPool);
router.delete('/:teamId/invoices/:invoiceId/pool/:personalInvoiceId', requireManager, invoicesController.removeFromPool);
router.post('/:teamId/invoices/:invoiceId/send', requireTeamMember, invoicesController.send);
router.post('/:teamId/invoices/:invoiceId/revert-to-draft', requireTeamMember, invoicesController.revertToDraft);
router.post('/:teamId/invoices/:invoiceId/payment', requireManager, invoicesController.recordPayment);
router.get('/:teamId/invoices/:invoiceId/pdf', requireTeamMember, invoicesController.exportPdf);
router.get('/:teamId/invoices/:invoiceId/csv', requireTeamMember, invoicesController.exportCsv);

// ---------------------------------------------------------------------------
// Report routes — nested under /teams/:teamId/reports
// ---------------------------------------------------------------------------
router.get('/:teamId/reports/summary', requireTeamMember, reportsController.summary);
router.get('/:teamId/reports/export/csv', requireTeamMember, reportsController.exportCsv);
router.get('/:teamId/reports/export/pdf', requireTeamMember, reportsController.exportPdf);
router.get('/:teamId/reports/invoices', requireTeamMember, reportsController.invoiceReport);
router.get('/:teamId/reports/invoices/export/csv', requireTeamMember, reportsController.exportInvoicesCsv);
router.get('/:teamId/reports/invoices/export/pdf', requireTeamMember, reportsController.exportInvoicesPdf);

export { router as cptRouter };
