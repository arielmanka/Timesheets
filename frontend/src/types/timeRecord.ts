import type { ID } from './common'

export type TimeRecordStatus = 'pending' | 'approved' | 'rejected'
export type RateSource = 'task' | 'project' | 'member'

export interface ChangeHistoryEntry {
  field: string
  previousValue: unknown
  newValue: unknown
  changedBy: ID
  changedAt: string
}

export interface TimeRecord {
  _id: ID
  userId: ID
  projectId: ID
  taskId: ID | null
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  /** Inherited from the task at creation time — never set directly; see Task.billable. */
  billable: boolean
  note: string
  /** Manager/owner-sensitive — see RateField; never render for a viewer who isn't the record owner or a manager. */
  resolvedRate: number
  rateSource: RateSource
  calculatedCost: number
  currency: string
  status: TimeRecordStatus
  locked: boolean
  invoiced: boolean
  invoiceId: ID | null
  approvedBy: ID | null
  rejectedBy: ID | null
  rejectionReason: string | null
  changeHistory: ChangeHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export interface TimeRecordInput {
  projectId: string
  /** Required — governs billable via the task; see Task.billable. */
  taskId: string
  date: string
  startTime: string
  endTime: string
  note?: string
}

export interface TimeRecordUpdateInput {
  startTime?: string
  endTime?: string
  note?: string
  /** Reassigns the task (re-deriving billable) — cannot be cleared. */
  taskId?: string
}

export interface ListTimeRecordsFilter {
  userId?: string
  projectId?: string
  taskId?: string
  clientId?: string
  startDate?: string
  endDate?: string
  status?: TimeRecordStatus
  billable?: boolean
  invoiced?: boolean
}

/** One of the current user's own time records, annotated with which team/project it belongs to — from the cross-team "Show all teams" view. */
export interface CrossTeamTimeRecord {
  record: TimeRecord
  teamId: string
  teamName: string
  projectName: string
}
