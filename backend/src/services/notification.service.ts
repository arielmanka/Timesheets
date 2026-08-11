import { Notification, type INotification } from '../models/Notification.js';
import { NotificationPreference } from '../models/NotificationPreference.js';
import { User } from '../models/User.js';
import { emailService } from './email.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Rule catalog — the backbone for the automation/notification system. Each
// entry is a fixed, built-in rule type (not an arbitrary user-defined
// condition) with its own default params; a user's stored
// NotificationPreference only ever needs to hold what they've *overridden*.
// New rule types are added here and in notificationRules.service.ts, not by
// extending a generic condition language.
// ---------------------------------------------------------------------------
// 'both' = every user sees this in their settings and can be notified by
// it, whether or not they manage a team (e.g. invoice_overdue notifies the
// invoice's owner always, and additionally notifies the team's managers).
export type RuleScope = 'personal' | 'manager' | 'both';

export interface RuleDefinition {
  ruleType: string;
  label: string;
  description: string;
  scope: RuleScope;
  defaultEnabled: boolean;
  defaultParams: Record<string, unknown>;
}

export const RULE_CATALOG: RuleDefinition[] = [
  {
    ruleType: 'invoice_overdue',
    label: 'Invoice overdue',
    description: "A sent invoice has passed its due date without being fully paid — notifies the invoice's owner, and separately any manager of its team.",
    scope: 'both',
    defaultEnabled: true,
    defaultParams: { graceDays: 0 },
  },
  {
    ruleType: 'missed_weekly_time_entry',
    label: 'Missed weekly time entry',
    description: "You haven't logged much time this week by a given weekday.",
    scope: 'personal',
    defaultEnabled: true,
    defaultParams: { weekday: 5, minHours: 1 }, // 5 = Friday (1=Mon .. 7=Sun)
  },
  {
    ruleType: 'project_ending_soon',
    label: 'Project ending soon',
    description: "A project you manage is approaching its configured end date.",
    scope: 'manager',
    defaultEnabled: true,
    defaultParams: { daysAhead: 14 },
  },
  {
    ruleType: 'pending_approval_backlog',
    label: 'Approval backlog',
    description: 'Time records have sat pending approval for longer than expected.',
    scope: 'manager',
    defaultEnabled: true,
    defaultParams: { thresholdDays: 3 },
  },
];

const RULE_BY_TYPE = new Map(RULE_CATALOG.map((r) => [r.ruleType, r]));

export function getRuleDefinition(ruleType: string): RuleDefinition | undefined {
  return RULE_BY_TYPE.get(ruleType);
}

// ---------------------------------------------------------------------------
// Preferences — resolve a user's effective settings for a rule type,
// falling back to the catalog default when no override is stored.
// ---------------------------------------------------------------------------
export interface EffectivePreference {
  ruleType: string;
  enabled: boolean;
  emailEnabled: boolean;
  params: Record<string, unknown>;
}

export async function getPreference(userId: string, ruleType: string): Promise<EffectivePreference> {
  const def = getRuleDefinition(ruleType);
  if (!def) throw new Error(`Unknown rule type: ${ruleType}`);

  const stored = await NotificationPreference.findOne({ userId, ruleType });
  return {
    ruleType,
    enabled: stored?.enabled ?? def.defaultEnabled,
    emailEnabled: stored?.emailEnabled ?? false,
    params: { ...def.defaultParams, ...(stored?.params ?? {}) },
  };
}

export async function listPreferences(
  userId: string,
  isManagerOfAnyTeam: boolean
): Promise<Array<EffectivePreference & { label: string; description: string; scope: RuleScope }>> {
  const stored = await NotificationPreference.find({ userId });
  const storedByType = new Map(stored.map((s) => [s.ruleType, s]));

  return RULE_CATALOG.filter((def) => def.scope !== 'manager' || isManagerOfAnyTeam).map((def) => {
    const s = storedByType.get(def.ruleType);
    return {
      ruleType: def.ruleType,
      label: def.label,
      description: def.description,
      scope: def.scope,
      enabled: s?.enabled ?? def.defaultEnabled,
      emailEnabled: s?.emailEnabled ?? false,
      params: { ...def.defaultParams, ...(s?.params ?? {}) },
    };
  });
}

