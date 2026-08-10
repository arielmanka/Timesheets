import type { ID } from './common'

export type ProjectStatus = 'active' | 'on_hold' | 'complete' | 'cancelled'

export interface TaxRule {
  name: string
  rate: number
}

export interface Budget {
  type: 'hours' | 'monetary' | null
  amount: number | null
}

export interface Project {
  _id: ID
  teamId: ID
  clientId: ID
  name: string
  status: ProjectStatus
  startDate: string | null
  endDate: string | null
  currency: string
  /** Only meaningful for managers — see RateField; may be present but must not be rendered to regular users. */
  hourlyRate: number | null
  budget: Budget
  taxRules: TaxRule[]
  createdAt: string
  updatedAt: string
}

export interface ProjectInput {
  clientId: string
  name: string
  currency?: string
  hourlyRate?: number | null
  startDate?: string | null
  endDate?: string | null
  budget?: Budget
  taxRules?: TaxRule[]
}

export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'on_hold', 'complete', 'cancelled']
