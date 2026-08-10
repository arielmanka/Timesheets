import type { ID } from './common'

export type TaskStatus = 'open' | 'in_progress' | 'done'

export interface Task {
  _id: ID
  projectId: ID
  name: string
  description: string | null
  status: TaskStatus
  assignedTo: ID | null
  /** Manager-only field — see RateField. */
  hourlyRate: number | null
  createdAt: string
  updatedAt: string
}

export interface TaskInput {
  name: string
  description?: string | null
  assignedTo?: string | null
  hourlyRate?: number | null
}

export const TASK_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done']
