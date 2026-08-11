import type { ID } from './common'

export interface NotificationEntry {
  _id: ID
  userId: ID
  teamId: ID | null
  ruleType: string
  entityType: string
  entityId: ID | null
  title: string
  message: string
  read: boolean
  emailSent: boolean
  createdAt: string
}

export interface NotificationListResult {
  notifications: NotificationEntry[]
  total: number
  unreadCount: number
}

export type NotificationRuleScope = 'personal' | 'manager' | 'both'

export interface NotificationPreferenceEntry {
  ruleType: string
  label: string
  description: string
  scope: NotificationRuleScope
  enabled: boolean
  emailEnabled: boolean
  params: Record<string, number | string | boolean>
}

export interface NotificationPreferencesResult {
  preferences: NotificationPreferenceEntry[]
  emailAvailable: boolean
}
