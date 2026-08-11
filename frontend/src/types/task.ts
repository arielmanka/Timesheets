import type { ID } from './common'

export type TaskStatus = 'open' | 'in_progress' | 'complete'

export interface Task {
  _id: ID
  projectId: ID
  name: string
  description: string | null
  status: TaskStatus
  assignedTo: ID | null
  /** Manager-only field — see RateField. */
  hourlyRate: number | null
  /** Manager-only — a time record logged against this task inherits this value at creation; see TimeRecord.billable. */
  billable: boolean
  createdAt: string
  updatedAt: string
}

export interface TaskInput {
  name: string
  description?: string | null
  assignedTo?: string | null
  hourlyRate?: number | null
  billable?: boolean
}

export const TASK_STATUSES: TaskStatus[] = ['open', 'in_progress', 'complete']
