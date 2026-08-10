import type { ID } from './common'

export type TeamRole = 'member' | 'manager'

/** Shape returned by GET /teams (list) — no member profile data, just role lookup isn't included either. */
export interface TeamSummary {
  _id: ID
  name: string
  creatorId: ID
  members: Array<{ userId: ID; role: TeamRole; hourlyRate: number | null; joinedAt: string }>
  createdAt: string
  updatedAt: string
}

/** A team member enriched with identity fields — only available from GET /teams/:teamId. */
export interface TeamMember {
  userId: ID
  role: TeamRole
  hourlyRate: number | null
  joinedAt: string
  uid: string
  firstName: string
  lastName: string
  email: string
}

/** Shape returned by GET /teams/:teamId — members are populated with identity. */
export interface TeamDetail {
  _id: ID
  name: string
  creatorId: ID
  members: TeamMember[]
  createdAt: string
  updatedAt: string
}

/** Result of GET /teams/:teamId/search-user — minimal profile, no rate. */
export interface UserSearchResult {
  _id: ID
  uid: string
  firstName: string
  lastName: string
  email: string
}
