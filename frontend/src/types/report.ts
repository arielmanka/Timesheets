import type { ID } from './common'
import type { InvoiceStatus, InvoiceType } from './invoice'

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
  /** Grouped by currency, not summed together — projects can bill in different currencies. */
  costByCurrency: Array<{ currency: string; totalCost: number }>
  byProject: Array<{ projectId: ID; projectName: string; currency: string; hours: number; cost: number }>
  byUser: Array<{ userId: ID; currency: string; hours: number; cost: number }>
  byTask: Array<{ taskId: ID | null; currency: string; hours: number; cost: number }>
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

export interface InvoiceReportFilter {
  startDate?: string
  endDate?: string
  clientId?: string
  status?: InvoiceStatus
  type?: InvoiceType
  paid?: boolean
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
