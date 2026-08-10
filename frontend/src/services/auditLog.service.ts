import { api } from './api'
import type { AuditLogFilter, AuditLogResult } from '../types/auditLog'

export async function getAuditLog(teamId: string, filter: AuditLogFilter): Promise<AuditLogResult> {
  const { data } = await api.get<AuditLogResult>(`/teams/${teamId}/audit-log`, { params: filter })
  return data
}
