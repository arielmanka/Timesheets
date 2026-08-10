import { api } from './api'
import type { TeamSummary, TeamDetail, TeamRole, UserSearchResult } from '../types/team'

export async function createTeam(name: string): Promise<TeamSummary> {
  const { data } = await api.post<{ team: TeamSummary }>('/teams', { name })
  return data.team
}

export async function listMyTeams(): Promise<TeamSummary[]> {
  const { data } = await api.get<{ teams: TeamSummary[] }>('/teams')
  return data.teams
}

export async function getTeam(teamId: string): Promise<TeamDetail> {
  const { data } = await api.get<{ team: TeamDetail }>(`/teams/${teamId}`)
  return data.team
}

export async function deleteTeam(teamId: string): Promise<void> {
  await api.delete(`/teams/${teamId}`)
}

export async function searchUserByUid(teamId: string, uid: string): Promise<UserSearchResult> {
  const { data } = await api.get<{ user: UserSearchResult }>(`/teams/${teamId}/search-user`, {
    params: { uid },
  })
  return data.user
}

// The mutation endpoints below return the team in its raw (unpopulated) shape —
// callers should refetch getTeam(teamId) afterward to get member identities back.
export async function addMember(teamId: string, uid: string): Promise<void> {
  await api.post(`/teams/${teamId}/members`, { uid })
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/members/${userId}`)
}

export async function setMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void> {
  await api.patch(`/teams/${teamId}/members/${userId}/role`, { role })
}

export async function setMemberRate(teamId: string, userId: string, hourlyRate: number | null): Promise<void> {
  await api.patch(`/teams/${teamId}/members/${userId}/rate`, { hourlyRate })
}
