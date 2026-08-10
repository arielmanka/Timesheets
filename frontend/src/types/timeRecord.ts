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
  taskId?: string | null
  date: string
  startTime: string
  endTime: string
  billable?: boolean
  note?: string
}

export interface TimeRecordUpdateInput {
  startTime?: string
  endTime?: string
  billable?: boolean
  note?: string
  taskId?: string | null
}

export interface ListTimeRecordsFilter {
  userId?: string
  projectId?: string
  clientId?: string
  startDate?: string
  endDate?: string
  status?: TimeRecordStatus
  billable?: boolean
  invoiced?: boolean
}