export async function updatePreference(
  userId: string,
  ruleType: string,
  data: { enabled?: boolean; emailEnabled?: boolean; params?: Record<string, unknown> }
): Promise<void> {
  const def = getRuleDefinition(ruleType);
  if (!def) throw new Error(`Unknown rule type: ${ruleType}`);

  // $set and $setOnInsert can never target the same field in one update —
  // Mongo rejects that as a conflict — so `enabled` only ever appears in
  // exactly one of the two, depending on whether the caller supplied it.
  // Mongo also rejects an empty operator object, so both are only attached
  // to the update when they actually have something in them.
  const setFields: Record<string, unknown> = {};
  if (data.enabled !== undefined) setFields.enabled = data.enabled;
  if (data.emailEnabled !== undefined) setFields.emailEnabled = data.emailEnabled;
  if (data.params !== undefined) setFields.params = { ...def.defaultParams, ...data.params };

  const setOnInsertFields: Record<string, unknown> = {};
  if (data.enabled === undefined) setOnInsertFields.enabled = def.defaultEnabled;

  const update: Record<string, unknown> = {};
  if (Object.keys(setFields).length > 0) update.$set = setFields;
  if (Object.keys(setOnInsertFields).length > 0) update.$setOnInsert = setOnInsertFields;

  await NotificationPreference.findOneAndUpdate({ userId, ruleType }, update, {
    upsert: true,
    setDefaultsOnInsert: true,
  });
}

// ---------------------------------------------------------------------------
// notify() — the single write path every rule handler calls. Handles the
// preference check, the dedupe insert, and (if the recipient opted in and
// real email is configured) sending the email — so rule handlers themselves
// never touch these concerns directly.
// ---------------------------------------------------------------------------
export async function notify(params: {
  userId: string;
  teamId?: string | null;
  ruleType: string;
  entityType: string;
  entityId?: string | null;
  title: string;
  message: string;
  dedupeKey: string;
}): Promise<void> {
  const pref = await getPreference(params.userId, params.ruleType);
  if (!pref.enabled) return;

  try {
    const doc = await Notification.create({
      userId: params.userId,
      teamId: params.teamId ?? null,
      ruleType: params.ruleType,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      title: params.title,
      message: params.message,
      dedupeKey: params.dedupeKey,
    });

    if (pref.emailEnabled) {
      await sendEmailForNotification(params.userId, doc);
    }
  } catch (err) {
    // Duplicate key = already notified for this dedupe window; anything
    // else is a real failure, but notifications should never block whatever
    // triggered the scan.
    if ((err as { code?: number }).code !== 11000) {
      logger.error({ err, ruleType: params.ruleType }, 'Failed to write notification');
    }
  }
}

async function sendEmailForNotification(userId: string, doc: INotification): Promise<void> {
  try {
    const user = await User.findById(userId);
    if (!user) return;
    await emailService.sendNotificationEmail(user.email, doc.title, doc.message);
    doc.emailSent = true;
    await doc.save();
  } catch (err) {
    logger.error({ err, notificationId: doc._id }, 'Failed to send notification email');
  }
}

// ---------------------------------------------------------------------------
// Inbox — list / mark read, scoped to the requesting user only.
// ---------------------------------------------------------------------------
export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number; skip?: number } = {}
): Promise<{ notifications: INotification[]; total: number; unreadCount: number }> {
  const filter: Record<string, unknown> = { userId };
  if (options.unreadOnly) filter.read = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(options.skip ?? 0)
      .limit(options.limit ?? 50),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, read: false }),
  ]);

  return { notifications, total, unreadCount };
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  await Notification.updateOne({ _id: notificationId, userId }, { $set: { read: true } });
}

export async function markAllRead(userId: string): Promise<void> {
  await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
}

export const emailAvailable = env.EMAIL_PROVIDER === 'smtp';
