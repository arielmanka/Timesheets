import { api } from './api'
import { downloadBlob } from './download'
import type {
  ReportFilter,
  ReportSummary,
  TrendFilter,
  TrendResult,
  InvoiceReportFilter,
  InvoiceReportSummary,
  InvoiceTrendFilter,
  InvoiceTrendResult,
} from '../types/report'

export async function getReportSummary(teamId: string, filter: ReportFilter): Promise<ReportSummary> {
  const { data } = await api.get<ReportSummary>(`/teams/${teamId}/reports/summary`, { params: filter })
  return data
}

export async function getReportTrend(teamId: string, filter: TrendFilter): Promise<TrendResult> {
  const { data } = await api.get<TrendResult>(`/teams/${teamId}/reports/trend`, { params: filter })
  return data
}

export async function downloadReportCsv(teamId: string, filter: ReportFilter): Promise<void> {
  const { data } = await api.get(`/teams/${teamId}/reports/export/csv`, { params: filter, responseType: 'blob' })
  downloadBlob(data, 'report.csv')
}

export async function downloadReportPdf(teamId: string, filter: ReportFilter): Promise<void> {
  const { data } = await api.get(`/teams/${teamId}/reports/export/pdf`, { params: filter, responseType: 'blob' })
  downloadBlob(data, 'report.pdf')
}

export async function getInvoiceReport(teamId: string, filter: InvoiceReportFilter): Promise<InvoiceReportSummary> {
  const { data } = await api.get<InvoiceReportSummary>(`/teams/${teamId}/reports/invoices`, { params: filter })
  return data
}

export async function downloadInvoiceReportCsv(teamId: string, filter: InvoiceReportFilter): Promise<void> {
  const { data } = await api.get(`/teams/${teamId}/reports/invoices/export/csv`, { params: filter, responseType: 'blob' })
  downloadBlob(data, 'invoice-report.csv')
}

export async function downloadInvoiceReportPdf(teamId: string, filter: InvoiceReportFilter): Promise<void> {
  const { data } = await api.get(`/teams/${teamId}/reports/invoices/export/pdf`, { params: filter, responseType: 'blob' })
  downloadBlob(data, 'invoice-report.pdf')
}

export async function getInvoiceTrend(teamId: string, filter: InvoiceTrendFilter): Promise<InvoiceTrendResult> {
  const { data } = await api.get<InvoiceTrendResult>(`/teams/${teamId}/reports/invoices/trend`, { params: filter })
  return data
}

