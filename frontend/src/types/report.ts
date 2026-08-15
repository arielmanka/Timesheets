import type { ID } from './common'
import type { InvoiceStatus, InvoiceType } from './invoice'

export interface ReportFilter {
  startDate?: string
  endDate?: string
  userId?: string
  projectId?: string
  clientId?: string
  taskId?: string
  status?: 'pending' | 'approved' | 'rejected'
}

export interface ReportSummary {
  totalHours: number
  /** Grouped by currency, not summed together — projects can bill in different currencies. */
  costByCurrency: Array<{ currency: string; totalCost: number }>
  byProject: Array<{ projectId: ID; projectName: string; currency: string; hours: number; cost: number }>
  byUser: Array<{ userId: ID; currency: string; hours: number; cost: number }>
  byTask: Array<{ taskId: ID | null; taskName: string | null; currency: string; hours: number; cost: number }>
  records: Array<{
    _id: ID
    userId: ID
    projectId: ID
    taskId: ID | null
    date: string
    durationMinutes: number
    calculatedCost: number
    currency: string
    billable: boolean
    status: string
  }>
}

export type TrendGroupBy = 'client' | 'project' | 'task' | 'user'
export type TrendGranularity = 'day' | 'week' | 'month'

export interface TrendFilter extends ReportFilter {
  groupBy: TrendGroupBy
}

export interface TrendSeries {
  /** Entity id, or '__other__' for series folded past the top-7 cap. */
  id: string
  name: string
  currency: string
  /** Aligned 1:1 with TrendResult.buckets. */
  hours: number[]
  cost: number[]
}

export interface TrendResult {
  groupBy: TrendGroupBy
  granularity: TrendGranularity
  /** ISO bucket-start dates, ascending, no gaps. */
  buckets: string[]
  series: TrendSeries[]
}

export type InvoiceTrendGroupBy = 'client' | 'status'

export interface InvoiceTrendSeries {
  /** Entity id (client id, or invoice status), or '__other__' for series folded past the top-7 cap. */
  id: string
  name: string
  currency: string
  /** Aligned 1:1 with InvoiceTrendResult.buckets. Count includes drafts; amount excludes them (not a real claim yet). */
  count: number[]
  amount: number[]
}

export interface InvoiceTrendResult {
  groupBy: InvoiceTrendGroupBy
  granularity: TrendGranularity
  buckets: string[]
  series: InvoiceTrendSeries[]
}

export interface InvoiceReportFilter {
  startDate?: string
  endDate?: string
  clientId?: string
  status?: InvoiceStatus
  type?: InvoiceType
  paid?: boolean
}

export interface InvoiceTrendFilter extends InvoiceReportFilter {
  groupBy: InvoiceTrendGroupBy
}

export interface InvoiceReportRow {
  _id: ID
  invoiceNumber: string
  type: InvoiceType
  clientId: ID
  clientName: string
  createdBy: ID
  status: InvoiceStatus
  total: number
  currency: string
  partialPaymentAmount: number | null
  paymentDate: string | null
  createdAt: string
}

export interface InvoiceCurrencyTotals {
  currency: string
  count: number
  totalInvoiced: number
  totalPaid: number
  totalOutstanding: number
}

export interface InvoiceReportSummary {
  countByStatus: Record<string, number>
  totalsByCurrency: InvoiceCurrencyTotals[]
  byClient: Array<InvoiceCurrencyTotals & { clientId: ID; clientName: string }>
  invoices: InvoiceReportRow[]
}
