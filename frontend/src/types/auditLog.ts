import type { ID } from './common'

export interface AuditLogEntry {
  _id: ID
  eventType: string
  entityType: string
  entityId: ID
  teamId: ID
  actorId: ID
  /** Denormalized context captured at write time (names, previous/new values, etc.), shape varies by eventType. */
  details: Record<string, unknown>
  timestamp: string
}

export interface AuditLogFilter {
  eventType?: string
  entityType?: string
  startDate?: string
  endDate?: string
  limit?: number
  skip?: number
}

export interface AuditLogResult {
  logs: AuditLogEntry[]
  total: number
}
