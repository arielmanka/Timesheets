import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { ApiError, type ApiErrorBody } from '../types/common'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const REFRESH_TOKEN_STORAGE_KEY = 'timesheets.refreshToken'

// ---------------------------------------------------------------------------
// Token state — module-level, not a Pinia store, so the auth store and this
// interceptor can both reach it without importing each other (would cycle).
// ---------------------------------------------------------------------------
let accessToken: string | null = null
let refreshToken: string | null = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)

export function setTokens(tokens: { accessToken: string; refreshToken: string }): void {
  accessToken = tokens.accessToken
  refreshToken = tokens.refreshToken
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken)
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return refreshToken
}

export function clearTokens(): void {
  accessToken = null
  refreshToken = null
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
}

// ---------------------------------------------------------------------------
// Axios instances
// ---------------------------------------------------------------------------
export const api = axios.create({ baseURL })

// A second instance with no interceptors, used only for the refresh call
// itself so a failed refresh can't recursively trigger another refresh.
const bare = axios.create({ baseURL })

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return config
})

// Access tokens are short-lived (15 min, TECH-7) — concurrent requests that
// all 401 at once must share one refresh call, not fire one each.
let refreshInFlight: Promise<string | null> | null = null

/**
 * Called once on app boot: the access token never survives a page reload
 * (it's memory-only), but the refresh token does (localStorage). Trade the
 * stored refresh token for a fresh access token so the session persists.
 */
export async function restoreSession(): Promise<boolean> {
  if (!refreshToken) return false
  const token = await performRefresh()
  return token !== null
}

async function performRefresh(): Promise<string | null> {
  if (!refreshToken) return null
  try {
    const { data } = await bare.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      refreshToken,
    })
    setTokens(data)
    return data.accessToken
  } catch {
    clearTokens()
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const status = error.response?.status
    const isAuthEndpoint = original?.url?.startsWith('/auth/')

    if (status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true
      refreshInFlight ??= performRefresh().finally(() => {
        refreshInFlight = null
      })
      const newAccessToken = await refreshInFlight

      if (newAccessToken) {
        original.headers.set('Authorization', `Bearer ${newAccessToken}`)
        return api(original)
      }

      // Refresh failed — session is gone. Route guards will bounce to /login
      // on the next navigation; nudge it now for a snappier redirect.
      const { router } = await import('../router')
      if (router.currentRoute.value.name !== 'login') {
        router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
      }
    }

    const body = error.response?.data?.error
    throw new ApiError(body?.message ?? error.message ?? 'Request failed', body?.code ?? 'NETWORK_ERROR', status ?? 0)
  }
)
