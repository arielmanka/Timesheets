import type { ID } from './common'

export interface ReportFilter {
  startDate?: string
  endDate?: string
  userId?: string
  projectId?: string
  clientId?: string
  taskId?: string
}

export interface ReportSummary {
  totalHours: number
  totalCost: number
  currency: string
  byProject: Array<{ projectId: ID; projectName: string; hours: number; cost: number }>
  byUser: Array<{ userId: ID; hours: number; cost: number }>
  byTask: Array<{ taskId: ID | null; hours: number; cost: number }>
  records: Array<{
    _id: ID
    userId: ID
    projectId: ID
    taskId: ID | null
    date: string
    durationMinutes: number
    calculatedCost: number
    billable: boolean
    status: string
  }>
}
