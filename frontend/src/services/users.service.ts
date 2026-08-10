import { api } from './api'
import type { EmploymentType, IncorporationDetails, User } from '../types/user'

export async function getMyProfile(): Promise<User> {
  const { data } = await api.get<{ user: User }>('/users/me')
  return data.user
}

export async function updateMyProfile(input: {
  firstName?: string
  lastName?: string
  locale?: string
  employmentType?: EmploymentType
  incorporation?: IncorporationDetails | null
}): Promise<User> {
  const { data } = await api.patch<{ user: User }>('/users/me', input)
  return data.user
}

export async function requestAccountDeletion(): Promise<{ message: string; requestedAt: string }> {
  const { data } = await api.delete('/users/me')
  return data
}
