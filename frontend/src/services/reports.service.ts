import { api } from './api'
import { downloadBlob } from './download'
import type { ReportFilter, ReportSummary } from '../types/report'

export async function getReportSummary(teamId: string, filter: ReportFilter): Promise<ReportSummary> {
  const { data } = await api.get<ReportSummary>(`/teams/${teamId}/reports/summary`, { params: filter })
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

