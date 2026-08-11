import { api } from './api'
import type { NotificationListResult, NotificationPreferencesResult } from '../types/notification'

export async function listNotifications(options: { unreadOnly?: boolean; limit?: number; skip?: number } = {}): Promise<NotificationListResult> {
  const { data } = await api.get<NotificationListResult>('/users/me/notifications', { params: options })
  return data
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await api.patch(`/users/me/notifications/${notificationId}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/users/me/notifications/read-all')
}

export async function getNotificationPreferences(): Promise<NotificationPreferencesResult> {
  const { data } = await api.get<NotificationPreferencesResult>('/users/me/notification-preferences')
  return data
}

export async function updateNotificationPreference(
  ruleType: string,
  input: { enabled?: boolean; emailEnabled?: boolean; params?: Record<string, number | string | boolean> }
): Promise<void> {
  await api.patch(`/users/me/notification-preferences/${ruleType}`, input)
}
