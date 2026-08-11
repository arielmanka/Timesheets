import { runAllRules } from './notificationRules.service.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// In-process periodic scan for the notification rule catalog. No separate
// worker or message queue — same pattern as invoice.service.ts's startup
// reconcile() sweep, appropriate at this app's scale and consistent with it
// running as a single Docker Compose backend process.
// ---------------------------------------------------------------------------
export function startNotificationScheduler(): void {
  runAllRules().catch((err) => logger.error({ err }, 'Initial notification rule scan failed'));

  setInterval(() => {
    runAllRules().catch((err) => logger.error({ err }, 'Scheduled notification rule scan failed'));
  }, env.NOTIFICATION_SCAN_INTERVAL_MS);

  logger.info(
    { intervalMs: env.NOTIFICATION_SCAN_INTERVAL_MS },
    'Notification scheduler started'
  );
}
