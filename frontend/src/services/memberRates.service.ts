import { api } from './api'
import type { MemberRate } from '../types/memberRate'

export async function listMemberRates(teamId: string, projectId: string): Promise<MemberRate[]> {
  const { data } = await api.get<{ memberRates: MemberRate[] }>(`/teams/${teamId}/projects/${projectId}/member-rates`)
  return data.memberRates
}

export async function setMemberRate(
  teamId: string,
  projectId: string,
  userId: string,
  taskId: string | null,
  hourlyRate: number | null
): Promise<MemberRate | null> {
  const { data } = await api.patch<{ memberRate: MemberRate | null }>(
    `/teams/${teamId}/projects/${projectId}/member-rates/${userId}`,
    { taskId, hourlyRate }
  )
  return data.memberRate
}
