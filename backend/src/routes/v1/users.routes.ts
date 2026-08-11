import { Router } from 'express';
import * as usersController from '../../controllers/users.controller.js';
import * as notificationsController from '../../controllers/notifications.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.get('/me', usersController.getProfile);
router.patch('/me', usersController.updateProfile);
router.delete('/me', usersController.requestDeletion);
router.get('/me/time-records', usersController.listMyTimeRecords);

// ---------------------------------------------------------------------------
// Notifications — the in-app inbox and per-rule-type preferences for the
// automation backbone (NFR-6).
// ---------------------------------------------------------------------------
router.get('/me/notifications', notificationsController.list);
router.patch('/me/notifications/:notificationId/read', notificationsController.markRead);
router.post('/me/notifications/read-all', notificationsController.markAllRead);
router.get('/me/notification-preferences', notificationsController.listPreferences);
router.patch('/me/notification-preferences/:ruleType', notificationsController.updatePreference);

export { router as usersRouter };
