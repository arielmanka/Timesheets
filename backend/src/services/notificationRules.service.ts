import { Invoice } from '../models/Invoice.js';
import { Project } from '../models/Project.js';
import { Team } from '../models/Team.js';
import { TimeRecord } from '../models/TimeRecord.js';
import { getTeamManagerIds } from './team.service.js';
import { getPreference, notify } from './notification.service.js';
import { logger } from '../config/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// `Number(x) || fallback` silently discards a legitimately-configured 0
// (e.g. "no grace period," "no backlog threshold") because 0 is falsy in
// JS — use this instead everywhere a param might be zero.
function numParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// ISO week helpers (Monday start) — used only by missed_weekly_time_entry to
// bucket "once per calendar week" dedupe keys and to bound "this week"'s
// time-record query.
// ---------------------------------------------------------------------------
function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - (isoWeekday(d) - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoWeekBucket(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - isoWeekday(d));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// invoice_overdue — a sent invoice past its due date. The status transition
// (sent -> overdue) is an objective, shared fact applied once for everyone;
// each recipient's own `graceDays` param only affects when *they* are
// notified about it, not the status itself.
// ---------------------------------------------------------------------------
async function evaluateInvoiceOverdue(now: Date): Promise<void> {
  const candidates = await Invoice.find({ status: 'sent', dueDate: { $ne: null, $lt: now } });
  if (candidates.length === 0) return;

  await Invoice.updateMany({ _id: { $in: candidates.map((i) => i._id) } }, { $set: { status: 'overdue' } });

  for (const invoice of candidates) {
    const daysOverdue = Math.floor((now.getTime() - invoice.dueDate!.getTime()) / DAY_MS);
    const dueDateStr = invoice.dueDate!.toISOString().slice(0, 10);

    const ownerId = invoice.createdBy.toString();
    const ownerPref = await getPreference(ownerId, 'invoice_overdue');
    if (ownerPref.enabled && daysOverdue >= numParam(ownerPref.params.graceDays, 0)) {
      await notify({
        userId: ownerId,
        teamId: invoice.teamId.toString(),
        ruleType: 'invoice_overdue',
        entityType: 'Invoice',
        entityId: invoice._id.toString(),
        title: `Invoice #${invoice.invoiceNumber} is overdue`,
        message: `Your invoice #${invoice.invoiceNumber} (${invoice.currency} ${invoice.total.toFixed(2)}) was due ${dueDateStr} and hasn't been paid.`,
        dedupeKey: `invoice_overdue:${invoice._id}`,
      });
    }

    const managerIds = await getTeamManagerIds(invoice.teamId.toString());
    for (const managerId of managerIds) {
      if (managerId === ownerId) continue; // already notified above
      const mgrPref = await getPreference(managerId, 'invoice_overdue');
      if (mgrPref.enabled && daysOverdue >= numParam(mgrPref.params.graceDays, 0)) {
        await notify({
          userId: managerId,
          teamId: invoice.teamId.toString(),
          ruleType: 'invoice_overdue',
          entityType: 'Invoice',
          entityId: invoice._id.toString(),
          title: `Team invoice #${invoice.invoiceNumber} is overdue`,
          message: `Invoice #${invoice.invoiceNumber} (${invoice.currency} ${invoice.total.toFixed(2)}) is overdue (due ${dueDateStr}).`,
          dedupeKey: `invoice_overdue:${invoice._id}`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// missed_weekly_time_entry — a user who hasn't logged (much) time so far
// this week, checked once their configured weekday has arrived.
// ---------------------------------------------------------------------------
async function evaluateMissedWeeklyTimeEntry(now: Date): Promise<void> {
  const todayIso = isoWeekday(now);
  const weekBucket = isoWeekBucket(now);
  const weekStart = startOfIsoWeek(now);

  const userIds = await Team.distinct('members.userId');

  for (const userId of userIds) {
    const id = userId.toString();
    const pref = await getPreference(id, 'missed_weekly_time_entry');
    if (!pref.enabled) continue;

    const weekday = numParam(pref.params.weekday, 5);
    const minHours = numParam(pref.params.minHours, 1);
    if (todayIso < weekday) continue;

    const records = await TimeRecord.find({ userId: id, date: { $gte: weekStart, $lte: now } }).select(
      'durationMinutes'
    );
    const totalHours = records.reduce((sum, r) => sum + r.durationMinutes, 0) / 60;
    if (totalHours >= minHours) continue;

    await notify({
      userId: id,
      ruleType: 'missed_weekly_time_entry',
      entityType: 'User',
      entityId: id,
      title: "You haven't logged much time this week",
      message: `Only ${totalHours.toFixed(2)}h logged so far this week (since ${weekStart.toISOString().slice(0, 10)}).`,
      dedupeKey: `missed_weekly_time_entry:${id}:${weekBucket}`,
    });
  }
}

// ---------------------------------------------------------------------------
// project_ending_soon — an active project approaching its end date, checked
// against each manager's own daysAhead threshold.
// ---------------------------------------------------------------------------
async function evaluateProjectEndingSoon(now: Date): Promise<void> {
  const candidates = await Project.find({ status: 'active', endDate: { $ne: null, $gte: now } });
  if (candidates.length === 0) return;

  for (const project of candidates) {
    const daysUntilEnd = Math.ceil((project.endDate!.getTime() - now.getTime()) / DAY_MS);
    const managerIds = await getTeamManagerIds(project.teamId.toString());

    for (const managerId of managerIds) {
      const pref = await getPreference(managerId, 'project_ending_soon');
      if (!pref.enabled) continue;
      const daysAhead = numParam(pref.params.daysAhead, 14);
      if (daysUntilEnd > daysAhead) continue;

      await notify({
        userId: managerId,
        teamId: project.teamId.toString(),
        ruleType: 'project_ending_soon',
        entityType: 'Project',
        entityId: project._id.toString(),
        title: `Project "${project.name}" is ending soon`,
        message: `"${project.name}" is scheduled to end ${project.endDate!.toISOString().slice(0, 10)} (${daysUntilEnd} day${daysUntilEnd === 1 ? '' : 's'} from now).`,
        dedupeKey: `project_ending_soon:${project._id}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// pending_approval_backlog — time records that have sat pending for longer
// than a manager's own threshold, aggregated per team so a manager gets one
// count-style notification rather than one per record.
// ---------------------------------------------------------------------------
async function evaluatePendingApprovalBacklog(now: Date): Promise<void> {
  const pending = await TimeRecord.find({ status: 'pending' }).select('projectId createdAt');
  if (pending.length === 0) return;

  const projectIds = [...new Set(pending.map((r) => r.projectId.toString()))];
  const projects = await Project.find({ _id: { $in: projectIds } }).select('teamId');
  const teamIdByProject = new Map(projects.map((p) => [p._id.toString(), p.teamId.toString()]));

  const oldestByTeam = new Map<string, Date[]>();
  for (const record of pending) {
    const teamId = teamIdByProject.get(record.projectId.toString());
    if (!teamId) continue;
    const list = oldestByTeam.get(teamId) ?? [];
    list.push(record.createdAt);
    oldestByTeam.set(teamId, list);
  }

  const todayBucket = now.toISOString().slice(0, 10);

  for (const [teamId, createdAtDates] of oldestByTeam) {
    const managerIds = await getTeamManagerIds(teamId);
    for (const managerId of managerIds) {
      const pref = await getPreference(managerId, 'pending_approval_backlog');
      if (!pref.enabled) continue;
      const thresholdDays = numParam(pref.params.thresholdDays, 3);

      const overThreshold = createdAtDates.filter(
        (createdAt) => (now.getTime() - createdAt.getTime()) / DAY_MS >= thresholdDays
      );
      if (overThreshold.length === 0) continue;

      await notify({
        userId: managerId,
        teamId,
        ruleType: 'pending_approval_backlog',
        entityType: 'Team',
        entityId: teamId,
        title: 'Time records waiting on approval',
        message: `${overThreshold.length} time record${overThreshold.length === 1 ? ' has' : 's have'} been pending approval for ${thresholdDays}+ days.`,
        dedupeKey: `pending_approval_backlog:${teamId}:${todayBucket}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point — called by the scheduler (and the internal manual-trigger
// endpoint). Each rule runs independently so one failing evaluator doesn't
// block the others.
// ---------------------------------------------------------------------------
export async function runAllRules(): Promise<void> {
  const now = new Date();
  const evaluators: Array<[string, () => Promise<void>]> = [
    ['invoice_overdue', () => evaluateInvoiceOverdue(now)],
    ['missed_weekly_time_entry', () => evaluateMissedWeeklyTimeEntry(now)],
    ['project_ending_soon', () => evaluateProjectEndingSoon(now)],
    ['pending_approval_backlog', () => evaluatePendingApprovalBacklog(now)],
  ];

  for (const [ruleType, run] of evaluators) {
    try {
      await run();
    } catch (err) {
      logger.error({ err, ruleType }, 'Notification rule evaluation failed');
    }
  }
}
