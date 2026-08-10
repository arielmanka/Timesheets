import { api, clearTokens, getRefreshToken, setTokens } from './api'
import type { User } from '../types/user'

export interface AuthResult {
  accessToken: string
  refreshToken: string
  user: User
}

export async function register(input: {
  email: string
  password: string
  firstName: string
  lastName: string
}): Promise<{ user: User; message: string }> {
  const { data } = await api.post('/auth/register', input)
  return data
}

export async function verifyEmail(token: string): Promise<void> {
  await api.post('/auth/verify-email', { token })
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/login', { email, password })
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
  return data
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()
  try {
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken })
    }
  } finally {
    clearTokens()
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/password-reset/request', { email })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post('/auth/password-reset/confirm', { token, password })
}
