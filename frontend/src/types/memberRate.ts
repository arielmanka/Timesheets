import type { ID } from './common'

/** A manager's rate override for one team member, scoped to a project or,
 * when taskId is set, to one specific task within it. See RB-11. */
export interface MemberRate {
  _id: ID
  teamId: ID
  projectId: ID
  taskId: ID | null
  userId: ID
  hourlyRate: number
  createdAt: string
  updatedAt: string
}
