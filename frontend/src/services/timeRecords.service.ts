import { api } from './api'
import type {
  TimeRecord,
  TimeRecordInput,
  TimeRecordUpdateInput,
  ListTimeRecordsFilter,
  CrossTeamTimeRecord,
} from '../types/timeRecord'

export async function listTimeRecords(teamId: string, filter: ListTimeRecordsFilter = {}): Promise<TimeRecord[]> {
  const { data } = await api.get<{ records: TimeRecord[] }>(`/teams/${teamId}/time-records`, { params: filter })
  return data.records
}

export async function listMyTimeRecordsAcrossTeams(filter: {
  startDate?: string
  endDate?: string
  billable?: boolean
  status?: TimeRecord['status']
}): Promise<CrossTeamTimeRecord[]> {
  const { data } = await api.get<{ entries: CrossTeamTimeRecord[] }>('/users/me/time-records', { params: filter })
  return data.entries
}

export async function createTimeRecord(teamId: string, input: TimeRecordInput): Promise<TimeRecord> {
  const { data } = await api.post<{ record: TimeRecord }>(`/teams/${teamId}/time-records`, input)
  return data.record
}

export async function updateTimeRecord(
  teamId: string,
  recordId: string,
  input: TimeRecordUpdateInput
): Promise<TimeRecord> {
  const { data } = await api.patch<{ record: TimeRecord }>(`/teams/${teamId}/time-records/${recordId}`, input)
  return data.record
}

export async function deleteTimeRecord(teamId: string, recordId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/time-records/${recordId}`)
}

export async function approveTimeRecord(teamId: string, recordId: string): Promise<TimeRecord> {
  const { data } = await api.post<{ record: TimeRecord }>(`/teams/${teamId}/time-records/${recordId}/approve`)
  return data.record
}

export async function rejectTimeRecord(teamId: string, recordId: string, reason: string): Promise<TimeRecord> {
  const { data } = await api.post<{ record: TimeRecord }>(`/teams/${teamId}/time-records/${recordId}/reject`, {
    reason,
  })
  return data.record
}

export async function unapproveTimeRecord(teamId: string, recordId: string): Promise<TimeRecord> {
  const { data } = await api.post<{ record: TimeRecord }>(`/teams/${teamId}/time-records/${recordId}/unapprove`)
  return data.record
}
